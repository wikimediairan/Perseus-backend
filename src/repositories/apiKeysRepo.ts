import { hashApiKey } from "@/repositories/apiKeys";
import { generateToken } from "@/shared/tokens";

/**
 * Issues a new Perseus API key for an approved community user. The
 * api_keys.id is deliberately set equal to the user's id: every existing
 * quota/auth code path already keys everything off api_keys.id, so this
 * gives usage_events, credit_transactions, etc. a single consistent
 * identity with no joins required.
 */
export async function issueApiKeyForUser(
	db: D1Database,
	userId: string,
	label: string,
	weeklyCostLimit: number,
): Promise<{ plaintextKey: string }> {
	const plaintextKey = `sk-persius-${generateToken(24)}`;
	const keyHash = await hashApiKey(plaintextKey);

	await db
		.prepare(`
			INSERT INTO api_keys (id, key_hash, label, active, weekly_cost_limit, created_at, user_id)
			VALUES (?, ?, ?, 1, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				key_hash = excluded.key_hash,
				active = 1,
				weekly_cost_limit = excluded.weekly_cost_limit
		`)
		.bind(
			userId,
			keyHash,
			label,
			weeklyCostLimit,
			new Date().toISOString(),
			userId,
		)
		.run();

	return { plaintextKey };
}

export async function setApiKeyActive(
	db: D1Database,
	userId: string,
	active: boolean,
): Promise<void> {
	await db
		.prepare(`UPDATE api_keys SET active = ?, revoked_at = ? WHERE id = ?`)
		.bind(active ? 1 : 0, active ? null : new Date().toISOString(), userId)
		.run();
}

export async function setApiKeyWeeklyLimit(
	db: D1Database,
	userId: string,
	weeklyCostLimit: number,
): Promise<void> {
	await db
		.prepare(`UPDATE api_keys SET weekly_cost_limit = ? WHERE id = ?`)
		.bind(weeklyCostLimit, userId)
		.run();
}
