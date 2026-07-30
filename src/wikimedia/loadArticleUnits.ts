import { SOURCE_WIKI_CODE } from "@/constants/wikimedia";
import { PerseusError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import { withDomEnvironment } from "@/wikimedia/domEnvironment";
import {
	extractTranslatableText,
	type TranslationUnit,
} from "@/wikimedia/extractTranslatableText";
import { fetchRevisionHtml } from "@/wikimedia/fetchRevision";

/** The only fields the client sends for the article. Never article content. */
export interface ArticleSourceRef {
	wiki: string;
	pageId: number;
	revisionId: number;
}

/**
 * Independently reconstructs an article's translatable text straight
 * from Wikimedia — never from anything the client supplied beyond these
 * three identifiers. The backend never uses article text supplied by a
 * client.
 */
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
