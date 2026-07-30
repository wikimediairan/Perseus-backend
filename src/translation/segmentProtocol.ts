/**
 * The render/parse pair for turning a Chunk into translatable text and
 * back. A chunk's units are combined into one piece of text using
 * numbered `[[SEGMENT n]]` markers, so several short paragraphs can be
 * translated together in one round trip while staying individually
 * addressable on the way back.
 */

import type { Chunk } from "@/translation/chunker";

/** The translated result for one translation unit — text only, no structural editing. */
export interface TranslatedUnit {
	nodeId: string;
	sourceText: string;
	translatedText: string;
}

/** Renders a Chunk as one piece of plain text — the LLM request body. */
export function renderChunkForTranslation(chunk: Chunk): string {
	return chunk.units
		.map((unit, i) => `[[SEGMENT ${i + 1}]]\n${unit.sourceText}`)
		.join("\n\n");
}

const SEGMENT_PATTERN =
	/\[\[SEGMENT (\d+)\]\]\s*([\s\S]*?)(?=\[\[SEGMENT \d+\]\]|$)/g;

function parseSegmentedText(responseText: string): Map<number, string> {
	const result = new Map<number, string>();

	for (const match of responseText.matchAll(SEGMENT_PATTERN)) {
		const n = Number(match[1]);
		const text = match[2].trim();
		if (text) {
			result.set(n, text);
		}
	}

	return result;
}

/**
 * Parses a chunk's translated response back into per-unit translated
 * text, matched by segment number. Segments the response is missing are
 * reported in `missingUnitIds` rather than treated as an all-or-nothing
 * failure, so a slightly mangled response still gets partial credit for
 * the segments that did come back correctly.
 */
export function parseChunkTranslation(
	chunk: Chunk,
	responseText: string,
): { units: TranslatedUnit[]; missingUnitIds: string[] } {
	const parsed = parseSegmentedText(responseText);
	const units: TranslatedUnit[] = [];
	const missingUnitIds: string[] = [];

	chunk.units.forEach((unit, index) => {
		const translated = parsed.get(index + 1);

		if (translated) {
			units.push({
				nodeId: unit.nodeId,
				sourceText: unit.sourceText,
				translatedText: translated,
			});
		} else {
			missingUnitIds.push(unit.nodeId);
		}
	});

	return { units, missingUnitIds };
}
