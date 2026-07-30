import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "@/index";
import { seedApiKey } from "../helpers/seedApiKey";

describe("GET /v1/quota", () => {
	beforeAll(async () => {
		await seedApiKey(env, {
			id: "quota-user",
			plaintextKey: "sk-persius-quotatest",
			weeklyTokenLimit: 5000,
		});
	});

	it("reports full remaining quota for a user with no usage yet", async () => {
		const res = await app.request(
			"/v1/quota",
			{ headers: { Authorization: "Bearer sk-persius-quotatest" } },
			env,
		);
		expect(res.status).toBe(200);

		const body = await res.json<{
			weeklyLimitTokens: number;
			usedTokens: number;
			remainingTokens: number;
			resetsAt: string;
		}>();

		expect(body.weeklyLimitTokens).toBe(5000);
		expect(body.usedTokens).toBe(0);
		expect(body.remainingTokens).toBe(5000);
		expect(new Date(body.resetsAt).getTime()).toBeGreaterThan(Date.now());
	});
});
