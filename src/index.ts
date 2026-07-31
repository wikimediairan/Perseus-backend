import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

import type { AppEnv } from "@/honoTypes";
import { authMiddleware } from "@/middleware/auth";
import { errorHandler } from "@/middleware/errorHandler";
import { quotaMiddleware } from "@/middleware/quota";
import { requestIdMiddleware } from "@/middleware/requestId";
import { quotaRoute } from "@/routes/quota";
import { translateRoute } from "@/routes/translate";
import { healthRoute } from "./routes/health";

const app = new OpenAPIHono<AppEnv>();

app.onError(errorHandler);
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
		version: "0.1.0",
	},
});

app.get(
	"/docs",
	Scalar({
		url: "/openapi.json",
	}),
);

app.route("/v1/health", healthRoute);

app.use("/v1/translate", authMiddleware, quotaMiddleware);
app.route("/v1/translate", translateRoute);

app.use("/v1/quota", authMiddleware);
app.route("/v1/quota", quotaRoute);

export default app;
