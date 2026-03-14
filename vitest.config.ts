import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		tsconfigPaths: true,
	},
	test: {
		environment: "jsdom",
		include: ["test/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
		exclude: ["node_modules", "dist", ".vinxi", ".worktrees", "e2e"],
		setupFiles: ["./test/setup.ts"],
	},
});
