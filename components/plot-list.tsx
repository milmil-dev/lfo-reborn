"use client";

import { useEffect, useMemo, useState } from "react";
import missionsData from "@/data/missions.json";
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
	arcBanner?: string;
	arcSubtitle?: string;
}

interface Mission {
	id: string;
	title?: string;
	images?: string[];
	banner?: string;
	version?: string;
	versionName?: string;
}

/* ─────────────────────────────────────────────
   PlotLanding — /docs/plot landing page
   ───────────────────────────────────────────── */

export function PlotLanding() {
	const stories = storiesData as Story[];
	const missions = (missionsData as Mission[]).filter((m) => m.id.startsWith("m") && m.id !== "m");
	const storyImageCount = stories.reduce((sum, s) => sum + (s.images?.length ?? 0), 0);
	const missionImageCount = missions.reduce((sum, m) => sum + (m.images?.length ?? 0), 0);

	// Pick a random story banner for each card
	const storyBanner = stories.find((s) => s.arcBanner)?.arcBanner;
	const missionBanner = missions.find((m) => m.banner)?.banner;

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<a
				href="/docs/plot/story"
				className="group relative overflow-hidden rounded-2xl border border-fd-border transition-all duration-300 hover:border-fd-primary/40 hover:shadow-xl hover:shadow-fd-primary/10"
			>
				<div className="relative h-48 overflow-hidden">
					{storyBanner && (
						<img
							src={storyBanner}
							alt="故事連載"
							className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
						/>
					)}
					<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
				</div>
				<div className="absolute inset-0 flex flex-col justify-end p-5">
					<h2 className="text-2xl font-bold text-white">故事連載</h2>
					<p className="mt-1 text-sm text-white/70">
						{stories.length} 個章節 · {storyImageCount.toLocaleString()} 頁
					</p>
				</div>
			</a>
			<a
				href="/docs/plot/mission"
				className="group relative overflow-hidden rounded-2xl border border-fd-border transition-all duration-300 hover:border-fd-primary/40 hover:shadow-xl hover:shadow-fd-primary/10"
			>
				<div className="relative h-48 overflow-hidden">
					{missionBanner && (
						<img
							src={missionBanner}
							alt="任務攻略"
							className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
						/>
					)}
					<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
				</div>
				<div className="absolute inset-0 flex flex-col justify-end p-5">
					<h2 className="text-2xl font-bold text-white">任務攻略</h2>
					<p className="mt-1 text-sm text-white/70">
						{missions.length} 個任務 · {missionImageCount.toLocaleString()} 頁
					</p>
				</div>
			</a>
		</div>
	);
}

/* ─────────────────────────────────────────────
   PlotIndex — renders either story or mission grid
   based on current URL path
   ───────────────────────────────────────────── */

export function PlotIndex() {
	const [mode] = useState<"story" | "mission" | null>(() => {
		if (typeof window === "undefined") return null;
		const path = window.location.pathname;
		if (path.includes("/plot/mission")) return "mission";
		if (path.includes("/plot/story")) return "story";
		return null;
	});

	if (mode === "story") return <StoriesGrid />;
	if (mode === "mission") return <MissionsGrid />;
	return null;
}

/* ── Stories grid grouped by arc ── */

export const VERSION_MAP: Record<number, { ver: string; name: string; firstArc: number }> = {
	1: { ver: "1.0", name: "始祖力量篇", firstArc: 1 },
	5: { ver: "2.0", name: "勇者誕生篇", firstArc: 5 },
	14: { ver: "3.0", name: "合成戰體篇", firstArc: 14 },
	24: { ver: "4.0", name: "邪魔亂世篇", firstArc: 24 },
	30: { ver: "5.0", name: "超級元力篇", firstArc: 30 },
	36: { ver: "6.0", name: "決戰聖域篇", firstArc: 36 },
	39: { ver: "7.0", name: "最強武者篇", firstArc: 39 },
	42: { ver: "8.0", name: "摩摩星人篇", firstArc: 42 },
	45: { ver: "9.0", name: "撒旦降臨篇", firstArc: 45 },
};

export const STORY_VERSIONS = Object.values(VERSION_MAP).map((v) => ({
	title: `v${v.ver} ${v.name}`,
	url: `#v${v.ver.replace(/\./g, "-")}`,
	depth: 2,
}));

export const MISSION_VERSIONS = (() => {
	const missions = (missionsData as Mission[]).filter((m) => m.id.startsWith("m") && m.id !== "m");
	const seen = new Set<string>();
	const result: { title: string; url: string; depth: number }[] = [];
	for (const m of missions) {
		if (!m.version) continue;
		const verMatch = `${m.version} ${m.versionName ?? ""}`.trim().match(/^v([\d.]+)\s*(.*)/);
		if (!verMatch) continue;
		const key = `v${verMatch[1].replace(/\./g, "-")}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push({
			title: `v${verMatch[1]} ${verMatch[2] ?? ""}`.trim(),
			url: `#${key}`,
			depth: 2,
		});
	}
	return result;
})();

function StoriesGrid() {
	const stories = storiesData as Story[];

	// biome-ignore lint/correctness/useExhaustiveDependencies: stories is a module-level constant cast, never changes
	const arcs = useMemo(() => {
		const arcMap = new Map<number, Story[]>();
		for (const story of stories) {
			const list = arcMap.get(story.arc) ?? [];
			list.push(story);
			arcMap.set(story.arc, list);
		}
		return [...arcMap.entries()].sort((a, b) => a[0] - b[0]);
	}, [stories]);

	return (
		<div className="space-y-10">
			{arcs.map(([arcNum, arcStories]) => {
				const version = VERSION_MAP[arcNum];
				const arcTitle = arcStories[0]?.title?.replace(/（.*?）/, "") ?? `故事 ${arcNum}`;
				const banner = arcStories[0]?.arcBanner;
				return (
					<section key={arcNum}>
						{/* Version divider */}
						{version && (
							<h2
								id={`v${version.ver.replace(/\./g, "-")}`}
								className="mb-6 flex scroll-mt-20 items-center gap-3 text-base font-normal"
							>
								<div className="h-px flex-1 bg-fd-border" />
								<span className="text-sm font-bold tracking-wider text-fd-primary">
									version {version.ver}
								</span>
								{version.name && (
									<span className="text-sm font-medium text-fd-muted-foreground">
										{version.name}
									</span>
								)}
								<div className="h-px flex-1 bg-fd-border" />
							</h2>
						)}
						{/* Arc banner with title overlay */}
						{banner && (
							<div className="group relative mb-3 overflow-hidden rounded-xl border border-fd-border transition-all duration-300 hover:border-fd-primary/40 hover:shadow-lg hover:shadow-fd-primary/10">
								<img
									src={banner}
									alt={`${arcTitle}`}
									className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
									loading="lazy"
									style={{ maxHeight: "200px" }}
								/>
								<div className="absolute inset-0 bg-black/30" />
								<span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white drop-shadow-lg">
									{arcTitle}
								</span>
							</div>
						)}
						{/* Arc number + subtitle */}
						<div className="mb-3 space-y-1">
							<div className="flex items-center gap-2">
								<span className="inline-flex items-center rounded-lg bg-fd-primary/15 px-2.5 py-1 text-xs font-bold text-fd-primary">
									{arcNum > 0 ? `故事${String(arcNum).padStart(3, "0")}` : "番外"}
								</span>
								<span className="text-xs text-fd-muted-foreground">
									（共{arcStories.length}個分支線）
								</span>
							</div>
							{/* Show non-branch subtitle lines (e.g. character requirements) */}
							{(() => {
								const sub = arcStories[0]?.arcSubtitle;
								if (!sub) return null;
								// Filter out lines that are just branch names (XX線●YY線)
								const lines = sub.split("\n").filter((l) => !l.match(/^[^\n]*線[●\s]*[^\n]*線/));
								if (lines.length === 0) return null;
								return (
									<p className="whitespace-pre-line text-xs leading-relaxed text-fd-muted-foreground">
										{lines.join("\n")}
									</p>
								);
							})()}
						</div>
						<div className="flex flex-wrap gap-2">
							{arcStories.map((story) => (
								<a
									key={story.id}
									href={`/docs/plot/story/${String(arcNum).padStart(3, "0")}/${story.id}`}
									className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/80 px-3 py-2 text-sm backdrop-blur-sm transition-all hover:border-fd-primary/40 hover:bg-fd-muted/50"
								>
									<span className="font-medium text-fd-foreground">
										{story.characterLine ?? story.title ?? story.id}
									</span>
									{(story.images?.length ?? 0) > 0 && (
										<span className="text-[10px] text-fd-muted-foreground">
											{story.images?.length}P
										</span>
									)}
								</a>
							))}
						</div>
					</section>
				);
			})}
		</div>
	);
}

/* ── Missions grid ── */

function MissionsGrid() {
	const missions = (missionsData as Mission[]).filter((m) => m.id.startsWith("m") && m.id !== "m");

	// Group missions by version
	const versionGroups = useMemo(() => {
		const groups = new Map<string, Mission[]>();
		for (const m of missions) {
			const key = m.version ? `${m.version} ${m.versionName ?? ""}`.trim() : "其他";
			const list = groups.get(key) ?? [];
			list.push(m);
			groups.set(key, list);
		}
		return [...groups.entries()];
	}, [missions]);

	return (
		<div className="space-y-10">
			{versionGroups.map(([versionLabel, groupMissions]) => {
				const verMatch = versionLabel.match(/^v([\d.]+)\s*(.*)/);
				return (
					<section key={versionLabel}>
						{/* Version divider */}
						<h2
							id={verMatch ? `v${verMatch[1].replace(/\./g, "-")}` : versionLabel}
							className="mb-4 flex scroll-mt-20 items-center gap-3 text-base font-normal"
						>
							<div className="h-px flex-1 bg-fd-border" />
							<span className="text-sm font-bold tracking-wider text-fd-primary">
								{verMatch ? `version ${verMatch[1]}` : versionLabel}
							</span>
							{verMatch?.[2] && (
								<span className="text-sm font-medium text-fd-muted-foreground">{verMatch[2]}</span>
							)}
							<div className="h-px flex-1 bg-fd-border" />
						</h2>
						{/* Mission cards with banners */}
						<div className="space-y-3">
							{groupMissions.map((mission) => {
								const mNum = mission.id.replace("m", "").toUpperCase();
								return (
									<a
										key={mission.id}
										href={`/docs/plot/mission/${mission.id}`}
										className="group flex overflow-hidden rounded-xl border border-fd-border bg-fd-card/80 backdrop-blur-sm transition-all duration-300 hover:border-fd-primary/40 hover:shadow-lg hover:shadow-fd-primary/5"
									>
										{/* Banner thumbnail */}
										{mission.banner && (
											<div className="relative w-32 shrink-0 overflow-hidden sm:w-40">
												<img
													src={mission.banner}
													alt={mission.title ?? mission.id}
													className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
													loading="lazy"
												/>
											</div>
										)}
										{/* Info */}
										<div className="flex flex-1 items-center gap-3 p-3">
											<span className="shrink-0 rounded-lg bg-fd-primary/15 px-2 py-1 text-xs font-bold text-fd-primary">
												任務{mNum}
											</span>
											<span className="font-medium text-fd-foreground">
												{mission.title ?? "未知任務"}
											</span>
											{(mission.images?.length ?? 0) > 0 && (
												<span className="ml-auto text-[10px] text-fd-muted-foreground">
													{mission.images?.length}P
												</span>
											)}
										</div>
									</a>
								);
							})}
						</div>
					</section>
				);
			})}
		</div>
	);
}

/* ── Shared card component ── */

function _PlotCard({
	href,
	title,
	cover,
	pageCount,
	badge,
}: {
	href: string;
	title: string;
	cover?: string;
	pageCount: number;
	badge?: string;
}) {
	return (
		<a
			href={href}
			className="group relative flex flex-col overflow-hidden rounded-xl border border-fd-border bg-fd-card/80 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-fd-primary/40 hover:shadow-lg hover:shadow-fd-primary/5"
		>
			<div className="relative aspect-[3/4] w-full overflow-hidden bg-fd-muted/30">
				{cover ? (
					<img
						src={cover}
						alt={title}
						className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-fd-muted-foreground/40">
						<svg
							className="h-10 w-10"
							fill="none"
							stroke="currentColor"
							strokeWidth={1.5}
							viewBox="0 0 24 24"
						>
							<title>Cover</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
							/>
						</svg>
					</div>
				)}
				<div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
				{pageCount > 0 && (
					<span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm">
						{pageCount}P
					</span>
				)}
				{badge && (
					<span className="absolute bottom-2 left-2 rounded-md bg-fd-primary/80 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
						{badge}
					</span>
				)}
			</div>
			<div className="p-2.5">
				<p className="line-clamp-2 text-xs font-medium leading-snug text-fd-foreground">{title}</p>
			</div>
		</a>
	);
}

/* ─────────────────────────────────────────────
   PlotDetail — reader page for individual stories/missions
   URL: /docs/plot/story/{id} or /docs/plot/mission/{id}
   ───────────────────────────────────────────── */

export function PlotDetail() {
	const [data, setData] = useState<{
		images: string[];
		title: string;
		type: "story" | "mission";
		id: string;
		siblings?: { id: string; label: string; href: string; isCurrent: boolean }[];
	} | null>(null);

	useEffect(() => {
		const path = window.location.pathname;
		const stories = storiesData as Story[];
		const missions = missionsData as Mission[];

		const storyMatch = path.match(/\/docs\/plot\/story\/\d{3}\/([^/]+)$/);
		if (storyMatch) {
			const id = storyMatch[1];
			const story = stories.find((s) => s.id === id);
			if (story?.images?.length) {
				// Find sibling branches (same arc)
				const siblings = stories
					.filter((s) => s.arc === story.arc)
					.map((s) => ({
						id: s.id,
						label: s.characterLine ?? s.title ?? s.id,
						href: `/docs/plot/story/${String(story.arc).padStart(3, "0")}/${s.id}`,
						isCurrent: s.id === id,
					}));
				setData({
					images: story.images,
					title: story.title ?? story.id,
					type: "story",
					id,
					siblings: siblings.length > 0 ? siblings : undefined,
				});
				return;
			}
		}

		const missionMatch = path.match(/\/docs\/plot\/mission\/([^/]+)$/);
		if (missionMatch) {
			const id = missionMatch[1];
			const mission = missions.find((m) => m.id === id);
			if (mission?.images?.length) {
				setData({
					images: mission.images,
					title: mission.title ? `${mission.id.toUpperCase()} - ${mission.title}` : mission.id,
					type: "mission",
					id,
				});
				return;
			}
		}
	}, []);

	if (!data) return null;

	return (
		<div className="space-y-4">
			{/* Branch switcher for stories */}
			{data.siblings && data.siblings.length > 1 && (
				<div className="flex flex-wrap items-center gap-2">
					{data.siblings.map((s) => (
						<a
							key={s.id}
							href={s.href}
							className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
								s.isCurrent
									? "bg-fd-primary/20 font-bold text-fd-primary border border-fd-primary/40"
									: "border border-fd-border text-fd-muted-foreground hover:border-fd-primary/40 hover:text-fd-foreground"
							}`}
						>
							{s.label}
						</a>
					))}
				</div>
			)}
			<ComicReader images={data.images} title={data.title} storyId={data.id} />
		</div>
	);
}
