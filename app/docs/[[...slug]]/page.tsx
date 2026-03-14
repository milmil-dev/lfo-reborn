import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { GiscusComments } from "@/components/giscus-comments";
import { source } from "@/lib/source";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	const MDXContent = page.data.body;
	const editUrl = `https://github.com/niskan516/lfo-wiki/edit/main/${page.file.path}`;

	return (
		<DocsPage toc={page.data.toc}>
			<DocsTitle>{page.data.title}</DocsTitle>
			<DocsDescription>{page.data.description}</DocsDescription>
			<DocsBody>
				<MDXContent />
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
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) notFound();

	return {
		title: page.data.title,
		description: page.data.description,
	};
}
