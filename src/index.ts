import { Hono } from "hono";
import type { AppEnv } from "@/honoTypes";
import { authMiddleware } from "@/middleware/auth";
import { errorHandler } from "@/middleware/errorHandler";
import { quotaMiddleware } from "@/middleware/quota";
import { requestIdMiddleware } from "@/middleware/requestId";
import { quotaRoute } from "@/routes/quota";
import { translateRoute } from "@/routes/translate";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.use("*", requestIdMiddleware);

app.get("/v1/health", (c) => c.json({ status: "ok" }));

app.use("/v1/translate", authMiddleware, quotaMiddleware);
app.route("/v1/translate", translateRoute);

app.use("/v1/quota", authMiddleware);
app.route("/v1/quota", quotaRoute);

export default app;
