import type { Env } from "@/config/env";
import type { AuthenticatedUser } from "@/infra/apiKeys";
import { getQuotaStatus, recordQuotaUsage } from "@/infra/quota";
import { createOpenRouterTranslate } from "@/provider/openRouter";
import { PerseusError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import { type Chunk, chunkTranslationUnits } from "@/translation/chunker";
import { resolveModel } from "@/translation/model";
import { buildServerPrompt } from "@/translation/prompt";
import type { TranslatedUnit } from "@/translation/segmentProtocol";
import { translateChunk } from "@/translation/translateChunk";
import {
	type ArticleSourceRef,
	loadArticleTranslationUnits,
} from "@/wikimedia/loadArticleUnits";

export interface TranslateRequestInput {
	source: ArticleSourceRef;
	chunk: string;
	targetWiki: string;
	model: string;
}

export interface TranslatedChunkOut {
	chunkId: string;
	units: TranslatedUnit[];
}

export interface FailedChunkOut {
	chunkId: string;
	reason: "provider_error";
}

export interface SkippedChunkOut {
	chunkId: string;
	reason: "quota_exhausted";
}

export interface TranslateResult {
	source: ArticleSourceRef;
	targetWiki: string;
	totalChunks: number;
	translated: TranslatedChunkOut[];
	failed: FailedChunkOut[];
	skipped: SkippedChunkOut[];
}

function resolveChunkPlan(chunks: Chunk[], requestedChunk: string): Chunk[] {
	if (requestedChunk === "all") {
		return chunks;
	}

	const match = chunks.find((c) => c.id === requestedChunk);

	if (!match) {
		throw new PerseusError(
			"InputError",
			`Unknown chunk id "${requestedChunk}".`,
			{ stage: "chunking", context: { notFound: true } },
		);
	}

	return [match];
}

export async function handleTranslateRequest(
	env: Env,
	logger: Logger,
	user: AuthenticatedUser,
	input: TranslateRequestInput,
): Promise<TranslateResult> {
	const units = await loadArticleTranslationUnits(input.source, logger);
	const chunks = chunkTranslationUnits(units);
	const plan = resolveChunkPlan(chunks, input.chunk);

	const serverPrompt = buildServerPrompt(input.targetWiki);
	const model = resolveModel(input.model);
	const translate = createOpenRouterTranslate(env);

	const translated: TranslatedChunkOut[] = [];
	const failed: FailedChunkOut[] = [];
	const skipped: SkippedChunkOut[] = [];

	for (const chunk of plan) {
		const status = await getQuotaStatus(env.DB, user.id, user.weeklyCostLimit);

		if (status.remainingCost <= 0) {
			skipped.push({ chunkId: chunk.id, reason: "quota_exhausted" });
			logger.info("Chunk skipped: quota exhausted", { chunkId: chunk.id });
			continue;
		}

		try {
			const result = await translateChunk(
				translate,
				chunk,
				serverPrompt,
				model,
			);
			translated.push({ chunkId: result.chunkId, units: result.units });

			if (result.missingUnitIds.length > 0) {
				logger.warn(
					"Chunk translated with some units missing from the response",
					{ chunkId: chunk.id, missingUnitCount: result.missingUnitIds.length },
				);
			}

			if (result.usage && typeof result.usage.cost === "number") {
				await recordQuotaUsage(env.DB, user.id, result.usage.cost);
			} else {
				logger.error(
					"Provider response had no usage cost; quota not incremented for this chunk",
					{ chunkId: chunk.id },
				);
			}
		} catch (err) {
			if (err instanceof PerseusError && err.category === "ProviderError") {
				failed.push({ chunkId: chunk.id, reason: "provider_error" });
				logger.warn("Chunk translation failed (provider error)", {
					chunkId: chunk.id,
					stage: err.stage,
				});
				continue; // do NOT fail the entire request for a per-chunk provider error
			}
			// Any other error (e.g. misconfiguration) is a whole-request failure.
			throw err;
		}
	}

	return {
		source: input.source,
		targetWiki: serverPrompt.targetWikiCode,
		totalChunks: chunks.length,
		translated,
		failed,
		skipped,
	};
}
