import type { Env } from "@/config/env";
import type { UserStatus } from "@/repositories/usersRepo";
import { sha256Hex } from "@/shared/tokens";

export interface SeedUserOptions {
	id: string;
	wikimediaUserId: string;
	wikimediaUsername: string;
	status?: UserStatus;
	weeklyCredit?: number;
	lowUsageWeeks?: number;
	fullUsageWeeks?: number;
}

export async function seedUser(env: Env, opts: SeedUserOptions): Promise<void> {
	const nowIso = new Date().toISOString();

	await env.DB.prepare(`
		INSERT INTO users (
			id, wikimedia_user_id, wikimedia_username, status,
			weekly_credit, low_usage_weeks, full_usage_weeks, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
		.bind(
			opts.id,
			opts.wikimediaUserId,
			opts.wikimediaUsername,
			opts.status ?? "pending",
			opts.weeklyCredit ?? 0,
			opts.lowUsageWeeks ?? 0,
			opts.fullUsageWeeks ?? 0,
			nowIso,
			nowIso,
		)
		.run();
}

/** Seeds a valid session row and returns the plaintext token to send back
 * as the `perseus_session` cookie. */
export async function seedSession(
	env: Env,
	userId: string,
	plaintextToken: string,
): Promise<void> {
	const tokenHash = await sha256Hex(plaintextToken);
	const nowIso = new Date().toISOString();
	const expiresAt = new Date(Date.now() + 60_000).toISOString();

	await env.DB.prepare(
		`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
	)
		.bind(tokenHash, userId, nowIso, expiresAt)
		.run();
}
