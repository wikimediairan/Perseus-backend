import type { Logger } from "@/shared/logger";

export type CitationId = string;

interface CitationDefinition {
	id: CitationId;
	name: null | string;
	referencedBy: CitationId[];
}

interface CitationReference {
	id: CitationId;
	name: null | string;
	definitionId: null | CitationId;
	element: null | Element;
}

export type CitationWarningKind =
	| "orphan-definition" // a definition nothing references
	| "malformed-reference" // couldn't parse this citation's data at all
	| "duplicate-definition" // the same name defines a body more than once
	| "unsupported-structure" // an unrecognized/unsupported citation structure
	| "missing-named-definition"; // a reference names a citation with no definition anywhere

interface CitationRegistryWarning {
	kind: CitationWarningKind;
	message: string;
	citationId?: CitationId;
	name?: null | string;
}

export class CitationRegistry {
	private readonly definitions = new Map<CitationId, CitationDefinition>();
	private readonly referencesById = new Map<CitationId, CitationReference>();
	private readonly definitionIdByName = new Map<string, CitationId>();
	private readonly referenceIdByElement = new Map<Element, CitationId>();
	private loggedWarningCount = 0;
	readonly warnings: CitationRegistryWarning[] = [];

	registerDefinition(def: CitationDefinition): CitationId {
		if (def.name !== null) {
			const existingId = this.definitionIdByName.get(def.name);

			if (existingId !== undefined && existingId !== def.id) {
				this.warnings.push({
					kind: "duplicate-definition",
					message: `Citation name "${def.name}" is defined more than once; keeping the first definition.`,
					citationId: def.id,
					name: def.name,
				});
				return existingId;
			}

			this.definitionIdByName.set(def.name, def.id);
		}

		this.definitions.set(def.id, def);
		return def.id;
	}

	registerReference(ref: CitationReference): void {
		let { definitionId } = ref;

		if (definitionId === null && ref.name !== null) {
			const resolved = this.definitionIdByName.get(ref.name);

			if (resolved !== undefined) {
				definitionId = resolved;
			} else {
				this.warnings.push({
					kind: "missing-named-definition",
					message: `Reference to citation "${ref.name}" has no matching definition.`,
					citationId: ref.id,
					name: ref.name,
				});
			}
		}

		const resolvedRef: CitationReference = { ...ref, definitionId };
		this.referencesById.set(resolvedRef.id, resolvedRef);

		if (resolvedRef.element) {
			this.referenceIdByElement.set(resolvedRef.element, resolvedRef.id);
		}

		if (definitionId !== null) {
			const def = this.definitions.get(definitionId);

			if (def && !def.referencedBy.includes(resolvedRef.id)) {
				def.referencedBy.push(resolvedRef.id);
			}
		}
	}

	finalize(): void {
		for (const def of this.definitions.values()) {
			if (def.referencedBy.length === 0) {
				this.warnings.push({
					kind: "orphan-definition",
					message: def.name
						? `Citation "${def.name}" is defined but never referenced.`
						: "An anonymous citation is defined but never referenced.",
					citationId: def.id,
					name: def.name,
				});
			}
		}
	}

	findReferenceIdByElement(element: Element): undefined | CitationId {
		return this.referenceIdByElement.get(element);
	}

	flushWarningsTo(logger: Logger): void {
		for (let i = this.loggedWarningCount; i < this.warnings.length; i++) {
			const w = this.warnings[i];
			logger.warn(w.message, {
				kind: w.kind,
				citationId: w.citationId,
				name: w.name ?? undefined,
			});
		}
		this.loggedWarningCount = this.warnings.length;
	}
}

const REF_SELECTOR = '[typeof*="mw:Extension/ref"]';

interface ParsedRefAttrs {
	name: null | string;
	bodyHtml: null | string;
	malformed: boolean;
}

function readRefAttrs(el: Element): ParsedRefAttrs {
	const dataMw = (el as HTMLElement).dataset.mw;

	if (!dataMw) {
		return { name: null, bodyHtml: null, malformed: true };
	}

	try {
		const parsed = JSON.parse(dataMw) as {
			attrs?: { name?: string };
			body?: { html?: string };
		};
		return {
			name: typeof parsed.attrs?.name === "string" ? parsed.attrs.name : null,
			bodyHtml: typeof parsed.body?.html === "string" ? parsed.body.html : null,
			malformed: false,
		};
	} catch {
		return { name: null, bodyHtml: null, malformed: true };
	}
}

export function buildCitationRegistry(root: Element): CitationRegistry {
	const registry = new CitationRegistry();

	let citationIdCounter = 0;
	const nextId = (): CitationId => `cite-${++citationIdCounter}`;

	const refElements = [...root.querySelectorAll(REF_SELECTOR)];

	const definingElements = new Set<Element>();

	for (const el of refElements) {
		const attrs = readRefAttrs(el);
		if (attrs.bodyHtml === null) {
			continue;
		}

		definingElements.add(el);
		const id = nextId();

		if (attrs.malformed) {
			registry.warnings.push({
				kind: "malformed-reference",
				message:
					"Could not parse a citation's data; preserving it as an unclassified definition.",
				citationId: id,
				name: attrs.name,
			});
		}

		const canonicalId = registry.registerDefinition({
			id,
			name: attrs.name,
			referencedBy: [],
		});

		registry.registerReference({
			id,
			name: attrs.name,
			definitionId: canonicalId,
			element: el,
		});
	}

	for (const el of refElements) {
		if (definingElements.has(el)) {
			continue;
		}

		const attrs = readRefAttrs(el);
		const id = nextId();

		if (attrs.malformed) {
			registry.warnings.push({
				kind: "malformed-reference",
				message:
					"Could not parse a citation reference's data; preserving it as an unresolved reference.",
				citationId: id,
				name: attrs.name,
			});
		}

		registry.registerReference({
			id,
			name: attrs.name,
			definitionId: null,
			element: el,
		});
	}

	registry.finalize();
	return registry;
}
