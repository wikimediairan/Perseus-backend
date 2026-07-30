export function fixtureRevisionHtml(paragraphText: string): string {
	return `<!DOCTYPE html><html><head><title>Test Article</title></head><body><p>${paragraphText}</p></body></html>`;
}

export function openRouterSuccessBody(
	translatedText: string,
	usage: { prompt: number; completion: number },
) {
	return JSON.stringify({
		choices: [{ message: { content: translatedText } }],
		usage: {
			prompt_tokens: usage.prompt,
			completion_tokens: usage.completion,
			total_tokens: usage.prompt + usage.completion,
		},
	});
}
