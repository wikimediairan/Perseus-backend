import path from "node:path";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		resolve: {
			alias: {
				"@": path.join(__dirname, "src"),
			},
		},
		test: {
			setupFiles: ["./test/applyMigrations.ts"],
			poolOptions: {
				workers: {
					wrangler: { configPath: "./wrangler.toml" },
					miniflare: {
						bindings: {
							OPENROUTER_API_KEY: "sk-test-not-a-real-key",
							PUBLIC_BASE_URL: "http://localhost:8787",
							WIKIMEDIA_CONSUMER_KEY: "test-wikimedia-token",
							WIKIMEDIA_CONSUMER_SECRET: "test-wikimedia-secret",
							TEST_MIGRATIONS: migrations,
						},
					},
				},
			},
		},
	};
});
