"use client";

import { useEffect, useState } from "react";
import missionsData from "@/data/missions.json";
import { ComicReader } from "./comic-reader";

interface Mission {
	id: string;
	title?: string;
	images?: string[];
}

export function MissionList() {
	const missions = (missionsData as Mission[]).filter((m) => m.id.startsWith("m") && m.id !== "m");

	return (
		<div className="space-y-2">
			{missions.map((mission) => (
				<a
					key={mission.id}
					href={`/docs/missionindex/${mission.id}`}
					className="flex items-center gap-3 rounded-lg border border-fd-border p-3 transition-colors hover:bg-fd-muted/50"
				>
					<span className="shrink-0 rounded bg-fd-primary/10 px-2 py-0.5 text-xs font-bold text-fd-primary">
						{mission.id.toUpperCase()}
					</span>
					<span className="font-medium">{mission.title ?? "未知任務"}</span>
					{mission.images && (
						<span className="ml-auto text-xs text-fd-muted-foreground">
							{mission.images.length} 頁
						</span>
					)}
				</a>
			))}
		</div>
	);
}

export function MissionDetail() {
	const [mission, setMission] = useState<Mission | null>(null);

	useEffect(() => {
		const path = window.location.pathname;
		const match = path.match(/\/docs\/missionindex\/([^/]+)$/);
		if (!match) return;

		const missionId = match[1];
		const found = (missionsData as Mission[]).find((m) => m.id === missionId);
		if (found) setMission(found);
	}, []);

	if (!mission?.images?.length) return null;

	return (
		<ComicReader
			images={mission.images}
			title={
				mission.title
					? `任務${mission.id.replace("m", "").toUpperCase()} - ${mission.title}`
					: mission.id
			}
		/>
	);
}
