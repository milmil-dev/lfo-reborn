import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { Suspense } from "react";
import { GiscusComments } from "@/components/giscus-comments";
import { getMDXComponents } from "@/components/mdx";
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

		return (
			<DocsPage toc={toc}>
				<DocsTitle>{frontmatter.title}</DocsTitle>
				<DocsDescription>{frontmatter.description}</DocsDescription>
				<DocsBody>
					<MDX components={getMDXComponents()} />
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
