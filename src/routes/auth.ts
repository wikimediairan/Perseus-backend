import { type Context, Hono } from "hono";
import type { Env } from "@/config/env";
import type { AppEnv } from "@/honoTypes";
import { upsertWikimediaUser } from "@/repositories/usersRepo";
import {
	consumeOAuthState,
	endSession,
	startOAuthState,
	startSession,
} from "@/services/sessionService";
import {
	buildWikimediaAuthorizeUrl,
	exchangeWikimediaCode,
	fetchWikimediaProfile,
} from "@/services/wikimediaOAuth";
import { BackendError, PerseusError } from "@/shared/errors";

export const authRoute = new Hono<AppEnv>();

/**
 * Builds an absolute OAuth redirect URI for `path`.
 *
 * Prefers `PUBLIC_BASE_URL` (important behind a proxy/CDN, where the
 * request's own origin may not match Perseus's public URL), but falls
 * back to the incoming request's own origin when it isn't configured,
 * rather than throwing. A misconfigured/missing `PUBLIC_BASE_URL` should
 * never turn into an opaque 500 on `/auth/wikimedia`.
 */
function redirectUri(c: Context<AppEnv>, path: string): string {
	const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
	return new URL(path, base).toString();
}

function requireWikimediaOAuthConfig(env: Env): void {
	if (!env.WIKIMEDIA_CONSUMER_KEY || !env.WIKIMEDIA_CONSUMER_SECRET) {
		throw new PerseusError(
			"ConfigurationError",
			"Wikimedia OAuth is not configured (missing WIKIMEDIA_CONSUMER_KEY/WIKIMEDIA_CONSUMER_SECRET).",
		);
	}
}

authRoute.get("/wikimedia", async (c) => {
	requireWikimediaOAuthConfig(c.env);

	const state = startOAuthState(c, "wikimedia");
	const url = buildWikimediaAuthorizeUrl(
		c.env,
		state,
		redirectUri(c, "/auth/wikimedia/callback"),
	);
	return c.redirect(url);
});

authRoute.get("/wikimedia/callback", async (c) => {
	requireWikimediaOAuthConfig(c.env);

	const code = c.req.query("code");
	const state = c.req.query("state");
	const expectedState = consumeOAuthState(c, "wikimedia");

	if (!code || !state || !expectedState || state !== expectedState) {
		throw new BackendError("AuthError", "Invalid or expired OAuth state.");
	}

	const accessToken = await exchangeWikimediaCode(
		c.env,
		code,
		redirectUri(c, "/auth/wikimedia/callback"),
	);
	const profile = await fetchWikimediaProfile(accessToken);

	const user = await upsertWikimediaUser(c.env.DB, {
		wikimediaUserId: profile.wikimediaUserId,
		wikimediaUsername: profile.wikimediaUsername,
	});

	await startSession(c, user.id);

	return c.redirect("/dashboard");
});

authRoute.post("/logout", async (c) => {
	await endSession(c);
	return c.redirect("/");
});
