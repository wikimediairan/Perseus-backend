import { systemPromptLines } from "@/constants/prompt";
import {
	isTargetWikiCode,
	TARGET_WIKIS,
	type TargetWikiCode,
} from "@/constants/targetWikis";
import { PerseusError } from "@/shared/errors";

export interface ServerPrompt {
	prompt: string;
	targetWikiCode: TargetWikiCode;
}

/**
 * Validates the client-selected target wiki against the supported
 * registry, then builds the fixed server-side system prompt for it.
 * Takes only `targetWiki` — there is no parameter here through which a
 * client-supplied prompt could be injected.
 */
export function buildServerPrompt(targetWiki: string): ServerPrompt {
	if (!isTargetWikiCode(targetWiki)) {
		throw new PerseusError(
			"InputError",
			`Unsupported targetWiki "${targetWiki}". Supported values: ${Object.keys(TARGET_WIKIS).join(", ")}.`,
			{ stage: "llm-translation" },
		);
	}

	const { languageName, domain } = TARGET_WIKIS[targetWiki];
	const prompt = systemPromptLines(languageName, domain).join(" ");

	return { prompt, targetWikiCode: targetWiki };
}
