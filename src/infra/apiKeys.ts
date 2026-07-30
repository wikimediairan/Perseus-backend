export interface AuthenticatedUser {
	id: string;
	label: string | null;
	weeklyCostLimit: number;
}

export async function hashApiKey(plaintextKey: string): Promise<string> {
	const data = new TextEncoder().encode(plaintextKey);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function findActiveUserByPlaintextKey(
	db: D1Database,
	plaintextKey: string,
): Promise<AuthenticatedUser | null> {
	const keyHash = await hashApiKey(plaintextKey);

	const row = await db
		.prepare(`
			SELECT id, label, weekly_cost_limit AS weeklyCostLimit
			FROM api_keys
			WHERE key_hash = ? AND active = 1
		`)
		.bind(keyHash)
		.first<{ id: string; label: string | null; weeklyCostLimit: number }>();

	if (!row) {
		return null;
	}

	return {
		id: row.id,
		label: row.label,
		weeklyCostLimit: row.weeklyCostLimit,
	};
}
