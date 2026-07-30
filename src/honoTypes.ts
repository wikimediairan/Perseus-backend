import type { Env } from "@/config/env";
import type { AuthenticatedUser } from "@/infra/apiKeys";
import type { QuotaStatus } from "@/infra/quota";

export interface HonoVariables {
	requestId: string;
	user: AuthenticatedUser;
	quotaStatus: QuotaStatus;
}

export interface AppEnv {
	Bindings: Env;
	Variables: HonoVariables;
}
