export type KeyRequestStatus = "pending" | "approved" | "rejected";

export interface KeyRequestRow {
	id: string;
	userId: string;
	status: KeyRequestStatus;
	requestedAt: string;
	decidedAt: string | null;
}

const SELECT_COLUMNS = `
	id,
	user_id AS userId,
	status,
	requested_at AS requestedAt,
	decided_at AS decidedAt
`;

export async function findLatestKeyRequestForUser(
	db: D1Database,
	userId: string,
): Promise<KeyRequestRow | null> {
	return await db
		.prepare(
			`SELECT ${SELECT_COLUMNS} FROM key_requests WHERE user_id = ? ORDER BY requested_at DESC LIMIT 1`,
		)
		.bind(userId)
		.first<KeyRequestRow>();
}

export async function createKeyRequest(
	db: D1Database,
	userId: string,
): Promise<KeyRequestRow> {
	const id = crypto.randomUUID();
	const requestedAt = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO key_requests (id, user_id, status, requested_at) VALUES (?, ?, 'pending', ?)`,
		)
		.bind(id, userId, requestedAt)
		.run();

	return { id, userId, status: "pending", requestedAt, decidedAt: null };
}

export async function findKeyRequestById(
	db: D1Database,
	id: string,
): Promise<KeyRequestRow | null> {
	return await db
		.prepare(`SELECT ${SELECT_COLUMNS} FROM key_requests WHERE id = ?`)
		.bind(id)
		.first<KeyRequestRow>();
}

export async function decideKeyRequest(
	db: D1Database,
	id: string,
	status: "approved" | "rejected",
): Promise<void> {
	await db
		.prepare(`UPDATE key_requests SET status = ?, decided_at = ? WHERE id = ?`)
		.bind(status, new Date().toISOString(), id)
		.run();
}
