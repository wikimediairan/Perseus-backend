import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/infra/quota";
import { BackendError } from "@/shared/errors";

export const quotaMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
	const user = c.get("user");
	const status = await getQuotaStatus(c.env.DB, user.id, user.weeklyCostLimit);
	c.set("quotaStatus", status);

	if (status.remainingCost <= 0) {
		throw new BackendError(
			"QuotaExceededError",
			"Weekly quota already exhausted.",
			{ resetsAt: status.resetsAt },
		);
	}

	await next();
};
