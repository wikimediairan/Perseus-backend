import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { sessionMiddleware } from "@/middleware/session";
import { findLatestKeyRequestForUser } from "@/repositories/keyRequestsRepo";
import { getDashboardUsage } from "@/services/usageService";
import { DashboardPage } from "@/views/pages/DashboardPage";

export const dashboardRoute = new Hono<AppEnv>();

dashboardRoute.get("/", sessionMiddleware, async (c) => {
	const user = c.get("sessionUser");
	const latestRequest = await findLatestKeyRequestForUser(c.env.DB, user.id);

	const usage =
		user.status === "active" ? await getDashboardUsage(c.env.DB, user) : null;

	const keyRequestStatus =
		user.status === "active"
			? "approved"
			: (latestRequest?.status ?? "not requested");

	const keyRequest =
		c.req.query("keyRequested") === "true"
			? "success"
			: c.req.query("keyRequested") === "false"
				? "error"
				: null;

	const page = DashboardPage({
		wikimediaUsername: user.wikimediaUsername,
		status: user.status,
		keyRequestStatus,
		usage,
		keyRequest,
	});

	return c.html(`<!doctype html>${page.toString()}`);
});
