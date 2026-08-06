import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execCommand = promisify(exec);

import { hashApiKey } from "@/repositories/apiKeys";

const DATABASE_NAME = "perseus-wikimedia-db";
const DEFAULT_WEEKLY_LIMIT = 0.16;

const label = process.argv[2];

if (!label) {
	console.error("Usage:");
	console.error("npm run create-key <label> [weeklyLimit]");
	process.exit(1);
}

const weeklyLimit = Number(process.argv[3] ?? DEFAULT_WEEKLY_LIMIT);

if (!Number.isFinite(weeklyLimit) || weeklyLimit < 0) {
	throw new Error("Invalid weekly limit.");
}

const id = randomUUID();

const secret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

const apiKey = `sk-persius-${secret}`;

const hash = await hashApiKey(apiKey);

const createdAt = new Date().toISOString();

const escapeSql = (value: string) => value.replaceAll("'", "''");

const sql = `
INSERT INTO api_keys (
	id,
	key_hash,
	label,
	active,
	weekly_cost_limit,
	created_at
)
VALUES (
	'${escapeSql(id)}',
	'${escapeSql(hash)}',
	'${escapeSql(label)}',
	1,
	${weeklyLimit},
	'${escapeSql(createdAt)}'
);
`;

const tempDir = await mkdtemp(join(tmpdir(), "perseus-"));
const sqlFile = join(tempDir, "create-api-key.sql");

try {
	await writeFile(sqlFile, sql);

	const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

	await execCommand(
		`${pnpm} exec wrangler d1 execute ${DATABASE_NAME} --remote --file "${sqlFile}"`,
	);

	console.log("✅ API Key created successfully.\n");

	console.log(`Label        : ${label}`);
	console.log(`Weekly limit : $${weeklyLimit}`);
	console.log(`Created at   : ${createdAt}\n`);

	console.log("API Key (save this now):");
	console.log(apiKey);
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
