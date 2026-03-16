import { motion } from "motion/react";
import { CharacterHoverCardProvider } from "@/components/character-hover-card";
import { CharacterIcon } from "@/components/character-icon";
import { useCharacterStore } from "@/lib/store";

// Section breaks matching the original site layout
// Block 1: Main roster (davis → phoenix)
// Block 2: Later additions (shiloh → gm)
// Block 3: Newest additions (duncun → landon)
const sections = [
	{ start: 0, end: 87 }, // davis through phoenix
	{ start: 87, end: 95 }, // shiloh through gm
	{ start: 95, end: 104 }, // duncun through landon
];

export function CharacterGrid() {
	const characters = useCharacterStore((s) => s.characters);
	let globalIndex = 0;

	return (
		<CharacterHoverCardProvider>
			<div className="not-prose">
				<motion.p
					className="mb-4 text-center text-lg font-bold text-fd-primary"
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					點擊頭像開始查詢
				</motion.p>
				<div className="space-y-4">
					{sections.map((section) => {
						const sectionChars = characters.slice(section.start, section.end);
						return (
							<div
								key={`${section.start}-${section.end}`}
								className="flex flex-wrap justify-center gap-1"
							>
								{sectionChars.map((char) => {
									const i = globalIndex++;
									return (
										<motion.div
											key={char.slug}
											initial={{ opacity: 0, scale: 0.6 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={{
												duration: 0.3,
												delay: i * 0.015,
												ease: [0.25, 0.46, 0.45, 0.94],
											}}
										>
											<CharacterIcon char={char} />
										</motion.div>
									);
								})}
							</div>
						);
					})}
				</div>
			</div>
		</CharacterHoverCardProvider>
	);
}
