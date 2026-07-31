import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "@/honoTypes";

export const healthRoute = new OpenAPIHono<AppEnv>();

const HealthSchema = z.object({
	status: z.literal("ok"),
});

const health = createRoute({
	method: "get",
	path: "/",
	tags: ["System"],
	summary: "Health check",
	description: "Returns the health status of the service.",
	responses: {
		200: {
			description: "Service is healthy.",
			content: {
				"application/json": {
					schema: HealthSchema,
				},
			},
		},
	},
});

healthRoute.openapi(health, (c) => {
	return c.json({
		status: "ok",
	});
});
