import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/infra/quota";

export const quotaRoute = new Hono<AppEnv>();

quotaRoute.get("/", async (c) => {
	const user = c.get("user");
	const status = await getQuotaStatus(c.env.DB, user.id, user.weeklyTokenLimit);

	return c.json({
		weeklyLimitTokens: status.weeklyLimitTokens,
		usedTokens: status.tokensUsed,
		remainingTokens: status.remainingTokens,
		resetsAt: status.resetsAt,
	});
});
