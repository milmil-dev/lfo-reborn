import Giscus from "@giscus/react";
import { useEffect, useState } from "react";

export function GiscusComments() {
	const [theme, setTheme] = useState<"dark_dimmed" | "light">("dark_dimmed");

	useEffect(() => {
		const root = document.documentElement;
		const update = () => {
			setTheme(root.classList.contains("dark") ? "dark_dimmed" : "light");
		};
		update();
		const observer = new MutationObserver(update);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return (
		<div className="mt-12 border-t border-fd-border pt-8">
			<Giscus
				repo="milmil-dev/lfo-reborn"
				repoId="PLACEHOLDER"
				category="Comments"
				categoryId="PLACEHOLDER"
				mapping="pathname"
				strict="0"
				reactionsEnabled="1"
				emitMetadata="0"
				inputPosition="top"
				theme={theme}
				lang="zh-TW"
			/>
		</div>
	);
}
