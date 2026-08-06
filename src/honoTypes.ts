import type { Env } from "@/config/env";
import type { AuthenticatedUser } from "@/repositories/apiKeys";
import type { QuotaStatus } from "@/repositories/quota";
import type { UserRow } from "@/repositories/usersRepo";

export interface HonoVariables {
	requestId: string;
	user: AuthenticatedUser;
	quotaStatus: QuotaStatus;
	sessionUser: UserRow;
}

export interface AppEnv {
	Bindings: Env;
	Variables: HonoVariables;
}
