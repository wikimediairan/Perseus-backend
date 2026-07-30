import type { Env } from "@/config/env";
import type { ModelId } from "@/constants/models";
import {
	OPENROUTER_CHAT_COMPLETIONS_URL,
	OPENROUTER_TITLE_HEADER,
	TRANSLATION_TEMPERATURE,
} from "@/constants/provider";
import type { TargetWikiCode } from "@/constants/targetWikis";
import { PerseusError } from "@/shared/errors";

export interface TranslationRequest {
	systemPrompt: string;
	sourceText: string;
	targetLanguage: TargetWikiCode;
	model: ModelId;
}

export interface TranslationUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cost?: number;
}

export interface TranslationResult {
	translatedText: string;
	usage?: TranslationUsage;
}

export type Translate = (
	request: TranslationRequest,
) => Promise<TranslationResult>;

interface ChatCompletionResponse {
	choices?: { message?: { content?: string } }[];
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		cost?: number;
	};
	error?: {
		message?: string;
		code?: string;
	};
}

async function parseResponse(response: Response): Promise<{
	rawBody: string;
	body?: ChatCompletionResponse;
}> {
	const rawBody = await response.text();

	try {
		return {
			rawBody,
			body: JSON.parse(rawBody) as ChatCompletionResponse,
		};
	} catch {
		return {
			rawBody,
			body: undefined,
		};
	}
}

function isRetryableStatus(status: number): boolean {
	return (
		status === 408 ||
		status === 409 ||
		status === 425 ||
		status === 429 ||
		status >= 500
	);
}

export function createOpenRouterTranslate(env: Env): Translate {
	const apiKey = env.OPENROUTER_API_KEY;

	if (!apiKey) {
		throw new PerseusError(
			"ConfigurationError",
			"No API key configured for OpenRouter.",
			{
				stage: "llm-translation",
				retryable: false,
				context: {
					provider: "openrouter",
					code: "missing_api_key",
				},
			},
		);
	}

	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${apiKey}`,
		"X-Title": OPENROUTER_TITLE_HEADER,
	};

	return async (request) => {
		const payload = {
			model: request.model,
			messages: [
				{
					role: "system",
					content: request.systemPrompt,
				},
				{
					role: "user",
					content: request.sourceText,
				},
			],
			temperature: TRANSLATION_TEMPERATURE,
		};

		let response: Response;

		try {
			response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			});
		} catch (cause) {
			throw new PerseusError("ProviderError", "Could not reach OpenRouter.", {
				stage: "llm-translation",
				cause,
				retryable: true,
				context: {
					provider: "openrouter",
					code: "network_error",
				},
			});
		}

		const { rawBody, body } = await parseResponse(response);

		if (!response.ok) {
			throw new PerseusError(
				"ProviderError",
				body?.error?.message ??
					`OpenRouter request failed (HTTP ${response.status}).`,
				{
					stage: "llm-translation",
					retryable: isRetryableStatus(response.status),
					context: {
						provider: "openrouter",
						status: response.status,
						code: body?.error?.code ?? `http_${response.status}`,
						providerMessage: body?.error?.message ?? rawBody,
						model: request.model,
					},
				},
			);
		}

		const content = body?.choices?.[0]?.message?.content;

		if (typeof content !== "string" || content.trim().length === 0) {
			throw new PerseusError(
				"ProviderError",
				"OpenRouter returned an empty translation.",
				{
					stage: "llm-translation",
					retryable: false,
					context: {
						provider: "openrouter",
						code: "empty_response",
						model: request.model,
					},
				},
			);
		}

		const usageBody = body?.usage;

		const usage: TranslationUsage | undefined =
			usageBody &&
			typeof usageBody.prompt_tokens === "number" &&
			typeof usageBody.completion_tokens === "number" &&
			typeof usageBody.total_tokens === "number"
				? {
						promptTokens: usageBody.prompt_tokens,
						completionTokens: usageBody.completion_tokens,
						totalTokens: usageBody.total_tokens,
						...(typeof usageBody.cost === "number"
							? { cost: usageBody.cost }
							: {}),
					}
				: typeof usageBody?.cost === "number"
					? {
							promptTokens: 0,
							completionTokens: 0,
							totalTokens: 0,
							cost: usageBody.cost,
						}
					: undefined;

		return {
			translatedText: content,
			usage,
		};
	};
}
