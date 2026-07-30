import { SOURCE_WIKI_CODE } from "@/constants/wikimedia";
import { PerseusError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import { withDomEnvironment } from "@/wikimedia/domEnvironment";
import {
	extractTranslatableText,
	type TranslationUnit,
} from "@/wikimedia/extractTranslatableText";
import { fetchRevisionHtml } from "@/wikimedia/fetchRevision";

export interface ArticleSourceRef {
	wiki: string;
	pageId: number;
	revisionId: number;
}

// Loads an article's translatable text directly from Wikimedia using its source identifiers.
export async function loadArticleTranslationUnits(
	source: ArticleSourceRef,
	logger: Logger,
): Promise<TranslationUnit[]> {
	if (source.wiki !== SOURCE_WIKI_CODE) {
		throw new PerseusError(
			"InputError",
			`Unsupported source wiki "${source.wiki}". Perseus only translates from ${SOURCE_WIKI_CODE}.`,
			{ stage: "load-article" },
		);
	}

	return withDomEnvironment(async () => {
		const html = await fetchRevisionHtml(source.revisionId);
		return extractTranslatableText(html, logger);
	});
}
