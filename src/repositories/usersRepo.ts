export type UserStatus = "pending" | "active" | "disabled" | "rejected";

export interface UserRow {
	id: string;
	wikimediaUserId: string;
	wikimediaUsername: string;
	status: UserStatus;
	weeklyCredit: number;
	lowUsageWeeks: number;
	fullUsageWeeks: number;
	createdAt: string;
	updatedAt: string;
}

const SELECT_COLUMNS = `
	id,
	wikimedia_user_id AS wikimediaUserId,
	wikimedia_username AS wikimediaUsername,
	status,
	weekly_credit AS weeklyCredit,
	low_usage_weeks AS lowUsageWeeks,
	full_usage_weeks AS fullUsageWeeks,
	created_at AS createdAt,
	updated_at AS updatedAt
`;

export async function findUserById(
	db: D1Database,
	id: string,
): Promise<UserRow | null> {
	return await db
		.prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`)
		.bind(id)
		.first<UserRow>();
}

export async function findUserByWikimediaId(
	db: D1Database,
	wikimediaUserId: string,
): Promise<UserRow | null> {
	return await db
		.prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE wikimedia_user_id = ?`)
		.bind(wikimediaUserId)
		.first<UserRow>();
}

export async function upsertWikimediaUser(
	db: D1Database,
	params: { wikimediaUserId: string; wikimediaUsername: string },
): Promise<UserRow> {
	const existing = await findUserByWikimediaId(db, params.wikimediaUserId);
	if (existing) {
		const nowIso = new Date().toISOString();
		// Wikimedia usernames can change; keep it current on every login.
		await db
			.prepare(
				`UPDATE users SET wikimedia_username = ?, updated_at = ? WHERE id = ?`,
			)
			.bind(params.wikimediaUsername, nowIso, existing.id)
			.run();
		return { ...existing, wikimediaUsername: params.wikimediaUsername };
	}

	const id = crypto.randomUUID();
	const nowIso = new Date().toISOString();

	await db
		.prepare(`
			INSERT INTO users (
				id, wikimedia_user_id, wikimedia_username, status,
				weekly_credit, low_usage_weeks, full_usage_weeks,
				created_at, updated_at
			)
			VALUES (?, ?, ?, 'pending', 0, 0, 0, ?, ?)
		`)
		.bind(id, params.wikimediaUserId, params.wikimediaUsername, nowIso, nowIso)
		.run();

	return {
		id,
		wikimediaUserId: params.wikimediaUserId,
		wikimediaUsername: params.wikimediaUsername,
		status: "pending",
		weeklyCredit: 0,
		lowUsageWeeks: 0,
		fullUsageWeeks: 0,
		createdAt: nowIso,
		updatedAt: nowIso,
	};
}

export async function setUserStatus(
	db: D1Database,
	userId: string,
	status: UserStatus,
): Promise<void> {
	await db
		.prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`)
		.bind(status, new Date().toISOString(), userId)
		.run();
}

export async function updateUserCreditState(
	db: D1Database,
	userId: string,
	params: {
		weeklyCredit: number;
		lowUsageWeeks: number;
		fullUsageWeeks: number;
		status?: UserStatus;
	},
): Promise<void> {
	await db
		.prepare(`
			UPDATE users
			SET weekly_credit = ?, low_usage_weeks = ?, full_usage_weeks = ?,
				status = COALESCE(?, status), updated_at = ?
			WHERE id = ?
		`)
		.bind(
			params.weeklyCredit,
			params.lowUsageWeeks,
			params.fullUsageWeeks,
			params.status ?? null,
			new Date().toISOString(),
			userId,
		)
		.run();
}

export async function listActiveUsers(db: D1Database): Promise<UserRow[]> {
	const { results } = await db
		.prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE status = 'active'`)
		.all<UserRow>();
	return results ?? [];
}

export async function sumAllocatedWeeklyCredit(
	db: D1Database,
): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COALESCE(SUM(weekly_credit), 0) AS total FROM users WHERE status = 'active'`,
		)
		.first<{ total: number }>();
	return row?.total ?? 0;
}
