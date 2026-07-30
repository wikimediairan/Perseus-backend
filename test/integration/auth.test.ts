import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "@/index";
import { seedApiKey } from "../helpers/seedApiKey";

describe("auth", () => {
	beforeAll(async () => {
		await seedApiKey(env, {
			id: "auth-user",
			plaintextKey: "sk-persius-authtest",
			weeklyTokenLimit: 1000,
		});
	});

	it("GET /v1/health requires no auth", async () => {
		const res = await app.request("/v1/health", {}, env);
		expect(res.status).toBe(200);
	});

	it("rejects requests with no Authorization header", async () => {
		const res = await app.request("/v1/quota", {}, env);
		expect(res.status).toBe(401);
		const body = await res.json<{ error: { category: string } }>();
		expect(body.error.category).toBe("AuthError");
	});

	it("rejects an unknown API key", async () => {
		const res = await app.request(
			"/v1/quota",
			{ headers: { Authorization: "Bearer sk-persius-doesnotexist" } },
			env,
		);
		expect(res.status).toBe(401);
	});

	it("accepts a valid, active API key", async () => {
		const res = await app.request(
			"/v1/quota",
			{ headers: { Authorization: "Bearer sk-persius-authtest" } },
			env,
		);
		expect(res.status).toBe(200);
	});

	it("rejects a revoked (inactive) API key", async () => {
		await seedApiKey(env, {
			id: "revoked-user",
			plaintextKey: "sk-persius-revoked",
			weeklyTokenLimit: 1000,
			active: false,
		});

		const res = await app.request(
			"/v1/quota",
			{ headers: { Authorization: "Bearer sk-persius-revoked" } },
			env,
		);
		expect(res.status).toBe(401);
	});
});
