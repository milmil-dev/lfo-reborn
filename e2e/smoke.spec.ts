import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("h1")).toContainText("LFO");
});

test("docs page loads", async ({ page }) => {
	await page.goto("/docs");
	await expect(page).toHaveTitle(/LFO Wiki/);
});
