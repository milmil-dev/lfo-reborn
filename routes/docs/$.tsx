import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { Suspense, useEffect } from "react";
import { BeastCard } from "@/components/beast-card";
import { CharacterStandCard } from "@/components/character-stand-card";
import { DocsIndex } from "@/components/docs-index";
import { GiscusComments } from "@/components/giscus-comments";
import { GitHubChangelog } from "@/components/github-changelog";
import { ItemsGrid, ItemsIndex } from "@/components/items-table";
import { getMDXComponents } from "@/components/mdx";
import {
	MISSION_VERSIONS,
	PlotDetail,
	PlotIndex,
	PlotLanding,
	STORY_VERSIONS,
} from "@/components/plot-list";
import { SettingsButton } from "@/components/settings-dialog";
import { getCharacterColor } from "@/lib/characters";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export const Route = createFileRoute("/docs/$")({
	component: Page,
	loader: async ({ params }) => {
		const slugs = params._splat?.split("/") ?? [];
		const data = await serverLoader({ data: slugs });
		await clientLoader.preload(data.path);
		return { ...data, slugs };
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
	component: function MDXComponent({ toc, frontmatter, default: MDX }, _props: undefined) {
		// biome-ignore lint/correctness/useHookAtTopLevel: This is a component function
		useEffect(() => {
			if (frontmatter.title) {
				document.title = `${frontmatter.title} - LFO Wiki`;
			}
		}, [frontmatter.title]);

		const editUrl = "https://github.com/niskan516/lfo-wiki/edit/main/";

		const loaderData = Route.useLoaderData();
		const slugs = loaderData.slugs ?? [];
		const depth = slugs.length;
		const path = `/docs/${slugs.join("/")}`;

		const isCharacterPage = slugs.includes("character") && slugs.length >= 2;
		const isBeastPage = slugs.includes("beast") && slugs.length >= 2;
		const isItemsIndex = slugs.length === 1 && slugs[0] === "items";
		const isItemPage = slugs.includes("items") && slugs.length >= 2;
		const isDocsIndex = slugs.length === 0;
		const isPlotLanding = slugs.length === 1 && slugs[0] === "plot";
		const isPlotIndex =
			(slugs.length === 2 && slugs[0] === "plot" && slugs[1] === "story") ||
			(slugs.length === 2 && slugs[0] === "plot" && slugs[1] === "mission");
		const isPlotPage =
			slugs.length >= 3 && slugs[0] === "plot" && (slugs[1] === "story" || slugs[1] === "mission");

		// SSR-safe: hide title/description on character/beast pages using frontmatter
		const hideTitle =
			frontmatter.description?.startsWith("角色資料") ||
			frontmatter.description?.startsWith("兇獸檔案") ||
			isPlotPage;
		const isUpdatePage = slugs.length === 1 && slugs[0] === "update";
		const isStoryIndex = slugs.length === 2 && slugs[0] === "plot" && slugs[1] === "story";
		const isMissionIndex = slugs.length === 2 && slugs[0] === "plot" && slugs[1] === "mission";

		// Custom TOC for plot index pages (version anchors)
		const plotToc = isStoryIndex ? STORY_VERSIONS : isMissionIndex ? MISSION_VERSIONS : undefined;

		return (
			<DocsPage
				toc={isDocsIndex || isPlotPage ? undefined : (plotToc ?? toc)}
				tableOfContent={isDocsIndex ? { enabled: false } : { style: "clerk" }}
				breadcrumb={depth > 1 ? { includePage: true } : { enabled: false }}
			>
				{!hideTitle && !isDocsIndex && <DocsTitle>{frontmatter.title ?? ""}</DocsTitle>}
				{!hideTitle && !isDocsIndex && (
					<DocsDescription>{frontmatter.description ?? ""}</DocsDescription>
				)}
				{isDocsIndex && <DocsIndex />}
				{isCharacterPage && <CharacterStandCard path={path} />}
				{isBeastPage && <BeastCard path={path} />}
				{isItemsIndex && <ItemsIndex />}
				{isItemPage && <ItemsGrid />}
				{isPlotLanding && <PlotLanding />}
				{isPlotPage && <PlotDetail path={path} />}
				{!isPlotPage && !isDocsIndex && (
					<DocsBody>
						<MDX components={getMDXComponents()} />
						{isUpdatePage && <GitHubChangelog />}
						{isPlotIndex && <PlotIndex path={path} />}
					</DocsBody>
				)}
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

function useCharacterTheme(path: string | undefined) {
	useEffect(() => {
		if (!path) return;
		// Match character slug from path or URL
		const match =
			path.match(/character\/([^/]+?)(?:\/r)?$/) ??
			(typeof window !== "undefined"
				? window.location.pathname.match(/\/docs\/character\/([^/]+?)(?:\/r)?$/)
				: null);
		if (!match?.[1]) return;
		const color = getCharacterColor(match[1]);

		if (!color) return;

		const style = document.createElement("style");
		if (match?.[1]) {
			style.setAttribute("data-char-theme", match[1]);
		}
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
		<DocsLayout
			{...baseOptions()}
			tree={data.pageTree}
			nav={{ title: "LFO Wiki", children: <SettingsButton /> }}
		>
			<Suspense fallback={<DocsPageSkeleton />}>{clientLoader.useContent(data.path)}</Suspense>
		</DocsLayout>
	);
}
