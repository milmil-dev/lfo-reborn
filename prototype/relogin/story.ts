// Content for the prototype.
// Dialogue is the original HK text: talk.lfo STORY/SCHOOL/stinky_school_talk.tlk (events ~1–~7)
// joined with string.lfo STORY/SCHOOL/stinky_school_string.tzw. Portraits are hand-picked
// until the faceID → atlas-cell table (in the .spz sprite defs) is decoded.

export const PROLOGUE = [
	"時空無涯，宇宙無量。",
	"在那超越時空，比洪荒更遠古的時代，",
	"神賜給祂的後裔——人類，",
	"一種源自宇宙深處的無邊力量——元力。",
	"憑著這股偉大的力量，人類能抵擋暴獸的圍攻，",
	"渡過酷寒的冰河時代，並熬過隕石墜落所造成的赤煉日子，",
	"最終變成大地的真正主宰。",
	"隨著年月的過去，安穩的生活，使人們開始倚重智慧。",
	"曾經賴以為生的偉大元力，變得無用武之地，",
	"從而逐漸被遺忘掉，也逐漸被掩藏埋沒。",
	"但每當世界出現真的災難之時，",
	"元力始終會再次成為救世的最後力量。",
	"新的故事、新的神話、新的英雄，在這刻又再誕生了……",
];

/** A portrait is one cell of a 512×512 face atlas laid out as 3 columns × 2 rows. */
export type Face = { sheet: string; col: 0 | 1 | 2; row: 0 | 1 };

export type Speaker = { name: string; voice?: string; side: "left" | "right" };

// keys are the sprite IDs used by the .tlk scripts (see loadsprite.dat)
export const CAST: Record<string, Speaker> = {
	"2": { name: "星奇", voice: "stinky1.wav", side: "left" },
	"51": { name: "域多", voice: "Victor1.wav", side: "right" },
	"55": { name: "歷奇", voice: "ricky_sp1.wav", side: "right" },
	"5008": { name: "學生", side: "right" },
};

export type Line = {
	who?: string; // sprite ID; omitted = narration
	face?: Face;
	text: string;
	scene: "plaza" | "gate";
	/** interstitial shown before this line */
	beat?: "battle";
};

const f = (sheet: string, col: Face["col"], row: Face["row"]): Face => ({ sheet, col, row });
const STINKY = { calm: f("face55", 1, 1), laugh: f("face55", 0, 1), fist: f("face55", 1, 0), grin: f("face55", 2, 1), glare: f("face55", 0, 0) };
const VICTOR = { point: f("face27", 1, 1), grin: f("face27", 0, 1), drink: f("face27", 1, 0), angry: f("face28", 1, 0), huff: f("face28", 0, 0), smirk: f("face28", 0, 1) };
const RICKY = { fist: f("face25", 0, 1), guard: f("face25", 1, 1), hurt: f("face27", 0, 0) };

export const CHAPTER = {
	number: "第一話",
	title: "學校",
	stage: "Stage 1 - School",
	branch: "星奇線",
	lines: [
		// ~1 stinky stage1 road
		{ scene: "plaza", text: "新學年開始，星仔轉到新校「文光中學」上課。" },
		{ scene: "plaza", who: "2", face: STINKY.calm, text: "第一天到新學校上課，不知會有甚麼趣事發生呢？" },
		{ scene: "plaza", who: "2", face: STINKY.laugh, text: "怎樣也好，以我的本事，相信不久大家也會認識我呀，\n哈哈哈！" },
		{ scene: "plaza", who: "2", face: STINKY.fist, text: "糟！快遲到了！要走快點才行啊！" },
		// ~2–~4 school playground
		{ scene: "gate", who: "51", face: VICTOR.point, text: "呦呵﹗好同學，請我們喝汽水吧﹗" },
		{ scene: "gate", who: "5008", face: f("face13", 1, 0), text: "嗚~~~" },
		{ scene: "gate", who: "55", face: RICKY.fist, text: "嘿嘿！域多真受歡迎，時常都有同學請他吃東西！" },
		{ scene: "gate", who: "51", face: VICTOR.drink, text: "哈哈哈！真涼快~~﹗" },
		// ~5
		{ scene: "gate", who: "2", face: STINKY.grin, text: "呼！及時趕到！" },
		{ scene: "gate", who: "51", face: VICTOR.angry, text: "哎唷！豈有此理！究竟是誰，竟敢冒犯本大爺！？" },
		{ scene: "gate", who: "51", face: VICTOR.angry, text: "你這個瞎子﹗撞到我還不道歉？" },
		{ scene: "gate", who: "2", face: STINKY.glare, text: "……" },
		{ scene: "gate", who: "51", face: VICTOR.huff, text: "笨蛋﹗你撞到我了﹗聽到了沒有？" },
		// ~6
		{ scene: "gate", who: "2", face: STINKY.calm, text: "（心想）哦？原來這所學校也有傻瓜呢！" },
		{ scene: "gate", who: "2", face: STINKY.glare, text: "聽到了又怎樣呀？猴子！！" },
		{ scene: "gate", who: "55", face: RICKY.guard, text: "什麼？你居然膽敢這樣跟域多講話！？" },
		{ scene: "gate", who: "51", face: VICTOR.point, text: "呦呵﹗原來只是個不知天高地厚的臭小子！" },
		{ scene: "gate", who: "51", face: VICTOR.grin, text: "我好像從未見過你，是新同學吧？呦呵﹗我最喜歡認識新朋友的，\n來來來，我們一起稱霸學校吧！" },
		{ scene: "gate", who: "2", face: STINKY.grin, text: "嘿！我看你們頂多是一班只會欺善怕惡的小流岷吧？\n我星仔是位成大事的人材，怎會有空跟你們胡混呀！？滾開吧！" },
		{ scene: "gate", who: "51", face: VICTOR.smirk, text: "呦呵！看來有人欠揍呀，兄弟們﹗一起上﹗" },
		{ scene: "gate", who: "2", face: STINKY.fist, text: "哦？想和我玩遊戲嗎？好啊！" },
		// ~7 victor lose
		{ scene: "gate", beat: "battle", who: "51", face: VICTOR.huff, text: "....你這個~~蠢~~才~~！！（昏倒）" },
		{ scene: "gate", who: "2", face: STINKY.glare, text: "可惡﹗你這班混蛋把我的新波鞋弄髒了。" },
	] as Line[],
};
