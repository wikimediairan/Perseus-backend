import { fetchMock } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PerseusError } from "@/shared/errors";
import { loadArticleTranslationUnits } from "@/wikimedia/loadArticleUnits";
import { createSilentLogger } from "../helpers/silentLogger";

describe("loadArticleTranslationUnits", () => {
	it("rejects an unsupported source wiki without making any network call", async () => {
		fetchMock.disableNetConnect();

		await expect(
			loadArticleTranslationUnits(
				{ wiki: "frwiki", pageId: 1, revisionId: 1 },
				createSilentLogger(),
			),
		).rejects.toMatchObject({
			category: "InputError",
		});
	});

	it("rejects with a PerseusError instance specifically", async () => {
		fetchMock.disableNetConnect();

		await expect(
			loadArticleTranslationUnits(
				{ wiki: "dewiki", pageId: 1, revisionId: 1 },
				createSilentLogger(),
			),
		).rejects.toBeInstanceOf(PerseusError);
	});
});
