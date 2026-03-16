import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	type Character,
	characters as staticCharacters,
	versionDates,
	versions,
} from "@/lib/characters";

const DATA_VERSION = 3;

interface CharacterStore {
	dataVersion: number;
	characters: Character[];
	versions: readonly string[];
	versionDates: Record<string, string>;

	getCharacter: (slug: string) => Character | undefined;
	getCharactersByVersion: (version: string) => Character[];
	searchCharacters: (query: string) => Character[];
}

export const useCharacterStore = create<CharacterStore>()(
	persist(
		(_set, get) => ({
			dataVersion: DATA_VERSION,
			characters: staticCharacters,
			versions,
			versionDates,

			getCharacter: (slug) => get().characters.find((c) => c.slug === slug),

			getCharactersByVersion: (version) => get().characters.filter((c) => c.version === version),

			searchCharacters: (query) => {
				const q = query.toLowerCase().trim();
				if (!q) return get().characters;
				return get().characters.filter(
					(c) =>
						c.name.toLowerCase().includes(q) ||
						c.slug.toLowerCase().includes(q) ||
						(c.description?.toLowerCase().includes(q) ?? false),
				);
			},
		}),
		{
			name: "lfo-characters",
			version: DATA_VERSION,
			migrate: () => ({
				dataVersion: DATA_VERSION,
				characters: staticCharacters,
				versions,
				versionDates,
			}),
		},
	),
);
