import type { ModelId } from "@/constants/models";
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
	missingUnitIds: string[];
	usage?: TranslationUsage;
}

export async function translateChunk(
	translate: Translate,
	chunk: Chunk,
	serverPrompt: ServerPrompt,
	model: ModelId,
): Promise<ChunkTranslationResult> {
	const sourceText = renderChunkForTranslation(chunk);

	const result = await translate({
		systemPrompt: serverPrompt.prompt,
		sourceText,
		targetLanguage: serverPrompt.targetWikiCode,
		model,
	});

	const { units, missingUnitIds } = parseChunkTranslation(
		chunk,
		result.translatedText,
	);

	return { chunkId: chunk.id, units, missingUnitIds, usage: result.usage };
}
