export function fixtureRevisionHtml(paragraphText: string): string {
	return `<!DOCTYPE html><html><head><title>Test Article</title></head><body><p>${paragraphText}</p></body></html>`;
}

export function openRouterSuccessBody(translatedText: string, cost: number) {
	return JSON.stringify({
		choices: [{ message: { content: translatedText } }],
		usage: { cost },
	});
}
