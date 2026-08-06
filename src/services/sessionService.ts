import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "@/honoTypes";
import {
	createSession,
	deleteSession,
	findValidSession,
} from "@/repositories/sessionsRepo";
import { findUserById, type UserRow } from "@/repositories/usersRepo";
import { generateToken, sha256Hex } from "@/shared/tokens";

const SESSION_COOKIE = "perseus_session";
const OAUTH_STATE_COOKIE_PREFIX = "perseus_oauth_state_";

function isSecureRequest(c: Context<AppEnv>): boolean {
	return new URL(c.req.url).protocol === "https:";
}

export async function startSession(
	c: Context<AppEnv>,
	userId: string,
): Promise<void> {
	const token = generateToken(32);
	const tokenHash = await sha256Hex(token);
	await createSession(c.env.DB, tokenHash, userId);

	setCookie(c, SESSION_COOKIE, token, {
		httpOnly: true,
		secure: isSecureRequest(c),
		sameSite: "Lax",
		path: "/",
		maxAge: 30 * 24 * 60 * 60,
	});
}

export async function getSessionUser(
	c: Context<AppEnv>,
): Promise<UserRow | null> {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return null;

	const tokenHash = await sha256Hex(token);
	const session = await findValidSession(c.env.DB, tokenHash);
	if (!session) return null;

	return await findUserById(c.env.DB, session.userId);
}

export async function endSession(c: Context<AppEnv>): Promise<void> {
	const token = getCookie(c, SESSION_COOKIE);
	if (token) {
		const tokenHash = await sha256Hex(token);
		await deleteSession(c.env.DB, tokenHash);
	}
	deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Sets a short-lived, httpOnly "double submit" cookie holding the OAuth
 * state, so the callback can verify it against the ?state= query param. */
export function startOAuthState(c: Context<AppEnv>, provider: string): string {
	const state = generateToken(16);
	setCookie(c, `${OAUTH_STATE_COOKIE_PREFIX}${provider}`, state, {
		httpOnly: true,
		secure: isSecureRequest(c),
		sameSite: "Lax",
		path: "/",
		maxAge: 600,
	});
	return state;
}

export function consumeOAuthState(
	c: Context<AppEnv>,
	provider: string,
): string | undefined {
	const cookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
	const value = getCookie(c, cookieName);
	deleteCookie(c, cookieName, { path: "/" });
	return value;
}
