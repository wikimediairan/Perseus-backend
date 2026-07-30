import type { Env } from "@/config/env";
import { hashApiKey } from "@/infra/apiKeys";

export interface SeedApiKeyOptions {
	id: string;
	plaintextKey: string;
	weeklyCostLimit: number;
	active?: boolean;
	label?: string;
}

export async function seedApiKey(
	env: Env,
	opts: SeedApiKeyOptions,
): Promise<void> {
	const keyHash = await hashApiKey(opts.plaintextKey);

	await env.DB.prepare(
		`INSERT INTO api_keys (id, key_hash, label, active, weekly_cost_limit, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			opts.id,
			keyHash,
			opts.label ?? null,
			opts.active === false ? 0 : 1,
			opts.weeklyCostLimit,
			new Date().toISOString(),
		)
		.run();
}
