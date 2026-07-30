import { PerseusError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import { buildCitationRegistry } from "@/wikimedia/citations";
import { flattenToPlaceholderText } from "@/wikimedia/placeholders";

export interface TranslationUnit {
	nodeId: string;
	sourceText: string;
}

const TRANSLATABLE_BLOCK_SELECTOR =
	"p, li, dd, dt, th, td, h1, h2, h3, h4, h5, h6, blockquote, figcaption";

// Matches strings with no meaningful letter content (pure numbers, punctuation, or placeholder tokens only)
const NO_LETTERS = /^\P{L}*$/u;

function isInsideProtectedRegion(el: Element): boolean {
	let node: null | Element = el;

	while (node) {
		const typeofAttr = node.getAttribute("typeof") || "";

		if (
			typeofAttr
				.split(/\s+/)
				.some(
					(t) =>
						t.startsWith("mw:Transclusion") || t.startsWith("mw:Extension/ref"),
				)
		) {
			return true;
		}

		node = node.parentElement;
	}

	return false;
}

// Extracts translatable text units from Parsoid-rendered HTML, preserving protected markup as placeholders.
export function extractTranslatableText(
	html: string,
	logger?: Logger,
): TranslationUnit[] {
	const document = new DOMParser().parseFromString(
		`<div id="perseus-root">${html}</div>`,
		"text/html",
	);
	const root = document.getElementById("perseus-root");

	if (!root) {
		throw new PerseusError(
			"ParsingError",
			"Parsoid returned content that could not be parsed as HTML.",
			{ stage: "parse-with-parsoid" },
		);
	}

	const citations = buildCitationRegistry(root);
	if (logger) {
		citations.flushWarningsTo(logger);
	}

	const units: TranslationUnit[] = [];
	let textIdCounter = 0;

	for (const block of root.querySelectorAll(TRANSLATABLE_BLOCK_SELECTOR)) {
		if (isInsideProtectedRegion(block)) {
			continue;
		}

		if (block.querySelector(TRANSLATABLE_BLOCK_SELECTOR)) {
			continue;
		}

		const text = flattenToPlaceholderText(block, citations);
		const withoutPlaceholderTokens = text.replaceAll(/\u27EA\/?\d+\u27EB/g, "");

		if (
			!withoutPlaceholderTokens.trim() ||
			NO_LETTERS.test(withoutPlaceholderTokens)
		) {
			continue;
		}

		units.push({ nodeId: `text-${++textIdCounter}`, sourceText: text });
	}

	return units;
}
