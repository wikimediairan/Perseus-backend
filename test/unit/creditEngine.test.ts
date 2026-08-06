import { describe, expect, it } from "vitest";
import {
	CREDIT_INCREMENT,
	INITIAL_WEEKLY_CREDIT,
	LOW_USAGE_WEEKS_LIMIT,
	MAX_WEEKLY_CREDIT,
} from "@/constants/credit";
import { evaluateWeeklyUsage } from "@/services/creditEngine";

const baseState = {
	weeklyCredit: INITIAL_WEEKLY_CREDIT,
	lowUsageWeeks: 0,
	fullUsageWeeks: 0,
};

describe("evaluateWeeklyUsage - low usage rule", () => {
	it("increments lowUsageWeeks when usage is below the threshold", () => {
		const result = evaluateWeeklyUsage(baseState, 0.05, 10);
		expect(result.lowUsageWeeks).toBe(1);
		expect(result.fullUsageWeeks).toBe(0);
		expect(result.disable).toBe(false);
	});

	it("resets fullUsageWeeks when usage is low", () => {
		const state = { ...baseState, fullUsageWeeks: 2 };
		const result = evaluateWeeklyUsage(state, 0.02, 10);
		expect(result.fullUsageWeeks).toBe(0);
	});

	it("does not disable before 4 consecutive low-usage weeks", () => {
		const state = { ...baseState, lowUsageWeeks: LOW_USAGE_WEEKS_LIMIT - 2 };
		const result = evaluateWeeklyUsage(state, 0.01, 10);
		expect(result.lowUsageWeeks).toBe(LOW_USAGE_WEEKS_LIMIT - 1);
		expect(result.disable).toBe(false);
	});

	it("disables the user and releases credit on the 4th consecutive low-usage week", () => {
		const state = { ...baseState, lowUsageWeeks: LOW_USAGE_WEEKS_LIMIT - 1 };
		const result = evaluateWeeklyUsage(state, 0, 10);
		expect(result.lowUsageWeeks).toBe(LOW_USAGE_WEEKS_LIMIT);
		expect(result.disable).toBe(true);
		expect(result.releasedCredit).toBe(INITIAL_WEEKLY_CREDIT);
		expect(result.weeklyCredit).toBe(0);
	});
});

describe("evaluateWeeklyUsage - full usage rule", () => {
	it("increments fullUsageWeeks when the full weekly credit is consumed", () => {
		const result = evaluateWeeklyUsage(baseState, INITIAL_WEEKLY_CREDIT, 10);
		expect(result.fullUsageWeeks).toBe(1);
		expect(result.lowUsageWeeks).toBe(0);
	});

	it("resets lowUsageWeeks when usage is full", () => {
		const state = { ...baseState, lowUsageWeeks: 2 };
		const result = evaluateWeeklyUsage(state, INITIAL_WEEKLY_CREDIT, 10);
		expect(result.lowUsageWeeks).toBe(0);
	});

	it("does not increase credit before 4 consecutive full-usage weeks", () => {
		const state = { ...baseState, fullUsageWeeks: 2 };
		const result = evaluateWeeklyUsage(state, INITIAL_WEEKLY_CREDIT, 10);
		expect(result.fullUsageWeeks).toBe(3);
		expect(result.increaseApplied).toBe(0);
		expect(result.weeklyCredit).toBe(INITIAL_WEEKLY_CREDIT);
	});

	it("increases weekly credit after 4 consecutive full-usage weeks when budget allows", () => {
		const state = { ...baseState, fullUsageWeeks: 3 };
		const result = evaluateWeeklyUsage(state, INITIAL_WEEKLY_CREDIT, 10);
		expect(result.fullUsageWeeks).toBe(0);
		expect(result.increaseApplied).toBe(CREDIT_INCREMENT);
		expect(result.weeklyCredit).toBeCloseTo(
			INITIAL_WEEKLY_CREDIT + CREDIT_INCREMENT,
		);
		expect(result.queuedIncrease).toBe(0);
	});

	it("queues the increase instead of applying it when budget is unavailable", () => {
		const state = { ...baseState, fullUsageWeeks: 3 };
		const result = evaluateWeeklyUsage(state, INITIAL_WEEKLY_CREDIT, 0);
		expect(result.increaseApplied).toBe(0);
		expect(result.queuedIncrease).toBe(CREDIT_INCREMENT);
		expect(result.weeklyCredit).toBe(INITIAL_WEEKLY_CREDIT);
	});

	it("never increases credit past the maximum weekly credit", () => {
		const state = {
			...baseState,
			weeklyCredit: MAX_WEEKLY_CREDIT,
			fullUsageWeeks: 3,
		};
		const result = evaluateWeeklyUsage(state, MAX_WEEKLY_CREDIT, 10);
		expect(result.increaseApplied).toBe(0);
		expect(result.queuedIncrease).toBe(0);
		expect(result.weeklyCredit).toBe(MAX_WEEKLY_CREDIT);
		expect(result.fullUsageWeeks).toBe(0);
	});
});

describe("evaluateWeeklyUsage - partial usage", () => {
	it("resets both streak counters on a week that is neither low nor full", () => {
		const state = { ...baseState, lowUsageWeeks: 2, fullUsageWeeks: 1 };
		const result = evaluateWeeklyUsage(state, 0.13, 10);
		expect(result.lowUsageWeeks).toBe(0);
		expect(result.fullUsageWeeks).toBe(0);
		expect(result.disable).toBe(false);
		expect(result.increaseApplied).toBe(0);
		expect(result.weeklyCredit).toBe(INITIAL_WEEKLY_CREDIT);
	});
});
