import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/infra/quota";
import { translateRequestSchema } from "@/schema/translateRequest";
import { PerseusError } from "@/shared/errors";
import { RequestLogger } from "@/shared/logger";
import { handleTranslateRequest } from "@/translation/handleTranslateRequest";

export const translateRoute = new OpenAPIHono<AppEnv>();

const TranslateResponseSchema = z.object({
	source: z.object({
		wiki: z.string(),
		pageId: z.number(),
		revisionId: z.number(),
	}),
	targetWiki: z.enum(["fa", "tj"]),
	totalChunks: z.number(),
	translated: z.array(z.unknown()),
	failed: z.array(z.unknown()),
	skipped: z.array(z.unknown()),
	quota: z.object({
		remainingCost: z.number(),
		resetsAt: z.iso.datetime(),
	}),
});

const translate = createRoute({
	method: "post",
	path: "/",
	security: [{ bearerAuth: [] }],
	tags: ["Translation"],
	summary: "Translate Wikipedia article chunks",
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: translateRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Translation completed",
			content: {
				"application/json": {
					schema: TranslateResponseSchema,
				},
			},
		},
		400: {
			description: "Invalid request",
		},
		401: {
			description: "Unauthorized",
		},
		429: {
			description: "Quota exceeded",
		},
	},
});

translateRoute.openapi(translate, async (c) => {
	const requestId = c.get("requestId");
	const user = c.get("user");

	const json = await c.req.json().catch(() => undefined);
	const parsed = translateRequestSchema.safeParse(json);

	if (!parsed.success) {
		throw new PerseusError(
			"InputError",
			`Invalid request body: ${parsed.error.message}`,
		);
	}

	const logger = new RequestLogger(requestId);
	const result = await handleTranslateRequest(c.env, logger, user, parsed.data);

	const finalStatus = await getQuotaStatus(
		c.env.DB,
		user.id,
		user.weeklyCostLimit,
	);

	return c.json({
		source: result.source,
		targetWiki: result.targetWiki,
		totalChunks: result.totalChunks,
		translated: result.translated,
		failed: result.failed,
		skipped: result.skipped,
		quota: {
			remainingCost: finalStatus.remainingCost,
			resetsAt: finalStatus.resetsAt,
		},
	});
});
