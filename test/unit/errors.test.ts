import { describe, expect, it } from "vitest";
import { BackendError, PerseusError, toHttpError } from "@/shared/errors";

describe("toHttpError", () => {
	it("maps AuthError to 401", () => {
		const { status, body } = toHttpError(
			new BackendError("AuthError", "nope"),
			"req-1",
		);
		expect(status).toBe(401);
		expect(body).toEqual({
			error: { category: "AuthError", message: "nope", requestId: "req-1" },
		});
	});

	it("maps QuotaExceededError to 429", () => {
		const { status } = toHttpError(
			new BackendError("QuotaExceededError", "no quota"),
			"req-1",
		);
		expect(status).toBe(429);
	});

	it("maps a plain InputError to 400", () => {
		const { status } = toHttpError(
			new PerseusError("InputError", "bad input"),
			"req-1",
		);
		expect(status).toBe(400);
	});

	it("maps an InputError with context.notFound=true to 404 (unknown chunk id)", () => {
		const { status } = toHttpError(
			new PerseusError("InputError", "unknown chunk", {
				context: { notFound: true },
			}),
			"req-1",
		);
		expect(status).toBe(404);
	});

	it("maps ParsingError and ProviderError to 502", () => {
		expect(toHttpError(new PerseusError("ParsingError", "x"), "r").status).toBe(
			502,
		);
		expect(
			toHttpError(new PerseusError("ProviderError", "x"), "r").status,
		).toBe(502);
	});

	it("maps ConfigurationError to 500", () => {
		expect(
			toHttpError(new PerseusError("ConfigurationError", "x"), "r").status,
		).toBe(500);
	});

	it("never leaks internal error details for unknown/unexpected errors", () => {
		const { status, body } = toHttpError(
			new Error("some internal stack detail"),
			"req-9",
		);
		expect(status).toBe(500);
		expect(body.error.message).not.toContain("internal stack detail");
		expect(body.error.requestId).toBe("req-9");
	});

	it("strips context keys that are not on the allowlist (status, stage, chunkId)", () => {
		const err = new PerseusError("ProviderError", "x", {
			context: {
				chunkId: "chunk-1",
				secretApiKey: "should-not-appear",
				status: 502,
			},
		});
		const { logContext } = toHttpError(err, "r");
		expect(logContext).toEqual({ chunkId: "chunk-1", status: 502 });
	});
});
