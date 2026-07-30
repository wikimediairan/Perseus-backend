import type { Chunk } from "@/translation/chunker";

export interface TranslatedUnit {
	nodeId: string;
	sourceText: string;
	translatedText: string;
}

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
