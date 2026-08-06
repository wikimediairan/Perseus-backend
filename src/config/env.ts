export interface Env {
	DB: D1Database;
	DEFAULT_WEEKLY_COST_LIMIT: string;
	OPENROUTER_API_KEY: string;

	// Public base URL Perseus is reachable at (used to build OAuth redirect
	// URIs). e.g. "http://localhost:8787" locally, "https://perseus.example"
	// in production. If unset, OAuth routes fall back to the incoming
	// request's own origin (see src/routes/auth.ts `redirectUri`).
	PUBLIC_BASE_URL: string;
	WIKIMEDIA_CONSUMER_KEY: string;
	WIKIMEDIA_CONSUMER_SECRET: string;
}
