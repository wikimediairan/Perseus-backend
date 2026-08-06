export interface QuotaStatus {
	weekStart: string;
	costUsed: number;
	weeklyLimitCost: number;
	remainingCost: number;
	resetsAt: string;
}

export function mondayOfWeekUtc(date: Date): Date {
	const d = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
	const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
	const diffToMonday = (day === 0 ? -6 : 1) - day;
	d.setUTCDate(d.getUTCDate() + diffToMonday);
	return d;
}

export function weekStartKey(date: Date): string {
	return mondayOfWeekUtc(date).toISOString().slice(0, 10);
}

export function nextResetIso(date: Date): string {
	const monday = mondayOfWeekUtc(date);
	const next = new Date(monday);
	next.setUTCDate(next.getUTCDate() + 7);
	return next.toISOString();
}

export async function getQuotaStatus(
	db: D1Database,
	userId: string,
	weeklyLimitCost: number,
	now: Date = new Date(),
): Promise<QuotaStatus> {
	const weekStart = weekStartKey(now);

	const row = await db
		.prepare(
			`SELECT cost_used AS costUsed FROM quota_usage WHERE user_id = ? AND week_start = ?`,
		)
		.bind(userId, weekStart)
		.first<{ costUsed: number }>();

	const costUsed = row?.costUsed ?? 0;

	return {
		weekStart,
		costUsed,
		weeklyLimitCost,
		remainingCost: Math.max(0, weeklyLimitCost - costUsed),
		resetsAt: nextResetIso(now),
	};
}

export async function recordQuotaUsage(
	db: D1Database,
	userId: string,
	cost: number,
	now: Date = new Date(),
): Promise<void> {
	const weekStart = weekStartKey(now);
	const nowIso = now.toISOString();

	await db
		.prepare(`
			INSERT INTO quota_usage (user_id, week_start, cost_used, chunks_translated, updated_at)
			VALUES (?, ?, ?, 1, ?)
			ON CONFLICT(user_id, week_start) DO UPDATE SET
			cost_used = cost_used + excluded.cost_used,
			chunks_translated = chunks_translated + 1,
			updated_at = excluded.updated_at
		`)
		.bind(userId, weekStart, cost, nowIso)
		.run();

	await db
		.prepare(
			`INSERT INTO usage_events (id, user_id, cost, created_at) VALUES (?, ?, ?, ?)`,
		)
		.bind(crypto.randomUUID(), userId, cost, nowIso)
		.run();
}
