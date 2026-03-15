import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { CharacterGrid } from "./character-grid";
import { TimelineSection, TimelineWrapper } from "./character-timeline";
import { VideoPlayer } from "./video-player";

export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		CharacterGrid,
		TimelineWrapper,
		TimelineSection,
		VideoPlayer,
		...components,
	} satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
