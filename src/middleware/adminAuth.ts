import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { isWikimediaAdmin } from "@/repositories/adminsRepo";
import { getSessionUser } from "@/services/sessionService";
import { BackendError } from "@/shared/errors";

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
	const sessionUser = c.get("sessionUser") ?? (await getSessionUser(c));

	if (!sessionUser) {
		throw new BackendError("AuthError", "Login required.");
	}

	const isAdmin = await isWikimediaAdmin(c.env.DB, sessionUser.wikimediaUserId);

	if (!isAdmin) {
		throw new BackendError(
			"ForbiddenError",
			"This action requires administrator access.",
		);
	}

	c.set("sessionUser", sessionUser);
	await next();
};
