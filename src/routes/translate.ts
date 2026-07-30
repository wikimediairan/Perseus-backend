import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { getQuotaStatus } from "@/infra/quota";
import { translateRequestSchema } from "@/schema/translateRequest";
import { PerseusError } from "@/shared/errors";
import { RequestLogger } from "@/shared/logger";
import { handleTranslateRequest } from "@/translation/handleTranslateRequest";

export const translateRoute = new Hono<AppEnv>();

translateRoute.post("/", async (c) => {
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
		user.weeklyTokenLimit,
	);

	return c.json({
		source: result.source,
		targetWiki: result.targetWiki,
		totalChunks: result.totalChunks,
		translated: result.translated,
		failed: result.failed,
		skipped: result.skipped,
		quota: {
			remainingTokens: finalStatus.remainingTokens,
			resetsAt: finalStatus.resetsAt,
		},
	});
});
