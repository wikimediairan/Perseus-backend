import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { requireAdmin } from "@/middleware/adminAuth";
import { sessionMiddleware } from "@/middleware/session";
import {
	approveKeyRequest,
	rejectKeyRequest,
	requestApiKey,
} from "@/services/creditEngine";

export const apiKeysRoute = new Hono<AppEnv>();

apiKeysRoute.post("/request-key", sessionMiddleware, async (c) => {
	try {
		const user = c.get("sessionUser");

		await requestApiKey(c.env.DB, user);

		return c.redirect("/dashboard?keyRequested=true");
	} catch (_error) {
		return c.redirect("/dashboard?keyRequested=false");
	}
});

apiKeysRoute.post(
	"/admin/key-requests/:id/approve",
	requireAdmin,
	async (c) => {
		const { plaintextKey } = await approveKeyRequest(
			c.env.DB,
			c.req.param("id"),
		);

		return c.json({ status: "approved", apiKey: plaintextKey });
	},
);

apiKeysRoute.post("/admin/key-requests/:id/reject", requireAdmin, async (c) => {
	await rejectKeyRequest(c.env.DB, c.req.param("id"));
	return c.json({ status: "rejected" });
});
