import {
	CREDIT_INCREMENT,
	FULL_USAGE_WEEKS_LIMIT,
	INITIAL_WEEKLY_CREDIT,
	LOW_USAGE_THRESHOLD,
	LOW_USAGE_WEEKS_LIMIT,
	MAX_WEEKLY_CREDIT,
	MONTHLY_BUDGET,
} from "@/constants/credit";
import {
	issueApiKeyForUser,
	setApiKeyActive,
	setApiKeyWeeklyLimit,
} from "@/repositories/apiKeysRepo";
import {
	enqueueCreditIncrease,
	hasPendingQueueEntry,
	listPendingQueueEntries,
	markQueueEntryProcessed,
	recordCreditTransaction,
} from "@/repositories/creditRepo";
import {
	createKeyRequest,
	decideKeyRequest,
	findKeyRequestById,
	findLatestKeyRequestForUser,
	type KeyRequestRow,
} from "@/repositories/keyRequestsRepo";
import { mondayOfWeekUtc } from "@/repositories/quota";
import { sumUsageBetween } from "@/repositories/usageRepo";
import {
	findUserById,
	listActiveUsers,
	setUserStatus,
	sumAllocatedWeeklyCredit,
	type UserRow,
	updateUserCreditState,
} from "@/repositories/usersRepo";
import { BackendError } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Pure rules -- no DB access, easy to unit test in isolation.
// ---------------------------------------------------------------------------

export interface UserCreditState {
	weeklyCredit: number;
	lowUsageWeeks: number;
	fullUsageWeeks: number;
}

export interface WeeklyEvaluationResult {
	weeklyCredit: number;
	lowUsageWeeks: number;
	fullUsageWeeks: number;
	disable: boolean;
	releasedCredit: number;
	increaseApplied: number;
	queuedIncrease: number;
}

// Floating point amounts are all multiples of a cent; use a small epsilon
// when comparing "used the whole credit" / "below threshold".
const EPSILON = 1e-9;

export function evaluateWeeklyUsage(
	state: UserCreditState,
	weeklyUsage: number,
	availableBudget: number,
): WeeklyEvaluationResult {
	const result: WeeklyEvaluationResult = {
		weeklyCredit: state.weeklyCredit,
		lowUsageWeeks: state.lowUsageWeeks,
		fullUsageWeeks: state.fullUsageWeeks,
		disable: false,
		releasedCredit: 0,
		increaseApplied: 0,
		queuedIncrease: 0,
	};

	const isLowUsage = weeklyUsage < LOW_USAGE_THRESHOLD - EPSILON;
	const isFullUsage = weeklyUsage >= state.weeklyCredit - EPSILON;

	if (isLowUsage) {
		result.lowUsageWeeks = state.lowUsageWeeks + 1;
		result.fullUsageWeeks = 0;

		if (result.lowUsageWeeks >= LOW_USAGE_WEEKS_LIMIT) {
			result.disable = true;
			result.releasedCredit = state.weeklyCredit;
			result.weeklyCredit = 0;
		}

		return result;
	}

	if (isFullUsage) {
		result.fullUsageWeeks = state.fullUsageWeeks + 1;
		result.lowUsageWeeks = 0;

		if (result.fullUsageWeeks >= FULL_USAGE_WEEKS_LIMIT) {
			// Streak requirement consumed either way: applied, queued, or
			// already at the cap.
			result.fullUsageWeeks = 0;

			const headroom = MAX_WEEKLY_CREDIT - state.weeklyCredit;
			if (headroom >= CREDIT_INCREMENT - EPSILON) {
				if (availableBudget >= CREDIT_INCREMENT - EPSILON) {
					result.weeklyCredit = state.weeklyCredit + CREDIT_INCREMENT;
					result.increaseApplied = CREDIT_INCREMENT;
				} else {
					result.queuedIncrease = CREDIT_INCREMENT;
				}
			}
		}

		return result;
	}

	// Partial usage: neither low nor full. Streaks reset.
	result.lowUsageWeeks = 0;
	result.fullUsageWeeks = 0;
	return result;
}

// ---------------------------------------------------------------------------
// Orchestration -- D1-backed.
// ---------------------------------------------------------------------------

export async function getAvailableBudget(db: D1Database): Promise<number> {
	const allocated = await sumAllocatedWeeklyCredit(db);
	return MONTHLY_BUDGET - allocated;
}

export async function requestApiKey(
	db: D1Database,
	user: UserRow,
): Promise<KeyRequestRow> {
	const latest = await findLatestKeyRequestForUser(db, user.id);

	if (latest?.status === "pending") {
		throw new BackendError(
			"ConflictError",
			"A key request is already pending review.",
		);
	}

	if (latest?.status === "approved" || user.status === "active") {
		throw new BackendError(
			"ConflictError",
			"Access has already been approved.",
		);
	}

	if (user.status === "rejected") {
		await setUserStatus(db, user.id, "pending");
	}

	return await createKeyRequest(db, user.id);
}

export async function approveKeyRequest(
	db: D1Database,
	requestId: string,
): Promise<{ plaintextKey: string }> {
	const request = await findKeyRequestById(db, requestId);

	if (!request) {
		throw new BackendError("NotFoundError", "Key request not found.");
	}
	if (request.status !== "pending") {
		throw new BackendError("ConflictError", "Key request already decided.");
	}

	const available = await getAvailableBudget(db);
	if (available < INITIAL_WEEKLY_CREDIT - EPSILON) {
		throw new BackendError(
			"ConflictError",
			"Insufficient community budget to approve this request.",
		);
	}

	const user = await findUserById(db, request.userId);
	if (!user) {
		throw new BackendError("NotFoundError", "User not found.");
	}

	await updateUserCreditState(db, user.id, {
		weeklyCredit: INITIAL_WEEKLY_CREDIT,
		lowUsageWeeks: 0,
		fullUsageWeeks: 0,
		status: "active",
	});

	const { plaintextKey } = await issueApiKeyForUser(
		db,
		user.id,
		user.wikimediaUsername,
		INITIAL_WEEKLY_CREDIT,
	);

	await recordCreditTransaction(db, user.id, "INITIAL", INITIAL_WEEKLY_CREDIT);
	await decideKeyRequest(db, requestId, "approved");

	return { plaintextKey };
}

export async function rejectKeyRequest(
	db: D1Database,
	requestId: string,
): Promise<void> {
	const request = await findKeyRequestById(db, requestId);

	if (!request) {
		throw new BackendError("NotFoundError", "Key request not found.");
	}
	if (request.status !== "pending") {
		throw new BackendError("ConflictError", "Key request already decided.");
	}

	await decideKeyRequest(db, requestId, "rejected");
	await setUserStatus(db, request.userId, "rejected");
}

/** Runs the weekly evaluation for every active user, then drains the credit
 * queue with whatever budget was freed up (e.g. from disabled users). */
export async function runWeeklyEvaluation(
	db: D1Database,
	now: Date = new Date(),
): Promise<void> {
	const thisMonday = mondayOfWeekUtc(now);
	const lastMonday = new Date(thisMonday);
	lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);

	const weekStartIso = lastMonday.toISOString();
	const weekEndIso = thisMonday.toISOString();

	let availableBudget = await getAvailableBudget(db);
	const users = await listActiveUsers(db);

	for (const user of users) {
		const weeklyUsage = await sumUsageBetween(
			db,
			user.id,
			weekStartIso,
			weekEndIso,
		);

		const result = evaluateWeeklyUsage(
			{
				weeklyCredit: user.weeklyCredit,
				lowUsageWeeks: user.lowUsageWeeks,
				fullUsageWeeks: user.fullUsageWeeks,
			},
			weeklyUsage,
			availableBudget,
		);

		await updateUserCreditState(db, user.id, {
			weeklyCredit: result.weeklyCredit,
			lowUsageWeeks: result.lowUsageWeeks,
			fullUsageWeeks: result.fullUsageWeeks,
			status: result.disable ? "disabled" : undefined,
		});

		if (result.disable) {
			await setApiKeyActive(db, user.id, false);
			await recordCreditTransaction(
				db,
				user.id,
				"RELEASE",
				result.releasedCredit,
			);
			availableBudget += result.releasedCredit;
		}

		if (result.increaseApplied > 0) {
			await setApiKeyWeeklyLimit(db, user.id, result.weeklyCredit);
			await recordCreditTransaction(
				db,
				user.id,
				"INCREASE",
				result.increaseApplied,
			);
			availableBudget -= result.increaseApplied;
		}

		if (
			result.queuedIncrease > 0 &&
			!(await hasPendingQueueEntry(db, user.id))
		) {
			await enqueueCreditIncrease(db, user.id, result.queuedIncrease);
		}
	}

	await processCreditQueue(db);
}

/** Drains credit_queue in FIFO order using whatever budget is currently
 * available, skipping entries that still don't fit. */
export async function processCreditQueue(db: D1Database): Promise<void> {
	let availableBudget = await getAvailableBudget(db);
	const entries = await listPendingQueueEntries(db);

	for (const entry of entries) {
		if (availableBudget < entry.requestedAmount - EPSILON) {
			continue;
		}

		const user = await findUserById(db, entry.userId);
		if (user?.status !== "active") {
			await markQueueEntryProcessed(db, entry.id);
			continue;
		}

		const newCredit = Math.min(
			user.weeklyCredit + entry.requestedAmount,
			MAX_WEEKLY_CREDIT,
		);
		const actualIncrease = newCredit - user.weeklyCredit;

		if (actualIncrease > EPSILON) {
			await updateUserCreditState(db, user.id, {
				weeklyCredit: newCredit,
				lowUsageWeeks: user.lowUsageWeeks,
				fullUsageWeeks: user.fullUsageWeeks,
			});
			await setApiKeyWeeklyLimit(db, user.id, newCredit);
			await recordCreditTransaction(db, user.id, "INCREASE", actualIncrease);
			availableBudget -= actualIncrease;
		}

		await markQueueEntryProcessed(db, entry.id);
	}
}
