import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import app from "@/index";
import { seedAdmin } from "../helpers/seedAdmin";
import { seedSession, seedUser } from "../helpers/seedUser";

describe("GET /", () => {
	it("shows the public login page without requiring auth", async () => {
		const res = await app.request("/", {}, env);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Login with Wikimedia");
	});
});

describe("GET /dashboard", () => {
	it("requires a session", async () => {
		const res = await app.request("/dashboard", {}, env);
		expect(res.status).toBe(401);
	});

	it("renders account info for a logged-in pending user", async () => {
		await seedUser(env, {
			id: "dash-pending-user",
			wikimediaUserId: "wm-1",
			wikimediaUsername: "DashPendingUser",
			status: "pending",
		});
		await seedSession(env, "dash-pending-user", "session-token-pending");

		const res = await app.request(
			"/dashboard",
			{ headers: { Cookie: "perseus_session=session-token-pending" } },
			env,
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("DashPendingUser");
	});

	it("renders weekly credit info for an active user", async () => {
		await seedUser(env, {
			id: "dash-active-user",
			wikimediaUserId: "wm-2",
			wikimediaUsername: "DashActiveUser",
			status: "active",
			weeklyCredit: 0.16,
		});
		await seedSession(env, "dash-active-user", "session-token-active");

		const res = await app.request(
			"/dashboard",
			{ headers: { Cookie: "perseus_session=session-token-active" } },
			env,
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("$0.16");
	});
});

describe("POST /api/request-key", () => {
	beforeAll(async () => {
		await seedUser(env, {
			id: "key-request-user",
			wikimediaUserId: "wm-3",
			wikimediaUsername: "KeyRequestUser",
			status: "pending",
		});
		await seedSession(env, "key-request-user", "session-token-keyreq");
	});

	it("requires a session", async () => {
		const res = await app.request("/api/request-key", { method: "POST" }, env);
		expect(res.status).toBe(401);
	});

	it("creates a pending key request, then rejects a second while it's pending", async () => {
		const firstRes = await app.request(
			"/api/request-key",
			{
				method: "POST",
				headers: { Cookie: "perseus_session=session-token-keyreq" },
			},
			env,
		);
		expect(firstRes.status).toBe(201);
		const firstBody = await firstRes.json<{ status: string }>();
		expect(firstBody.status).toBe("pending");

		const secondRes = await app.request(
			"/api/request-key",
			{
				method: "POST",
				headers: { Cookie: "perseus_session=session-token-keyreq" },
			},
			env,
		);
		expect(secondRes.status).toBe(409);
	});
});

describe("admin key-request review", () => {
	it("rejects requests with no session at all", async () => {
		const res = await app.request(
			"/api/admin/key-requests/does-not-exist/approve",
			{ method: "POST" },
			env,
		);
		expect(res.status).toBe(401);
	});

	it("rejects a logged-in user who is not in the admins table", async () => {
		await seedUser(env, {
			id: "not-an-admin-user",
			wikimediaUserId: "wm-not-admin",
			wikimediaUsername: "NotAnAdminUser",
			status: "active",
		});
		await seedSession(env, "not-an-admin-user", "session-token-not-admin");

		const res = await app.request(
			"/api/admin/key-requests/does-not-exist/approve",
			{
				method: "POST",
				headers: { Cookie: "perseus_session=session-token-not-admin" },
			},
			env,
		);
		expect(res.status).toBe(403);
	});

	it("approves a pending request, issuing an active API key, when the caller is a Wikimedia admin", async () => {
		await seedUser(env, {
			id: "approve-me-user",
			wikimediaUserId: "wm-4",
			wikimediaUsername: "ApproveMeUser",
			status: "pending",
		});
		await seedSession(env, "approve-me-user", "session-token-approve");

		await seedUser(env, {
			id: "admin-reviewer-user",
			wikimediaUserId: "wm-admin-1",
			wikimediaUsername: "AdminReviewerUser",
			status: "active",
		});
		await seedSession(env, "admin-reviewer-user", "session-token-admin");
		await seedAdmin(env, "wm-admin-1", "AdminReviewerUser");

		const requestRes = await app.request(
			"/api/request-key",
			{
				method: "POST",
				headers: { Cookie: "perseus_session=session-token-approve" },
			},
			env,
		);
		const { id: requestId } = await requestRes.json<{ id: string }>();

		const approveRes = await app.request(
			`/api/admin/key-requests/${requestId}/approve`,
			{
				method: "POST",
				headers: { Cookie: "perseus_session=session-token-admin" },
			},
			env,
		);
		expect(approveRes.status).toBe(200);
		const body = await approveRes.json<{ status: string; apiKey: string }>();
		expect(body.status).toBe("approved");
		expect(body.apiKey).toMatch(/^sk-persius-/);

		// The issued key immediately works against the existing /v1/quota route.
		const quotaRes = await app.request(
			"/v1/quota",
			{ headers: { Authorization: `Bearer ${body.apiKey}` } },
			env,
		);
		expect(quotaRes.status).toBe(200);
		const quotaBody = await quotaRes.json<{ weeklyLimitCost: number }>();
		expect(quotaBody.weeklyLimitCost).toBe(0.16);
	});
});

describe("Wikimedia OAuth start", () => {
	it("redirects to Wikimedia's authorize endpoint even without PUBLIC_BASE_URL configured", async () => {
		const envWithoutPublicBaseUrl = { ...env, PUBLIC_BASE_URL: "" };
		const res = await app.request(
			"/auth/wikimedia",
			{},
			envWithoutPublicBaseUrl,
		);
		expect(res.status).toBe(302);
		const location = res.headers.get("location");
		expect(location).toContain(
			"meta.wikimedia.org/w/rest.php/oauth2/authorize",
		);
		expect(location).toContain("redirect_uri=");
	});

	it("returns a clear ConfigurationError (not a bare 500) when Wikimedia OAuth credentials are missing", async () => {
		const envWithoutCreds = {
			...env,
			WIKIMEDIA_CONSUMER_KEY: "",
			WIKIMEDIA_CONSUMER_SECRET: "",
		};
		const res = await app.request("/auth/wikimedia", {}, envWithoutCreds);
		expect(res.status).toBe(500);
		const body = await res.json<{ error: { category: string } }>();
		expect(body.error.category).toBe("ConfigurationError");
	});
});
