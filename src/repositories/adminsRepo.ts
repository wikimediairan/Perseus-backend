export interface AdminRow {
	id: string;
	wikimediaUserId: string;
	wikimediaUsername: string;
	createdAt: string;
	createdBy: string | null;
}

export async function findAdminByWikimediaUserId(
	db: D1Database,
	wikimediaUserId: string,
): Promise<AdminRow | null> {
	return await db
		.prepare(`
			SELECT
				id,
				wikimedia_user_id AS wikimediaUserId,
				wikimedia_username AS wikimediaUsername,
				created_at AS createdAt,
				created_by AS createdBy
			FROM admins WHERE wikimedia_user_id = ?
		`)
		.bind(wikimediaUserId)
		.first<AdminRow>();
}

export async function isWikimediaAdmin(
	db: D1Database,
	wikimediaUserId: string,
): Promise<boolean> {
	return (await findAdminByWikimediaUserId(db, wikimediaUserId)) !== null;
}

export async function addAdmin(
	db: D1Database,
	params: {
		wikimediaUserId: string;
		wikimediaUsername: string;
		createdBy?: string | null;
	},
): Promise<AdminRow> {
	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();

	await db
		.prepare(`
			INSERT INTO admins (id, wikimedia_user_id, wikimedia_username, created_at, created_by)
			VALUES (?, ?, ?, ?, ?)
		`)
		.bind(
			id,
			params.wikimediaUserId,
			params.wikimediaUsername,
			createdAt,
			params.createdBy ?? null,
		)
		.run();

	return {
		id,
		wikimediaUserId: params.wikimediaUserId,
		wikimediaUsername: params.wikimediaUsername,
		createdAt,
		createdBy: params.createdBy ?? null,
	};
}

export async function removeAdmin(
	db: D1Database,
	wikimediaUserId: string,
): Promise<void> {
	await db
		.prepare(`DELETE FROM admins WHERE wikimedia_user_id = ?`)
		.bind(wikimediaUserId)
		.run();
}
