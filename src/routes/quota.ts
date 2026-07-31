import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/infra/quota";

export const quotaRoute = new OpenAPIHono<AppEnv>();

const QuotaResponseSchema = z.object({
	weeklyLimitCost: z.number(),
	usedCost: z.number(),
	remainingCost: z.number(),
	resetsAt: z.iso.datetime(),
});

const getQuota = createRoute({
	method: "get",
	path: "/",
	security: [{ bearerAuth: [] }],
	summary: "Get current API quota",
	description: "Returns the authenticated user's current weekly quota usage.",
	tags: ["Quota"],
	responses: {
		200: {
			description: "Quota information",
			content: {
				"application/json": {
					schema: QuotaResponseSchema,
				},
			},
		},
	},
});

quotaRoute.openapi(getQuota, async (c) => {
	const user = c.get("user");
	const status = await getQuotaStatus(c.env.DB, user.id, user.weeklyCostLimit);

	return c.json({
		weeklyLimitCost: status.weeklyLimitCost,
		usedCost: status.costUsed,
		remainingCost: status.remainingCost,
		resetsAt: status.resetsAt,
	});
});
