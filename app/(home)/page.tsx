export default function HomePage() {
	return (
		<main className="flex flex-1 flex-col items-center justify-center text-center">
			<h1 className="mb-4 text-2xl font-bold">LFO Wiki</h1>
			<p className="text-fd-muted-foreground">小朋友齊打交Online遊戲百科全書</p>
			<a href="/docs" className="mt-4 text-fd-primary hover:underline">
				進入百科
			</a>
		</main>
	);
}
