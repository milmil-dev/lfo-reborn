# Vite + TanStack Start Migration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from Next.js to Vite 8 + TanStack Start with Serwist PWA support, while keeping all 506 MDX content pages, theme, and components intact.

**Architecture:** Replace Next.js with Vite + TanStack Start as the framework layer. Fumadocs MDX switches from `fumadocs-mdx/next` to `fumadocs-mdx/vite` plugin. TanStack Router file-based routing replaces Next.js App Router. All content, theme CSS, and UI components remain unchanged.

**Tech Stack:** Vite 8, TanStack Start, TanStack Router, Fumadocs (fumadocs-ui, fumadocs-core, fumadocs-mdx), Tailwind CSS v4, Serwist (PWA), Bun, Biome

---

## Chunk 1: Swap Dependencies & Config

### Task 1: Replace Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove Next.js dependencies**

```bash
bun remove next @types/mdx
```

- [ ] **Step 2: Add Vite + TanStack dependencies**

```bash
bun add @tanstack/react-router @tanstack/react-start vite@latest @vitejs/plugin-react
bun add -d @tanstack/router-plugin vite-tsconfig-paths
```

- [ ] **Step 3: Update package.json scripts**

Replace the scripts section:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "vite preview",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write ."
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: swap Next.js for Vite + TanStack Start dependencies"
```

### Task 2: Create Vite Config

**Files:**
- Create: `vite.config.ts`
- Delete: `next.config.mjs`
- Delete: `next-env.d.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Create vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import mdx from "fumadocs-mdx/vite";
import * as MdxConfig from "./source.config";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: {
		port: 3000,
	},
	plugins: [
		mdx(MdxConfig),
		tailwindcss(),
		tsConfigPaths({
			projects: ["./tsconfig.json"],
		}),
		tanstackStart({
			prerender: {
				enabled: true,
			},
		}),
		react(),
	],
});
```

- [ ] **Step 2: Replace postcss.config.mjs with @tailwindcss/vite**

Since we're using `@tailwindcss/vite` now, remove `postcss.config.mjs` and swap `@tailwindcss/postcss` for `@tailwindcss/vite`:

```bash
bun remove @tailwindcss/postcss postcss
bun add -d @tailwindcss/vite
rm postcss.config.mjs
```

- [ ] **Step 3: Update tsconfig.json**

Replace the tsconfig with TanStack-compatible config:

```json
{
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "incremental": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "paths": {
      "@/*": ["./*"],
      "collections/*": ["./.source/*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".source/**/*.ts"
  ],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Delete Next.js files**

```bash
rm -f next.config.mjs next-env.d.ts postcss.config.mjs
```

- [ ] **Step 5: Update source.config.ts**

The source.config.ts stays the same but verify it uses the correct import:

```ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
	dir: "content/docs",
});

export default defineConfig();
```

- [ ] **Step 6: Update .gitignore**

Replace `.next` with `dist` and `.vinxi`:

Replace:
```
# next.js
.next
out
```

With:
```
# vite / tanstack
dist
.vinxi
.output
```

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts tsconfig.json source.config.ts .gitignore
git rm next.config.mjs next-env.d.ts postcss.config.mjs
git commit -m "chore: add Vite + TanStack Start config, remove Next.js config"
```

---

## Chunk 2: Create Route Files

### Task 3: Update lib/source.ts

**Files:**
- Modify: `lib/source.ts`

- [ ] **Step 1: Update import path**

Change from `fumadocs-mdx:collections/server` to `collections/server`:

```ts
import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});
```

- [ ] **Step 2: Commit**

```bash
git add lib/source.ts
git commit -m "refactor: update source.ts import for Vite collections path"
```

### Task 4: Create Root Route

**Files:**
- Create: `routes/__root.tsx`
- Move: `app/global.css` → `styles/app.css`

- [ ] **Step 1: Move CSS file**

```bash
mkdir -p styles
mv app/global.css styles/app.css
```

- [ ] **Step 2: Create routes/__root.tsx**

```tsx
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "../styles/app.css";
```

Wait — `next/font/google` won't work without Next.js. We need to load fonts differently. Use `@fontsource` or a `<link>` tag instead.

```tsx
import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import "../styles/app.css";

export const Route = createRootRoute({
	component: RootComponent,
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "LFO Wiki - 小朋友齊打交Online百科" },
			{
				name: "description",
				content: "小朋友齊打交Online遊戲百科全書",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@400;700&display=swap",
			},
		],
	}),
});

function RootComponent() {
	return (
		<html
			lang="zh-Hant"
			className="dark"
			suppressHydrationWarning
		>
			<head>
				<HeadContent />
			</head>
			<body
				className="flex min-h-screen flex-col"
				style={{ fontFamily: "'Noto Sans TC', sans-serif" }}
			>
				<RootProvider theme={{ defaultTheme: "dark", forcedTheme: "dark" }}>
					<Outlet />
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
```

- [ ] **Step 3: Add font-family to CSS**

In `styles/app.css`, add after the imports:

```css
:root {
	--font-sans: "Noto Sans TC", sans-serif;
	--font-serif: "Noto Serif TC", serif;
}
```

- [ ] **Step 4: Commit**

```bash
git add routes/__root.tsx styles/app.css
git commit -m "feat: create root route with RootProvider and font loading"
```

### Task 5: Create Landing Page Route

**Files:**
- Create: `routes/index.tsx`

- [ ] **Step 1: Create routes/index.tsx**

Move the landing page content from `app/(home)/page.tsx` into a TanStack route:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
// Import the landing page as a component
import HomePage from "@/components/home-page";

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<HomeLayout {...baseOptions()}>
			<HomePage />
		</HomeLayout>
	);
}
```

- [ ] **Step 2: Move landing page to components/home-page.tsx**

Move `app/(home)/page.tsx` → `components/home-page.tsx`.

Change `export default function HomePage()` to keep it as default export. Remove the `"use client"` directive (not needed in Vite).

- [ ] **Step 3: Commit**

```bash
git add routes/index.tsx components/home-page.tsx
git commit -m "feat: create landing page route"
```

### Task 6: Create Docs Route

**Files:**
- Create: `routes/docs/$.tsx`
- Create: `components/mdx.tsx`

- [ ] **Step 1: Create components/mdx.tsx**

```tsx
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		...components,
	} satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
```

- [ ] **Step 2: Create routes/docs/$.tsx**

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { createServerFn } from "@tanstack/react-start";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { Suspense } from "react";
import browserCollections from "collections/browser";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";
import { useMDXComponents } from "@/components/mdx";
import { GiscusComments } from "@/components/giscus-comments";

export const Route = createFileRoute("/docs/$")({
	component: Page,
	loader: async ({ params }) => {
		const slugs = params._splat?.split("/") ?? [];
		const data = await serverLoader({ data: slugs });
		await clientLoader.preload(data.path);
		return data;
	},
});

const serverLoader = createServerFn({
	method: "GET",
})
	.inputValidator((slugs: string[]) => slugs)
	.handler(async ({ data: slugs }) => {
		const page = source.getPage(slugs);
		if (!page) throw notFound();

		return {
			path: page.path,
			pageTree: await source.serializePageTree(source.getPageTree()),
		};
	});

const clientLoader = browserCollections.docs.createClientLoader({
	component({ toc, frontmatter, default: MDX }, _props: undefined) {
		const editUrl = `https://github.com/niskan516/lfo-wiki/edit/main/${frontmatter._file?.path ?? ""}`;

		return (
			<DocsPage toc={toc}>
				<DocsTitle>{frontmatter.title}</DocsTitle>
				<DocsDescription>{frontmatter.description}</DocsDescription>
				<DocsBody>
					<MDX components={useMDXComponents()} />
				</DocsBody>
				<a
					href={editUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-8 inline-flex items-center gap-1 text-sm text-fd-muted-foreground hover:text-fd-foreground"
				>
					在 GitHub 上編輯此頁
				</a>
				<GiscusComments />
			</DocsPage>
		);
	},
});

function Page() {
	const data = useFumadocsLoader(Route.useLoaderData());

	return (
		<DocsLayout {...baseOptions()} tree={data.pageTree}>
			<Suspense>{clientLoader.useContent(data.path)}</Suspense>
		</DocsLayout>
	);
}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p routes/docs
git add routes/docs/\$.tsx components/mdx.tsx
git commit -m "feat: create docs catch-all route with DocsLayout"
```

### Task 7: Create Search API Route

**Files:**
- Create: `routes/api/search.ts`

- [ ] **Step 1: Create routes/api/search.ts**

```ts
import { createFileRoute } from "@tanstack/react-router";
import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

const server = createFromSource(source, {
	language: "chinese",
});

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async ({ request }) => server.GET(request),
		},
	},
});
```

- [ ] **Step 2: Commit**

```bash
mkdir -p routes/api
git add routes/api/search.ts
git commit -m "feat: create search API route"
```

---

## Chunk 3: Cleanup & Verify

### Task 8: Remove Old Next.js App Directory

**Files:**
- Delete: `app/` directory entirely

- [ ] **Step 1: Remove the entire app/ directory**

```bash
rm -rf app/
```

- [ ] **Step 2: Commit**

```bash
git rm -r app/
git commit -m "chore: remove Next.js app directory"
```

### Task 9: Update Biome Config

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: Update ignored directories**

In `biome.json`, the VCS ignore handles `.gitignore` patterns. Just verify `.source` and `dist` are in `.gitignore` (they should be from Task 2).

- [ ] **Step 2: Run lint fix**

```bash
bun run lint:fix
```

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "style: lint fix after migration"
```

### Task 10: Build Verification

- [ ] **Step 1: Clear old caches**

```bash
rm -rf .next .source .vinxi dist node_modules/.vite
```

- [ ] **Step 2: Run dev server**

```bash
bun run dev
```

Expected: Vite dev server starts at http://localhost:3000. Check:
- Landing page renders at `/`
- Docs render at `/docs`
- Character pages work at `/docs/character/davis`
- Sidebar shows all 19 sections with correct Chinese names
- Search works

- [ ] **Step 3: Run production build**

```bash
bun run build
```

Expected: Build succeeds, pages are pre-rendered.

- [ ] **Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve migration issues"
```

### Task 11: Final Cleanup

- [ ] **Step 1: Remove any leftover Next.js references**

Search for any remaining `next` imports or references:

```bash
grep -r "from \"next" routes/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Fix any found. The `motion` package import stays — it's framework-agnostic.

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "chore: complete Next.js to Vite + TanStack Start migration"
```

---

## Chunk 4: PWA with Serwist

### Task 12: Install Serwist and Configure PWA

**Files:**
- Modify: `vite.config.ts`
- Create: `sw.ts`
- Create: `public/manifest.json`
- Modify: `routes/__root.tsx`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install Serwist**

```bash
bun add -d @serwist/vite serwist
```

- [ ] **Step 2: Add Serwist plugin to vite.config.ts**

Add the serwist import and plugin to the existing config:

```ts
import { serwist } from "@serwist/vite";
```

Add to plugins array (before `react()`):

```ts
serwist({
	swSrc: "sw.ts",
	swDest: "sw.js",
	globDirectory: "dist",
	injectionPoint: "self.__SW_MANIFEST",
	rollupFormat: "iife",
}),
```

- [ ] **Step 3: Create sw.ts (service worker)**

Create `sw.ts` in project root:

```ts
import { defaultCache } from "@serwist/vite/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
	interface WorkerGlobalScope extends SerwistGlobalConfig {
		__SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
	}
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
	precacheEntries: self.__SW_MANIFEST,
	skipWaiting: true,
	clientsClaim: true,
	navigationPreload: true,
	runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 4: Create public/manifest.json**

```json
{
	"name": "LFO Wiki - 小朋友齊打交Online百科",
	"short_name": "LFO Wiki",
	"description": "小朋友齊打交Online遊戲百科全書",
	"icons": [
		{
			"src": "/icons/icon-192x192.png",
			"sizes": "192x192",
			"type": "image/png",
			"purpose": "maskable"
		},
		{
			"src": "/icons/icon-512x512.png",
			"sizes": "512x512",
			"type": "image/png"
		}
	],
	"theme_color": "#0472B9",
	"background_color": "#0d1117",
	"start_url": "/",
	"display": "standalone",
	"orientation": "portrait"
}
```

- [ ] **Step 5: Add PWA meta tags to __root.tsx head**

In the `head()` function of `routes/__root.tsx`, add to the `meta` array:

```ts
{ name: "theme-color", content: "#0472B9" },
```

And add to the `links` array:

```ts
{ rel: "manifest", href: "/manifest.json" },
{ rel: "apple-touch-icon", href: "/icons/icon-192x192.png" },
```

- [ ] **Step 6: Register service worker in __root.tsx**

Add SW registration in the `RootComponent`:

```tsx
import { useEffect } from "react";

function RootComponent() {
	useEffect(() => {
		if ("serviceWorker" in navigator) {
			import("virtual:serwist").then(({ getSerwist }) => {
				getSerwist().then((sw) => {
					sw?.register();
				});
			});
		}
	}, []);

	return (
		// ... existing JSX
	);
}
```

- [ ] **Step 7: Update tsconfig.json**

Add Serwist types. In `compilerOptions.types`, add:

```json
{
	"compilerOptions": {
		"types": ["@serwist/vite/typings"]
	}
}
```

Note: Do NOT add `"webworker"` to `lib` in the main tsconfig as it conflicts with DOM types. The sw.ts file uses `declare const self` which is sufficient.

- [ ] **Step 8: Update .gitignore**

Add under the Serwist section:

```
# serwist
public/sw*
public/swe-worker*
```

- [ ] **Step 9: Create placeholder icons**

```bash
mkdir -p public/icons
# Create minimal placeholder SVG icons (replace with real icons later)
```

For now, we'll skip actual icon files — the PWA will still work without them, just won't have icons on home screens.

- [ ] **Step 10: Commit**

```bash
git add sw.ts public/manifest.json vite.config.ts routes/__root.tsx tsconfig.json .gitignore
git commit -m "feat: add PWA support with Serwist service worker"
```

### Task 13: PWA Build Verification

- [ ] **Step 1: Build and verify service worker is generated**

```bash
bun run build
ls dist/sw.js
```

Expected: `dist/sw.js` exists and contains precache manifest.

- [ ] **Step 2: Test with preview server**

```bash
bun run start
```

Open browser DevTools → Application → Service Workers. Verify the SW registers.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve PWA build issues"
```
