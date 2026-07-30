import { env, fetchMock } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "@/index";
import { weekStartKey } from "@/infra/quota";
import {
	fixtureRevisionHtml,
	openRouterSuccessBody,
} from "../helpers/fixtures";
import { seedApiKey } from "../helpers/seedApiKey";

const WIKIMEDIA_ORIGIN = "https://en.wikipedia.org";
const OPENROUTER_ORIGIN = "https://openrouter.ai";

beforeEach(() => fetchMock.activate());
afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
	fetchMock.deactivate();
});

describe("POST /v1/translate", () => {
	it("full happy path: fetches the real revision, translates via OpenRouter, records quota", async () => {
		await seedApiKey(env, {
			id: "translate-user-1",
			plaintextKey: "sk-persius-translate1",
			weeklyTokenLimit: 1000,
		});

		fetchMock
			.get(WIKIMEDIA_ORIGIN)
			.intercept({ path: "/w/rest.php/v1/revision/999/html", method: "GET" })
			.reply(
				200,
				fixtureRevisionHtml("Hello world, this is a test paragraph."),
			);

		fetchMock
			.get(OPENROUTER_ORIGIN)
			.intercept({ path: "/api/v1/chat/completions", method: "POST" })
			.reply(
				200,
				openRouterSuccessBody(
					"[[SEGMENT 1]]\nBonjour le monde, ceci est un paragraphe de test.",
					{
						prompt: 20,
						completion: 15,
					},
				),
			);

		const res = await app.request(
			"/v1/translate",
			{
				method: "POST",
				headers: {
					Authorization: "Bearer sk-persius-translate1",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					source: { wiki: "enwiki", pageId: 42, revisionId: 999 },
					chunk: "all",
					targetWiki: "fa",
				}),
			},
			env,
		);

		expect(res.status).toBe(200);
		const body = await res.json<{
			totalChunks: number;
			translated: {
				chunkId: string;
				units: { nodeId: string; translatedText: string }[];
			}[];
			failed: unknown[];
			skipped: unknown[];
			quota: { remainingTokens: number };
		}>();

		expect(body.totalChunks).toBe(1);
		expect(body.failed).toEqual([]);
		expect(body.skipped).toEqual([]);
		expect(body.translated).toHaveLength(1);
		expect(body.translated[0]?.units).toEqual([
			{
				nodeId: "text-1",
				sourceText: "Hello world, this is a test paragraph.",
				translatedText: "Bonjour le monde, ceci est un paragraphe de test.",
			},
		]);

		// Quota was decremented by the exact provider-reported total (35 = 20 + 15).
		expect(body.quota.remainingTokens).toBe(1000 - 35);

		const row = await env.DB.prepare(
			`SELECT tokens_used, chunks_translated FROM quota_usage WHERE user_id = ?`,
		)
			.bind("translate-user-1")
			.first<{ tokens_used: number; chunks_translated: number }>();
		expect(row?.tokens_used).toBe(35);
		expect(row?.chunks_translated).toBe(1);
	});

	it("rejects an unknown chunk id with 404, without calling OpenRouter", async () => {
		await seedApiKey(env, {
			id: "translate-user-2",
			plaintextKey: "sk-persius-translate2",
			weeklyTokenLimit: 1000,
		});

		fetchMock
			.get(WIKIMEDIA_ORIGIN)
			.intercept({ path: "/w/rest.php/v1/revision/1000/html", method: "GET" })
			.reply(200, fixtureRevisionHtml("Only one paragraph here."));

		const res = await app.request(
			"/v1/translate",
			{
				method: "POST",
				headers: {
					Authorization: "Bearer sk-persius-translate2",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					source: { wiki: "enwiki", pageId: 1, revisionId: 1000 },
					chunk: "chunk-99",
					targetWiki: "fa",
				}),
			},
			env,
		);

		expect(res.status).toBe(404);
		const body = await res.json<{ error: { category: string } }>();
		expect(body.error.category).toBe("InputError");
	});

	it("records a chunk as failed (not a whole-request failure) when OpenRouter errors", async () => {
		await seedApiKey(env, {
			id: "translate-user-3",
			plaintextKey: "sk-persius-translate3",
			weeklyTokenLimit: 1000,
		});

		fetchMock
			.get(WIKIMEDIA_ORIGIN)
			.intercept({ path: "/w/rest.php/v1/revision/2000/html", method: "GET" })
			.reply(
				200,
				fixtureRevisionHtml("A paragraph that will fail to translate."),
			);

		fetchMock
			.get(OPENROUTER_ORIGIN)
			.intercept({ path: "/api/v1/chat/completions", method: "POST" })
			.reply(
				500,
				JSON.stringify({ error: { message: "upstream overloaded" } }),
			);

		const res = await app.request(
			"/v1/translate",
			{
				method: "POST",
				headers: {
					Authorization: "Bearer sk-persius-translate3",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					source: { wiki: "enwiki", pageId: 1, revisionId: 2000 },
					chunk: "all",
					targetWiki: "fa",
				}),
			},
			env,
		);

		expect(res.status).toBe(200);
		const body = await res.json<{
			translated: unknown[];
			failed: { chunkId: string; reason: string }[];
		}>();
		expect(body.translated).toEqual([]);
		expect(body.failed).toEqual([
			{ chunkId: "chunk-1", reason: "provider_error" },
		]);
	});

	it("rejects an unsupported targetWiki as a 400 without calling OpenRouter", async () => {
		await seedApiKey(env, {
			id: "translate-user-4",
			plaintextKey: "sk-persius-translate4",
			weeklyTokenLimit: 1000,
		});

		fetchMock
			.get(WIKIMEDIA_ORIGIN)
			.intercept({ path: "/w/rest.php/v1/revision/3000/html", method: "GET" })
			.reply(200, fixtureRevisionHtml("Some paragraph text."));

		const res = await app.request(
			"/v1/translate",
			{
				method: "POST",
				headers: {
					Authorization: "Bearer sk-persius-translate4",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					source: { wiki: "enwiki", pageId: 1, revisionId: 3000 },
					chunk: "all",
					targetWiki: "klingon",
				}),
			},
			env,
		);

		expect(res.status).toBe(400);
	});

	it("returns 429 with no Wikimedia/OpenRouter calls when quota is already exhausted", async () => {
		await seedApiKey(env, {
			id: "translate-user-5",
			plaintextKey: "sk-persius-translate5",
			weeklyTokenLimit: 10,
		});

		await env.DB.prepare(
			`INSERT INTO quota_usage (user_id, week_start, tokens_used, estimated_cost_usd, chunks_translated, updated_at)
       VALUES (?, ?, 10, 0, 1, ?)
       ON CONFLICT(user_id, week_start) DO UPDATE SET tokens_used = 10`,
		)
			.bind(
				"translate-user-5",
				weekStartKey(new Date()),
				new Date().toISOString(),
			)
			.run();

		const res = await app.request(
			"/v1/translate",
			{
				method: "POST",
				headers: {
					Authorization: "Bearer sk-persius-translate5",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					source: { wiki: "enwiki", pageId: 1, revisionId: 4000 },
					chunk: "all",
					targetWiki: "fa",
				}),
			},
			env,
		);

		expect(res.status).toBe(429);
		const body = await res.json<{ error: { category: string } }>();
		expect(body.error.category).toBe("QuotaExceededError");
	});
});
