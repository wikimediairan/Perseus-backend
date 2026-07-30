import type { Env } from "@/config/env";

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {}
}
