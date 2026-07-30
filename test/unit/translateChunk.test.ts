import { describe, expect, it } from "vitest";
import type {
	Translate,
	TranslationRequest,
	TranslationResult,
} from "@/provider/openRouter";
import type { Chunk } from "@/translation/chunker";
import { buildServerPrompt } from "@/translation/prompt";
import { translateChunk } from "@/translation/translateChunk";

function stubTranslate(
	respond: (req: TranslationRequest) => TranslationResult,
): Translate {
	return async (req) => respond(req);
}

const testChunk: Chunk = {
	id: "chunk-1",
	units: [
		{ nodeId: "n1", sourceText: "Hello" },
		{ nodeId: "n2", sourceText: "World" },
	],
};

const testModel = "google/gemini-2.5-flash" as const;

describe("translateChunk", () => {
	it("renders the chunk, calls the provider with the server-built prompt and chosen model, and parses the response back into units", async () => {
		let capturedRequest: TranslationRequest | undefined;

		const translate = stubTranslate((req) => {
			capturedRequest = req;
			return {
				translatedText: "[[SEGMENT 1]]\nBonjour\n\n[[SEGMENT 2]]\nMonde",
				usage: { cost: 0.0002 },
			};
		});

		const serverPrompt = buildServerPrompt("fa");
		const result = await translateChunk(
			translate,
			testChunk,
			serverPrompt,
			testModel,
		);

		expect(capturedRequest?.systemPrompt).toBe(serverPrompt.prompt);
		expect(capturedRequest?.sourceText).toContain("Hello");
		expect(capturedRequest?.targetLanguage).toBe("fa");
		expect(capturedRequest?.model).toBe(testModel);

		expect(result.chunkId).toBe("chunk-1");
		expect(result.units).toEqual([
			{ nodeId: "n1", sourceText: "Hello", translatedText: "Bonjour" },
			{ nodeId: "n2", sourceText: "World", translatedText: "Monde" },
		]);
		expect(result.missingUnitIds).toEqual([]);
		expect(result.usage).toEqual({ cost: 0.0002 });
	});

	it("reports missing units as partial credit rather than failing the whole chunk", async () => {
		const translate = stubTranslate(() => ({
			translatedText: "[[SEGMENT 1]]\nBonjour", // segment 2 missing
		}));

		const serverPrompt = buildServerPrompt("fa");
		const result = await translateChunk(
			translate,
			testChunk,
			serverPrompt,
			testModel,
		);

		expect(result.units).toEqual([
			{ nodeId: "n1", sourceText: "Hello", translatedText: "Bonjour" },
		]);
		expect(result.missingUnitIds).toEqual(["n2"]);
	});

	it("propagates provider errors (caller is responsible for Tier-2 handling)", async () => {
		const translate: Translate = async () => {
			throw new Error("network exploded");
		};

		const serverPrompt = buildServerPrompt("fa");
		await expect(
			translateChunk(translate, testChunk, serverPrompt, testModel),
		).rejects.toThrow("network exploded");
	});
});
