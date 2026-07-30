import { LOGGABLE_ERROR_CONTEXT_KEYS } from "@/constants/errors";
import type { PipelineStageName } from "@/shared/logger";

export type PerseusErrorCategory =
	| "InputError"
	| "ParsingError"
	| "ProviderError"
	| "ConfigurationError";

export type BackendErrorCategory = "AuthError" | "QuotaExceededError";

export type AnyErrorCategory = PerseusErrorCategory | BackendErrorCategory;

export interface PerseusErrorContext extends Record<string, unknown> {
	provider?: string;
	status?: number;
	code?: string;
	providerMessage?: string;
	notFound?: boolean;
}

export interface PerseusErrorOptions {
	stage?: PipelineStageName;
	cause?: unknown;
	context?: PerseusErrorContext;
	retryable?: boolean;
}

export class PerseusError extends Error {
	public readonly category: PerseusErrorCategory;

	public readonly stage?: PipelineStageName;

	public readonly retryable?: boolean;

	public readonly context?: PerseusErrorContext;

	constructor(
		category: PerseusErrorCategory,
		message: string,
		options: PerseusErrorOptions = {},
	) {
		super(message, { cause: options.cause });

		this.name = "PerseusError";
		this.category = category;
		this.stage = options.stage;
		this.retryable = options.retryable;
		this.context = options.context;
	}
}

export class BackendError extends Error {
	public readonly category: BackendErrorCategory;

	public readonly context?: Record<string, unknown>;

	constructor(
		category: BackendErrorCategory,
		message: string,
		context?: Record<string, unknown>,
	) {
		super(message);

		this.name = "BackendError";
		this.category = category;
		this.context = context;
	}
}

export interface ErrorEnvelope {
	error: {
		category: AnyErrorCategory | "InternalError";
		message: string;
		requestId: string;
	};
}

const STATUS_BY_CATEGORY: Record<AnyErrorCategory, number> = {
	AuthError: 401,
	QuotaExceededError: 429,
	InputError: 400,
	ParsingError: 502,
	ProviderError: 502,
	ConfigurationError: 500,
};

function sanitizeContext(
	context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!context) return;

	const out: Record<string, unknown> = {};

	for (const key of Object.keys(context)) {
		if (LOGGABLE_ERROR_CONTEXT_KEYS.has(key)) {
			out[key] = context[key];
		}
	}

	return Object.keys(out).length === 0 ? undefined : out;
}

export function toHttpError(
	err: unknown,
	requestId: string,
): {
	status: number;
	body: ErrorEnvelope;
	logContext?: Record<string, unknown>;
} {
	if (err instanceof PerseusError) {
		const status =
			err.category === "InputError" && err.context?.notFound === true
				? 404
				: STATUS_BY_CATEGORY[err.category];

		return {
			status,
			body: {
				error: {
					category: err.category,
					message: err.message,
					requestId,
				},
			},
			logContext: sanitizeContext({
				stage: err.stage,
				retryable: err.retryable,
				...err.context,
			}),
		};
	}

	if (err instanceof BackendError) {
		return {
			status: STATUS_BY_CATEGORY[err.category],
			body: {
				error: {
					category: err.category,
					message: err.message,
					requestId,
				},
			},
			logContext: sanitizeContext(err.context),
		};
	}

	return {
		status: 500,
		body: {
			error: {
				category: "InternalError",
				message: "An internal error occurred.",
				requestId,
			},
		},
	};
}
