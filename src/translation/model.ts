import {
	isSupportedModel,
	type ModelId,
	SUPPORTED_MODELS,
} from "@/constants/models";
import { PerseusError } from "@/shared/errors";

export function resolveModel(model: string): ModelId {
	if (!isSupportedModel(model)) {
		throw new PerseusError(
			"InputError",
			`Unsupported model "${model}". Supported values: ${SUPPORTED_MODELS.join(", ")}.`,
			{ stage: "llm-translation" },
		);
	}

	return model;
}
