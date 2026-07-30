import {
	WIKIMEDIA_REQUEST_HEADERS,
	WIKIPEDIA_DOMAIN,
} from "@/constants/wikimedia";
import { PerseusError } from "@/shared/errors";

/** Fetches the rendered HTML body for a specific, immutable Wikipedia revision. */
export async function fetchRevisionHtml(revisionId: number): Promise<string> {
	const endpoint = `https://${WIKIPEDIA_DOMAIN}/w/rest.php/v1/revision/${revisionId}/html`;

	let response: Response;

	try {
		response = await fetch(endpoint, { headers: WIKIMEDIA_REQUEST_HEADERS });
	} catch (error) {
		throw new PerseusError(
			"ParsingError",
			"Could not reach Wikipedia to load the saved revision.",
			{ stage: "parse-with-parsoid", cause: error },
		);
	}

	if (response.status === 404) {
		throw new PerseusError(
			"ParsingError",
			`Wikipedia revision ${revisionId} could not be found. It may have been deleted or oversighted.`,
			{ stage: "parse-with-parsoid" },
		);
	}

	if (!response.ok) {
		throw new PerseusError(
			"ParsingError",
			`Failed to load revision ${revisionId} (HTTP ${response.status}).`,
			{ stage: "parse-with-parsoid", context: { status: response.status } },
		);
	}

	const fullHtml = await response.text();
	const document = new DOMParser().parseFromString(fullHtml, "text/html");
	return document.body ? document.body.innerHTML : fullHtml;
}
