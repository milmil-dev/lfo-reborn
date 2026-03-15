import data from "@/data/characters.json";
import skillsData from "@/data/skills.json";

export interface Character {
	slug: string;
	name: string;
	icon: string;
	version: string;
	color: string;
	description?: string;
	birthplace?: string;
	identity?: string;
	combatStyle?: string;
	weapon?: {
		name: string;
		effect?: string;
		durability?: string;
		description?: string;
	};
	equipment?: {
		name: string;
		stats?: Record<string, string>;
	};
	skillNames?: string[];
	weaponImage?: string;
	equipmentImage?: string;
	skillImages?: { url: string; name: string }[];
	actionGifs?: { url: string; label: string }[];
	portraits?: { url: string; label: string }[];
	dialogs?: string[];
	hasTransform?: boolean;
}

export interface CharacterStat {
	base: string;
	growth: string;
}

export interface CharacterSkill {
	name: string;
	command?: string;
	cost?: string;
	learnPoints?: string;
	trigger?: string;
	notes?: string;
	gif?: string;
	icon?: string;
}

export interface CharacterSkillData {
	slug: string;
	stats: {
		current?: Record<string, CharacterStat>;
		before?: Record<string, CharacterStat>;
	};
	skills: CharacterSkill[];
	transformSkills?: CharacterSkill[];
}

export const versions = data.versions;
export const versionDates: Record<string, string> = data.versionDates;
export const characters: Character[] = data.characters;

const colorMap = new Map(characters.map((c) => [c.slug, c.color]));
const charMap = new Map(characters.map((c) => [c.slug, c]));

export function getCharacterColor(slug: string): string | undefined {
	return colorMap.get(slug);
}

export function getCharacter(slug: string): Character | undefined {
	return charMap.get(slug);
}

const profileImageOverrides: Record<string, string> = data.profileImageOverrides;

export function getCharacterProfileImage(slug: string): string {
	const override = profileImageOverrides[slug];
	if (override?.startsWith("http")) return override;
	const name = override ?? slug;
	return `https://lfostory.pages.dev/index2/images/${name}.png`;
}

const skillsMap = new Map(
	Object.entries(skillsData as Record<string, CharacterSkillData>).map(([slug, d]) => [slug, d]),
);

export function getCharacterSkillData(slug: string): CharacterSkillData | undefined {
	return skillsMap.get(slug);
}

export function getCharactersByVersion() {
	const grouped = new Map<string, Character[]>();
	for (const v of versions) {
		grouped.set(v, []);
	}
	for (const char of characters) {
		const list = grouped.get(char.version);
		if (list) list.push(char);
	}
	for (const [key, val] of grouped) {
		if (val.length === 0) grouped.delete(key);
	}
	return grouped;
}
