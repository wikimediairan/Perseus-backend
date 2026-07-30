import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/infra/quota";

export const quotaRoute = new Hono<AppEnv>();

quotaRoute.get("/", async (c) => {
	const user = c.get("user");
	const status = await getQuotaStatus(c.env.DB, user.id, user.weeklyCostLimit);

	return c.json({
		weeklyLimitCost: status.weeklyLimitCost,
		usedCost: status.costUsed,
		remainingCost: status.remainingCost,
		resetsAt: status.resetsAt,
	});
});
