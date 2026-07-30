import { z } from "zod";
import { SOURCE_WIKI_CODE } from "@/constants/wikimedia";

export const translateRequestSchema = z.object({
	source: z.object({
		wiki: z.literal(SOURCE_WIKI_CODE),
		pageId: z.number().int().positive(),
		revisionId: z.number().int().positive(),
	}),
	chunk: z.string().min(1),
	targetWiki: z.string().min(1),
	model: z.string().min(1),
});

export type TranslateRequestBody = z.infer<typeof translateRequestSchema>;
