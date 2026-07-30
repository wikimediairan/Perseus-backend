import type { CitationRegistry } from "@/wikimedia/citations";

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
				registry.warnings.push({
					kind: "unsupported-structure",
					message:
						"A citation marker was found during translation extraction but is not in the registry; preserving it as-is.",
				});
			}

			text += soloToken(id);
			return;
		}

		if (isTransclusion(el)) {
			return;
		}

		if (!TRANSPARENT_INLINE_TAGS.has(tag)) {
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
