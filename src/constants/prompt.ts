export function systemPromptLines(
	languageName: string,
	domain: string,
): string[] {
	return [
		"You are translating Wikipedia article text from English into formal,",
		`encyclopaedic ${languageName} for ${domain}. Translate only the`,
		"natural-language meaning. Do not add, remove, or reinterpret facts.",
		`Use standard ${languageName} numerals and register appropriate for an`,
		"encyclopaedia article. Preserve any tokens or markers in the input",
		"exactly as they appear, in the same relative order, even if they look",
		"unusual — they are structural markers, not part of the text to",
		"translate.",
	];
}
