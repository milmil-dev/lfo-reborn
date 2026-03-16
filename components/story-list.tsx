"use client";

import { useEffect, useState } from "react";
import storiesData from "@/data/stories.json";
import { ComicReader } from "./comic-reader";

interface Story {
	id: string;
	arc: number;
	character?: string;
	variant?: string;
	title?: string;
	characterLine?: string;
	images?: string[];
}

export function StoryList() {
	const stories = storiesData as Story[];

	// Group by arc
	const arcMap = new Map<number, Story[]>();
	for (const story of stories) {
		const list = arcMap.get(story.arc) ?? [];
		list.push(story);
		arcMap.set(story.arc, list);
	}

	const arcs = [...arcMap.entries()].sort((a, b) => a[0] - b[0]);

	return (
		<div className="space-y-6">
			{arcs.map(([arcNum, arcStories]) => {
				const arcTitle = arcStories[0]?.title?.replace(/（.*?）/, "") ?? `故事 ${arcNum}`;
				return (
					<div key={arcNum}>
						<h3 className="mb-2 text-lg font-bold">
							{arcNum > 0 ? `故事${String(arcNum).padStart(3, "0")}` : "番外"} - {arcTitle}
						</h3>
						<div className="flex flex-wrap gap-2">
							{arcStories.map((story) => (
								<a
									key={story.id}
									href={`/docs/storyindex/${story.id}`}
									className="flex items-center gap-2 rounded-lg border border-fd-border px-3 py-2 text-sm transition-colors hover:bg-fd-muted/50"
								>
									<span>{story.characterLine ?? story.character ?? story.id}</span>
									{story.images && (
										<span className="text-xs text-fd-muted-foreground">
											{story.images.length}頁
										</span>
									)}
								</a>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function StoryDetail() {
	const [story, setStory] = useState<Story | null>(null);

	useEffect(() => {
		const path = window.location.pathname;
		const match = path.match(/\/docs\/storyindex\/([^/]+)$/);
		if (!match) return;

		const storyId = match[1];
		const found = (storiesData as Story[]).find((s) => s.id === storyId);
		if (found) setStory(found);
	}, []);

	if (!story?.images?.length) return null;

	return <ComicReader images={story.images} title={story.title ?? story.id} />;
}
