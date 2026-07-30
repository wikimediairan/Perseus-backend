/**
 * Flattens a block element's content into plain, translatable text.
 *
 * The LLM must receive only human-readable text, never raw markup. A
 * paragraph like `<p>The <a href="./Sun">Sun</a> is a <b>star</b>.</p>`
 * still needs its link label and bold text translated, so instead of
 * stripping inline tags (losing them) or sending raw HTML, this flattens
 * to plain text with lightweight numeric tokens marking where each
 * inline element starts/ends: `The ⟪1⟫Sun⟪/1⟫ is a ⟪2⟫star⟪/2⟫.` The LLM
 * is instructed (see translation/prompt.ts) to keep the tokens as-is.
 *
 * Citation markers get a third, solo kind of token (`⟪*1⟫`) since a
 * footnote marker's visible content is just an auto-numbered "[1]" —
 * there is no wrapped content to translate, only an opaque reference
 * that must be preserved unchanged.
 *
 * Tokens use U+27EA/U+27EB (mathematical angle brackets) specifically
 * because they essentially never occur in ordinary prose, so a token
 * surviving translation unmodified is easy to detect.
 */

import type { CitationRegistry } from "@/wikimedia/citations";

/** Inline elements that are "transparent": their own text is translatable, but the tag itself must be preserved. */
const TRANSPARENT_INLINE_TAGS = new Set([
	"a",
	"abbr",
	"b",
	"cite",
	"em",
	"i",
	"q",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"u",
]);

const CITATION_MARKER_SELECTOR = '[typeof*="mw:Extension/ref"]';

function openToken(id: number): string {
	return `\u27EA${id}\u27EB`;
}

function closeToken(id: number): string {
	return `\u27EA/${id}\u27EB`;
}

/** Solo token for citation markers: no wrapped content, the whole thing is substituted at once. */
function soloToken(id: number): string {
	return `\u27EA*${id}\u27EB`;
}

function isCitationMarker(el: Element): boolean {
	return el.matches?.(CITATION_MARKER_SELECTOR) ?? false;
}

function isTransclusion(el: Element): boolean {
	const typeofAttr = el.getAttribute("typeof") || "";
	return typeofAttr.split(/\s+/).some((t) => t.startsWith("mw:Transclusion"));
}

/**
 * Recursively flattens `root`'s child nodes into plain text. Any
 * templated subtree (`typeof~="mw:Transclusion"`) is skipped entirely —
 * neither its tag nor its text becomes translatable content, since
 * templates must remain unchanged.
 */
export function flattenToPlaceholderText(
	root: Element,
	registry: CitationRegistry,
): string {
	let nextId = 1;
	let text = "";

	function walk(node: Node): void {
		if (node.nodeType === node.TEXT_NODE) {
			text += node.textContent ?? "";
			return;
		}

		if (node.nodeType !== node.ELEMENT_NODE) {
			return;
		}

		const el = node as Element;
		const tag = el.tagName.toLowerCase();

		if (isCitationMarker(el)) {
			const id = nextId++;

			if (registry.findReferenceIdByElement(el) === undefined) {
				// Should not normally happen — buildCitationRegistry scans the
				// same document for every mw:Extension/ref element. Preserve the
				// marker via its token anyway, and record why this is visible.
				registry.warnings.push({
					kind: "unsupported-structure",
					message:
						"A citation marker was found during translation extraction but is not in the registry; preserving it as-is.",
				});
			}

			text += soloToken(id);
			return; // never recurse into a citation marker's children
		}

		if (isTransclusion(el)) {
			// Opaque: skip entirely, do not translate, do not preserve as a placeholder.
			return;
		}

		if (!TRANSPARENT_INLINE_TAGS.has(tag)) {
			// Unknown/opaque inline-ish tag: skip its content but don't fail the whole block.
			return;
		}

		const id = nextId++;
		text += openToken(id);

		for (const child of el.childNodes) {
			walk(child);
		}

		text += closeToken(id);
	}

	for (const child of root.childNodes) {
		walk(child);
	}

	return text.trim();
}
