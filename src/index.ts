import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { Env } from "@/config/env";
import type { AppEnv } from "@/honoTypes";
import { authMiddleware } from "@/middleware/auth";
import { corsMiddleware } from "@/middleware/cors";
import { errorHandler } from "@/middleware/errorHandler";
import { quotaMiddleware } from "@/middleware/quota";
import { rateLimit } from "@/middleware/rateLimit";
import { requestIdMiddleware } from "@/middleware/requestId";
import { apiKeysRoute } from "@/routes/apiKeys";
import { authRoute } from "@/routes/auth";
import { healthRoute } from "@/routes/health";
import { quotaRoute } from "@/routes/quota";
import { translateRoute } from "@/routes/translate";
import { dashboardRoute } from "@/routes/web/dashboard";
import { homeRoute } from "@/routes/web/home";
import { handleWeeklyEvaluation } from "@/services/weeklyEvaluation";

const app = new OpenAPIHono<AppEnv>();

app.onError(errorHandler);

app.use("*", corsMiddleware);
app.use("*", requestIdMiddleware);

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
	type: "http",
	scheme: "bearer",
	bearerFormat: "API Key",
});

app.doc("/openapi.json", {
	openapi: "3.1.0",
	info: {
		title: "Perseus Backend API",
		version: "0.2.0",
	},
});

app.get(
	"/docs",
	Scalar({
		url: "/openapi.json",
	}),
);

app.route("/", homeRoute);

app.route("/v1/health", healthRoute);

app.use("/v1/translate", authMiddleware, quotaMiddleware);
app.route("/v1/translate", translateRoute);

app.use("/v1/quota", authMiddleware);
app.route("/v1/quota", quotaRoute);

app.use("/auth/*", rateLimit("auth"));
app.route("/auth", authRoute);

app.route("/dashboard", dashboardRoute);

app.use("/api/request-key", rateLimit("request-key"));
app.route("/api", apiKeysRoute);

export default Object.assign(app, {
	async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
		await handleWeeklyEvaluation(env);
	},
});
