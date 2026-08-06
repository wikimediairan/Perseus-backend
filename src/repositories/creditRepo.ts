export type CreditTransactionType =
	| "INITIAL"
	| "USAGE"
	| "INCREASE"
	| "RELEASE";

export interface CreditTransactionRow {
	id: string;
	userId: string;
	type: CreditTransactionType;
	amount: number;
	createdAt: string;
}

export async function recordCreditTransaction(
	db: D1Database,
	userId: string,
	type: CreditTransactionType,
	amount: number,
	now: Date = new Date(),
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO credit_transactions (id, user_id, type, amount, created_at) VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(crypto.randomUUID(), userId, type, amount, now.toISOString())
		.run();
}

export async function listCreditTransactionsForUser(
	db: D1Database,
	userId: string,
): Promise<CreditTransactionRow[]> {
	const { results } = await db
		.prepare(
			`SELECT id, user_id AS userId, type, amount, created_at AS createdAt
			 FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC`,
		)
		.bind(userId)
		.all<CreditTransactionRow>();
	return results ?? [];
}

export interface CreditQueueRow {
	id: string;
	userId: string;
	requestedAmount: number;
	createdAt: string;
	status: "pending" | "processed";
}

export async function enqueueCreditIncrease(
	db: D1Database,
	userId: string,
	requestedAmount: number,
	now: Date = new Date(),
): Promise<void> {
	await db
		.prepare(`
			INSERT INTO credit_queue (id, user_id, requested_amount, created_at, status)
			VALUES (?, ?, ?, ?, 'pending')
		`)
		.bind(crypto.randomUUID(), userId, requestedAmount, now.toISOString())
		.run();
}

export async function listPendingQueueEntries(
	db: D1Database,
): Promise<CreditQueueRow[]> {
	const { results } = await db
		.prepare(
			`SELECT id, user_id AS userId, requested_amount AS requestedAmount,
				created_at AS createdAt, status
			 FROM credit_queue WHERE status = 'pending' ORDER BY created_at ASC`,
		)
		.all<CreditQueueRow>();
	return results ?? [];
}

export async function markQueueEntryProcessed(
	db: D1Database,
	id: string,
): Promise<void> {
	await db
		.prepare(`UPDATE credit_queue SET status = 'processed' WHERE id = ?`)
		.bind(id)
		.run();
}

/** Whether a user already has a pending queue entry (avoid duplicate queueing). */
export async function hasPendingQueueEntry(
	db: D1Database,
	userId: string,
): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT 1 AS found FROM credit_queue WHERE user_id = ? AND status = 'pending' LIMIT 1`,
		)
		.bind(userId)
		.first<{ found: number }>();
	return row !== null;
}
