import { describe, expect, it } from "vitest";
import { PerseusError } from "@/shared/errors";
import { buildServerPrompt } from "@/translation/prompt";

describe("buildServerPrompt", () => {
	it("builds a prompt for a supported target wiki", () => {
		const { prompt, targetWikiCode } = buildServerPrompt("fa");
		expect(targetWikiCode).toBe("fa");
		expect(prompt.length).toBeGreaterThan(0);
	});

	it("rejects an unsupported targetWiki as a Tier-1 InputError", () => {
		expect(() => buildServerPrompt("klingon")).toThrowError(PerseusError);
		try {
			buildServerPrompt("klingon");
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(PerseusError);
			expect((err as PerseusError).category).toBe("InputError");
		}
	});

	it("has no parameter through which arbitrary text could be injected", () => {
		expect(buildServerPrompt.length).toBe(1);
	});

	it("two calls for the same target wiki produce an identical prompt (deterministic, no per-call variance)", () => {
		const a = buildServerPrompt("tj");
		const b = buildServerPrompt("tj");
		expect(a.prompt).toBe(b.prompt);
	});
});
