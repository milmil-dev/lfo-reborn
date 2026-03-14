"use client";

import Giscus from "@giscus/react";

export function GiscusComments() {
	return (
		<div className="mt-12 border-t border-fd-border pt-8">
			<Giscus
				repo="niskan516/lfo-wiki"
				repoId="PLACEHOLDER"
				category="Comments"
				categoryId="PLACEHOLDER"
				mapping="pathname"
				strict="0"
				reactionsEnabled="1"
				emitMetadata="0"
				inputPosition="top"
				theme="dark_dimmed"
				lang="zh-TW"
			/>
		</div>
	);
}
