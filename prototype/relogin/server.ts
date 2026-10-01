import { resolve, sep } from "node:path";
import index from "./index.html";

// story assets from prepare-assets.ts; shared assets (the chrome logo) from the repo's data/ dir
const ROOTS = [resolve(import.meta.dir, "assets"), resolve(import.meta.dir, "../../data/assets")];
const port = Number(process.env.PORT ?? 4173);

Bun.serve({
	port,
	routes: {
		"/": index,
		"/assets/*": async (req) => {
			// decode before validating, then make sure the resolved path stays inside an assets root
			const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/assets\/?/, "");
			for (const root of ROOTS) {
				const target = resolve(root, rel);
				if (!target.startsWith(root + sep)) return new Response("bad path", { status: 400 });
				const file = Bun.file(target);
				if (await file.exists()) return new Response(file);
			}
			return new Response("not found", { status: 404 });
		},
	},
	development: { hmr: true, console: true },
});

console.log(`LFO relogin prototype → http://localhost:${port}`);
