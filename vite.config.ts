import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import * as MdxConfig from "./source.config";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
	},
	server: {
		port: 3000,
	},
	plugins: [
		mdx(MdxConfig),
		tailwindcss(),
		tanstackStart({
			srcDirectory: ".",
			router: {
				routesDirectory: "./routes",
				generatedRouteTree: "./routeTree.gen.ts",
			},
			prerender: {
				enabled: true,
			},
		}),
		react(),
	],
});
