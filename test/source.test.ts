import { describe, expect, it } from "vitest";

describe("source config", () => {
	it("exports docs collection config", async () => {
		const { docs } = await import("../source.config");
		expect(docs).toBeDefined();
	});
});
