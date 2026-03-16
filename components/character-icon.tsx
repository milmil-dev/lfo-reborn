import { Link } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { useCharacterHoverCard } from "@/components/character-hover-card";
import type { Character } from "@/lib/characters";

export function CharacterIcon({ char, size = "md" }: { char: Character; size?: "sm" | "md" }) {
	const width = size === "sm" ? "clamp(40px, 5vw, 52px)" : "clamp(40px, 6vw, 65px)";
	const ref = useRef<HTMLAnchorElement>(null);
	const { show, hide } = useCharacterHoverCard();

	const handleMouseEnter = useCallback(() => {
		const el = ref.current;
		if (el) show(char, el.getBoundingClientRect());
	}, [char, show]);

	return (
		<Link
			ref={ref}
			to={`/docs/character/${char.slug}`}
			className="group relative block overflow-hidden rounded bg-fd-card transition-all hover:shadow-md hover:z-10"
			style={{
				width,
				borderWidth: 2,
				borderStyle: "solid",
				borderColor: `${char.color}60`,
				aspectRatio: "65 / 81",
			}}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={hide}
		>
			<div
				className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
				style={{ boxShadow: `inset 0 0 0 2px ${char.color}, 0 0 8px ${char.color}40` }}
			/>
			<img
				src={char.icon}
				alt={char.name}
				className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
				loading="lazy"
			/>
		</Link>
	);
}
