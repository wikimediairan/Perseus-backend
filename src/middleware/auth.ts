import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/honoTypes";
import { findActiveUserByPlaintextKey } from "@/infra/apiKeys";
import { BackendError } from "@/shared/errors";

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
	const header = c.req.header("Authorization");
	const token = header?.startsWith("Bearer ")
		? header.slice("Bearer ".length).trim()
		: undefined;

	if (!token) {
		throw new BackendError(
			"AuthError",
			"Missing or malformed Authorization header.",
		);
	}

	const user = await findActiveUserByPlaintextKey(c.env.DB, token);

	if (!user) {
		throw new BackendError("AuthError", "Invalid or inactive API key.");
	}

	c.set("user", user);
	await next();
};
