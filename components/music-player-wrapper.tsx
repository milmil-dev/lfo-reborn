"use client";

import { useSettings } from "@/lib/settings-store";
import { MusicPlayer } from "./music-player";

export function MusicPlayerWrapper() {
	const { musicPlayerEnabled } = useSettings();
	if (!musicPlayerEnabled) return null;
	return <MusicPlayer />;
}
