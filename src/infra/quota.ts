export interface QuotaStatus {
	weekStart: string;
	tokensUsed: number;
	weeklyLimitTokens: number;
	remainingTokens: number;
	resetsAt: string; // ISO 8601, next Monday 00:00 UTC
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
	weeklyLimitTokens: number,
	now: Date = new Date(),
): Promise<QuotaStatus> {
	const weekStart = weekStartKey(now);

	const row = await db
		.prepare(
			`SELECT tokens_used AS tokensUsed FROM quota_usage WHERE user_id = ? AND week_start = ?`,
		)
		.bind(userId, weekStart)
		.first<{ tokensUsed: number }>();

	const tokensUsed = row?.tokensUsed ?? 0;

	return {
		weekStart,
		tokensUsed,
		weeklyLimitTokens,
		remainingTokens: Math.max(0, weeklyLimitTokens - tokensUsed),
		resetsAt: nextResetIso(now),
	};
}

export async function recordQuotaUsage(
	db: D1Database,
	userId: string,
	tokensUsed: number,
	estimatedCostUsd: number,
	now: Date = new Date(),
): Promise<void> {
	const weekStart = weekStartKey(now);
	const nowIso = now.toISOString();

	await db
		.prepare(
			`INSERT INTO quota_usage (user_id, week_start, tokens_used, estimated_cost_usd, chunks_translated, updated_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(user_id, week_start) DO UPDATE SET
           tokens_used = tokens_used + excluded.tokens_used,
           estimated_cost_usd = estimated_cost_usd + excluded.estimated_cost_usd,
           chunks_translated = chunks_translated + 1,
           updated_at = excluded.updated_at`,
		)
		.bind(userId, weekStart, tokensUsed, estimatedCostUsd, nowIso)
		.run();
}
