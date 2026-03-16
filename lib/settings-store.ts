"use client";

import { useSyncExternalStore } from "react";

interface Settings {
	musicPlayerEnabled: boolean;
	readerMode: "slide" | "scroll";
}

const STORAGE_KEY = "lfo-wiki-settings";
const defaults: Settings = {
	musicPlayerEnabled: true,
	readerMode: "slide",
};

let current: Settings = defaults;
const listeners = new Set<() => void>();

function load(): Settings {
	if (typeof window === "undefined") return defaults;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
	} catch {
		return defaults;
	}
}

function save(settings: Settings) {
	current = settings;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	for (const l of listeners) l();
}

// Initialize on first import (client-side)
if (typeof window !== "undefined") {
	current = load();
}

export function getSettings(): Settings {
	return current;
}

export function updateSettings(patch: Partial<Settings>) {
	save({ ...current, ...patch });
}

export function useSettings(): Settings {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => current,
		() => defaults,
	);
}
