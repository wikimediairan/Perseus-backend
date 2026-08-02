export type ModelId =
	| "deepseek/deepseek-v4-pro"
	| "openai/gpt-5-mini"
	| "openai/gpt-5.4-mini"
	| "z-ai/glm-5.2"
	| "google/gemini-2.5-flash"
	| "google/gemini-3.5-flash-light";

export const SUPPORTED_MODELS: readonly ModelId[] = [
	"deepseek/deepseek-v4-pro",
	"openai/gpt-5-mini",
	"openai/gpt-5.4-mini",
	"z-ai/glm-5.2",
	"google/gemini-2.5-flash",
	"google/gemini-3.5-flash-light",
];

export function isSupportedModel(value: unknown): value is ModelId {
	return (
		typeof value === "string" && (SUPPORTED_MODELS as string[]).includes(value)
	);
}
