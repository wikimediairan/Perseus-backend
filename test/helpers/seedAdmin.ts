import type { Env } from "@/config/env";

export async function seedAdmin(
	env: Env,
	wikimediaUserId: string,
	wikimediaUsername: string,
): Promise<void> {
	await env.DB.prepare(`
		INSERT INTO admins (id, wikimedia_user_id, wikimedia_username, created_at, created_by)
		VALUES (?, ?, ?, ?, NULL)
	`)
		.bind(
			crypto.randomUUID(),
			wikimediaUserId,
			wikimediaUsername,
			new Date().toISOString(),
		)
		.run();
}
