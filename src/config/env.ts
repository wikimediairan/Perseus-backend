export interface Env {
	DB: D1Database;
	OPENROUTER_MODEL: string;
	DEFAULT_WEEKLY_TOKEN_LIMIT: string;
	OPENROUTER_COST_PER_1K_TOKENS_USD?: string;
	OPENROUTER_API_KEY: string;
}

export function estimateCostUsd(env: Env, totalTokens: number): number {
	const perThousand = Number(env.OPENROUTER_COST_PER_1K_TOKENS_USD ?? "0");
	if (!Number.isFinite(perThousand) || perThousand < 0) {
		return 0;
	}
	return (totalTokens / 1000) * perThousand;
}
