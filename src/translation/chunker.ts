import { DEFAULT_MAX_CHUNK_CHARS } from "@/constants/chunking";
import type { TranslationUnit } from "@/wikimedia/extractTranslatableText";

export interface Chunk {
	id: string;
	units: TranslationUnit[];
}

/**
 * Groups translation units into chunks bounded by a character budget, so
 * a single LLM request stays within a reasonable context size. A unit is
 * never split across chunks.
 */
export function chunkTranslationUnits(
	units: TranslationUnit[],
	maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): Chunk[] {
	const chunks: Chunk[] = [];
	let current: TranslationUnit[] = [];
	let currentSize = 0;
	let chunkIndex = 0;

	const flush = () => {
		if (current.length > 0) {
			chunks.push({ id: `chunk-${++chunkIndex}`, units: current });
			current = [];
			currentSize = 0;
		}
	};

	for (const unit of units) {
		const size = unit.sourceText.length;

		if (current.length > 0 && currentSize + size > maxChunkChars) {
			flush();
		}

		current.push(unit);
		currentSize += size;
	}

	flush();
	return chunks;
}
