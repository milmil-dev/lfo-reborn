import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { Suspense, useEffect } from "react";
import { BeastCard } from "@/components/beast-card";
import { CharacterStandCard } from "@/components/character-stand-card";
import { GiscusComments } from "@/components/giscus-comments";
import { ItemsIndex, ItemsTable } from "@/components/items-table";
import { getMDXComponents } from "@/components/mdx";
import { MissionDetail, MissionList } from "@/components/mission-list";
import { StoryDetail, StoryList } from "@/components/story-list";
import { getCharacterColor } from "@/lib/characters";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

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
		const path = typeof window !== "undefined" ? window.location.pathname : "";
		const depth = path
			.replace(/^\/docs\//, "")
			.split("/")
			.filter(Boolean).length;

		const isCharacterPage = path.includes("/character/") && depth >= 2;
		const isBeastPage = path.includes("/beast/") && depth >= 2;
		const isItemsIndex = path.endsWith("/items") || path.endsWith("/items/");
		const isItemPage = path.includes("/items/") && depth >= 2;
		const isMissionIndex = path.endsWith("/missionindex") || path.endsWith("/missionindex/");
		const isMissionPage = path.includes("/missionindex/") && depth >= 2;
		const isStoryIndex = path.endsWith("/storyindex") || path.endsWith("/storyindex/");
		const isStoryPage = path.includes("/storyindex/") && depth >= 2;

		return (
			<DocsPage toc={toc} breadcrumb={depth > 1 ? { includePage: true } : { enabled: false }}>
				<DocsTitle>{frontmatter.title}</DocsTitle>
				<DocsDescription>{frontmatter.description}</DocsDescription>
				{isCharacterPage && <CharacterStandCard />}
				{isBeastPage && <BeastCard />}
				{isItemsIndex && <ItemsIndex />}
				{isItemPage && <ItemsTable />}
				{isMissionIndex && <MissionList />}
				{isMissionPage && <MissionDetail />}
				{isStoryIndex && <StoryList />}
				{isStoryPage && <StoryDetail />}
				<DocsBody>
					<MDX components={getMDXComponents()} />
				</DocsBody>
				<a
					href={editUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="link-primary mt-8 inline-flex items-center gap-1 text-sm text-fd-muted-foreground"
				>
					在 GitHub 上編輯此頁
				</a>
				<GiscusComments />
			</DocsPage>
		);
	},
});

function DocsPageSkeleton() {
	return (
		<DocsPage>
			<div className="animate-pulse space-y-4">
				<div className="h-8 w-2/3 rounded bg-fd-muted" />
				<div className="h-4 w-1/2 rounded bg-fd-muted" />
				<div className="mt-8 space-y-3">
					<div className="h-4 w-full rounded bg-fd-muted" />
					<div className="h-4 w-5/6 rounded bg-fd-muted" />
					<div className="h-4 w-4/6 rounded bg-fd-muted" />
				</div>
			</div>
		</DocsPage>
	);
}

function useCharacterTheme(path: string) {
	useEffect(() => {
		// Match character slug from path or URL
		const match =
			path.match(/character\/([^/]+?)(?:\/r)?$/) ??
			window.location.pathname.match(/\/docs\/character\/([^/]+?)(?:\/r)?$/);
		if (!match) return;

		const color = getCharacterColor(match[1]);
		if (!color) return;

		const style = document.createElement("style");
		style.setAttribute("data-char-theme", match[1]);
		style.textContent = `
			:root, :root.dark, .light, .dark {
				--color-fd-primary: ${color} !important;
				--color-fd-ring: ${color} !important;
				--color-fd-accent: ${color}40 !important;
				--color-fd-primary-foreground: #fff !important;
			}
		`;
		document.head.appendChild(style);

		return () => {
			style.remove();
		};
	}, [path]);
}

function Page() {
	const data = useFumadocsLoader(Route.useLoaderData());
	useCharacterTheme(data.path);

	return (
		<DocsLayout {...baseOptions()} tree={data.pageTree}>
			<Suspense fallback={<DocsPageSkeleton />}>{clientLoader.useContent(data.path)}</Suspense>
		</DocsLayout>
	);
}
