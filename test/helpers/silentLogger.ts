import type { Logger } from "@/shared/logger";

export function createSilentLogger(): Logger {
	const logger: Logger = {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		forStage: () => logger,
	};
	return logger;
}
