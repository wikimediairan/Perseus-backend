import { z } from "@hono/zod-openapi";

export const healthResponse = z.object({
	status: z.literal("ok"),
});

export type HealthSchemaType = z.infer<typeof healthResponse>;
