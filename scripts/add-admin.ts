import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execCommand = promisify(exec);

const DATABASE_NAME = "perseus-wikimedia-db";

const wikimediaUserId = process.argv[2];
const wikimediaUsername = process.argv[3];
const target = process.argv[4] === "--local" ? "--local" : "--remote";

if (!wikimediaUserId || !wikimediaUsername) {
	console.error("Usage:");
	console.error(
		"pnpm run admin:add <wikimediaUserId> <wikimediaUsername> [--local]",
	);
	console.error("");
	console.error(
		"wikimediaUserId is the numeric Wikimedia OAuth `sub` -- NOT the",
	);
	console.error(
		"username, since usernames can change. Find it by having the person",
	);
	console.error(
		"log in once as a normal user, then reading users.wikimedia_user_id",
	);
	console.error("for their row (e.g. via `wrangler d1 execute ... --command");
	console.error(
		"\"SELECT wikimedia_user_id FROM users WHERE wikimedia_username = '...'\"`),",
	);
	console.error(
		"or from the Wikimedia OAuth `sub` claim directly if you have it.",
	);
	process.exit(1);
}

const id = randomUUID();
const createdAt = new Date().toISOString();

const escapeSql = (value: string) => value.replaceAll("'", "''");

const sql = `
INSERT INTO admins (
	id,
	wikimedia_user_id,
	wikimedia_username,
	created_at,
	created_by
)
VALUES (
	'${escapeSql(id)}',
	'${escapeSql(wikimediaUserId)}',
	'${escapeSql(wikimediaUsername)}',
	'${escapeSql(createdAt)}',
	NULL
)
ON CONFLICT(wikimedia_user_id) DO UPDATE SET
	wikimedia_username = excluded.wikimedia_username;
`;

const tempDir = await mkdtemp(join(tmpdir(), "perseus-"));
const sqlFile = join(tempDir, "add-admin.sql");

try {
	await writeFile(sqlFile, sql);

	const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

	await execCommand(
		`${pnpm} exec wrangler d1 execute ${DATABASE_NAME} ${target} --file "${sqlFile}"`,
	);

	console.log("✅ Admin access granted.\n");
	console.log(`Wikimedia user id : ${wikimediaUserId}`);
	console.log(`Wikimedia username: ${wikimediaUsername}`);
	console.log(`Granted at        : ${createdAt}`);
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
