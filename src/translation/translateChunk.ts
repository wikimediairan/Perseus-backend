import type { Translate, TranslationUsage } from "@/provider/openRouter";
import type { Chunk } from "@/translation/chunker";
import type { ServerPrompt } from "@/translation/prompt";
import {
	parseChunkTranslation,
	renderChunkForTranslation,
	type TranslatedUnit,
} from "@/translation/segmentProtocol";

export interface ChunkTranslationResult {
	chunkId: string;
	units: TranslatedUnit[];
	/** Node ids whose segment marker was missing from the provider's response — partial credit, not a whole-chunk failure. */
	missingUnitIds: string[];
	/** Provider-reported token usage for this call, when available. Used to increment quota with exact, not estimated, figures. */
	usage?: TranslationUsage;
}

/**
 * Translates one chunk: renders it to plain text, calls the provider,
 * and parses the response back into per-unit results. Throws on
 * transport/HTTP failure — callers are responsible for deciding whether
 * that fails the whole request or just this chunk.
 */
export async function translateChunk(
	translate: Translate,
	chunk: Chunk,
	serverPrompt: ServerPrompt,
): Promise<ChunkTranslationResult> {
	const sourceText = renderChunkForTranslation(chunk);

	const result = await translate({
		systemPrompt: serverPrompt.prompt,
		sourceText,
		targetLanguage: serverPrompt.targetWikiCode,
	});

	const { units, missingUnitIds } = parseChunkTranslation(
		chunk,
		result.translatedText,
	);

	return { chunkId: chunk.id, units, missingUnitIds, usage: result.usage };
}
