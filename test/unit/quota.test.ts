import { describe, expect, it } from "vitest";
import {
	mondayOfWeekUtc,
	nextResetIso,
	weekStartKey,
} from "@/repositories/quota";

describe("quota date math", () => {
	it("anchors to the same Monday for any day within that week", () => {
		const days = [
			"2026-07-27T00:00:00Z", // Monday
			"2026-07-28T12:00:00Z", // Tuesday
			"2026-07-31T23:59:59Z", // Friday
			"2026-08-02T05:00:00Z", // Sunday
		];

		for (const iso of days) {
			expect(weekStartKey(new Date(iso))).toBe("2026-07-27");
		}
	});

	it("rolls Sunday back to the *previous* Monday, not forward", () => {
		expect(weekStartKey(new Date("2026-08-02T23:59:59Z"))).toBe("2026-07-27");
	});

	it("computes resetsAt as the following Monday 00:00 UTC", () => {
		const midWeek = new Date("2026-07-29T15:30:00Z"); // Wednesday
		expect(nextResetIso(midWeek)).toBe("2026-08-03T00:00:00.000Z");
	});

	it("mondayOfWeekUtc is idempotent for a Monday at midnight", () => {
		const monday = new Date("2026-07-27T00:00:00.000Z");
		expect(mondayOfWeekUtc(monday).toISOString()).toBe(monday.toISOString());
	});
});
