export type TargetWikiCode = "fa" | "tj";

interface TargetWikiInfo {
	languageName: string;
	domain: string;
}

export const TARGET_WIKIS: Record<TargetWikiCode, TargetWikiInfo> = {
	fa: { languageName: "Persian", domain: "fa.wikipedia.org" },
	tj: { languageName: "Tajik", domain: "tj.wikipedia.org" },
};

export function isTargetWikiCode(value: unknown): value is TargetWikiCode {
	return typeof value === "string" && value in TARGET_WIKIS;
}
