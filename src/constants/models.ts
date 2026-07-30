export type ModelId =
	| "google/gemini-3.5-flash"
	| "google/gemini-2.5-flash"
	| "google/gemini-3.5-flash-light";

export const SUPPORTED_MODELS: readonly ModelId[] = [
	"google/gemini-3.5-flash",
	"google/gemini-2.5-flash",
	"google/gemini-3.5-flash-light",
];

export function isSupportedModel(value: unknown): value is ModelId {
	return (
		typeof value === "string" && (SUPPORTED_MODELS as string[]).includes(value)
	);
}
