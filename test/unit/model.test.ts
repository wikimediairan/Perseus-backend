import { describe, expect, it } from "vitest";
import { SUPPORTED_MODELS } from "@/constants/models";
import { PerseusError } from "@/shared/errors";
import { resolveModel } from "@/translation/model";

describe("resolveModel", () => {
	it("accepts each of the three supported models", () => {
		for (const model of SUPPORTED_MODELS) {
			expect(resolveModel(model)).toBe(model);
		}
	});

	it("rejects an unsupported model as an InputError", () => {
		expect(() => resolveModel("openai/gpt-4o")).toThrowError(PerseusError);
		try {
			resolveModel("openai/gpt-4o");
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(PerseusError);
			expect((err as PerseusError).category).toBe("InputError");
		}
	});
});
