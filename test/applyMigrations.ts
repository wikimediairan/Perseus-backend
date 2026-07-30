import { applyD1Migrations, env } from "cloudflare:test";

declare module "cloudflare:test" {
	interface ProvidedEnv {
		TEST_MIGRATIONS: Awaited<
			ReturnType<
				typeof import("@cloudflare/vitest-pool-workers/config").readD1Migrations
			>
		>;
	}
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
