/*
  合體 (system/he-ti.mdx, fanscamp/76): at 毛毛高 on 摩摩星大街 the playing character fuses with
  another of the account's characters into a 合體戰神 for 7 / 15 / 30 days. It costs seven
  different 念源體 (風 光 雷 地 冰 火 + 闇, consumed) and 10000. The 合體戰神 keeps the character's
  level and 能力點 and plays with its stat table plus 800 HP / MP / SP and 400 STR / DEF / AGI;
  a fusion can fail into 波加; the base character comes back when the time is up.

  Which pair makes which 合體戰神 was the server's and never published. The table below is the
  players' own (巴哈姆特 LFO 板, 「轉IBBS 合體戰神公式表」, 2011, with its replies), names resolved to
  this roster; characters it names that the remake doesn't have (the 尊者, 金甲人, 炎魔 …) are left
  out. A pair it doesn't list still fuses — into one of the five open 合體戰神, fixed per pair.
*/

export type Fusion = { key: string; id: number; name: string };

export const FUSIONS: Fusion[] = [
  { key: "duncun", id: 8800, name: "迪格斯" },
  { key: "code", id: 8801, name: "密碼" },
  { key: "xander", id: 8802, name: "德特" },
  { key: "olivia", id: 8803, name: "愛莉" },
  { key: "damian", id: 8804, name: "獸神" },
  { key: "banick", id: 8805, name: "巴力克" },
  { key: "landon", id: 8806, name: "人皇" },
  { key: "pokai", id: 8807, name: "波加" },
  { key: "karl", id: 8808, name: "卡倫" },
];
export const fusionByKey = (key: string) => FUSIONS.find((f) => f.key === key) ?? null;
export const isFusion = (key: string) => FUSIONS.some((f) => f.key === key);

/** the 合體戰神 any fusion can turn into instead (「合體失敗」→ 波加) */
export const FAILED = "pokai";
/** how often a fusion fails into 波加: the client's odds were the server's; the remake's */
export const FAIL_CHANCE = 0.1;
/** the five 合體戰神 a pair without a known formula can make */
const OPEN = ["banick", "xander", "olivia", "damian", "code"];

/** 800 HP / MP / SP and 400 STR / DEF / AGI on top of the character's own stats */
export const FUSION_BONUS = { hp: 800, mp: 800, sp: 800, str: 400, def: 400, agi: 400 };
/** the 闇 念源體's terms, in days */
export const FUSION_DAYS = [7, 15, 30] as const;
export const FUSION_FEE = 10000;

/** 風 光 雷 地 冰 火 念源體 (item ids 5330 – 5335); 闇 was the web shop's and is chosen at 毛毛高 */
export const NIANYUAN = [
  { id: 5330, name: "風" },
  { id: 5331, name: "光" },
  { id: 5332, name: "雷" },
  { id: 5333, name: "地" },
  { id: 5334, name: "冰" },
  { id: 5335, name: "火" },
] as const;

/** the players' names → this roster's keys (nicknames, both spellings of a few) */
const NAME: Record<string, string> = {
  星仔: "stinky",
  星奇: "stinky",
  迪雲: "davis",
  小丹: "dennis",
  悟地: "woody",
  亨利: "henry",
  約翰: "john",
  達爾: "deep",
  陸道: "rudolf",
  天魔: "firzen",
  溫蒂: "windy",
  freeze: "freeze",
  owen: "owen",
  龍翼: "louiss",
  龍翼EX: "louis",
  EX: "louis",
  比堤: "bat",
  比提: "bat",
  邪鬼: "julian",
  龐士: "omegah",
  幻音: "witch",
  域多: "victor",
  馬龍: "milo",
  歷奇: "ricky",
  紅魔鬼: "lava",
  亞真: "jan",
  璇瓏: "jessie",
  迪倫: "dilun",
  奧龍: "owen",
  蓮娜: "nina",
  卓男: "chester",
  琪琪: "kiki",
  樂雲: "rova",
  泰加: "tiga",
  托比: "tobi",
  安雅: "anya",
  玄武: "yuenmu",
  宇歷斯: "uranus",
  撒卡: "zack",
  終極魔人: "lastevilp",
  終極魔: "lastevilp",
  黑羅剎: "hector",
  黃帝: "kingp",
  皇帝: "kingp",
  蚩尤: "chiyuap",
  夜剎: "yeachap",
  白帝: "whiteking",
  魔姥: "marek_p",
  魔佬: "marek_p",
  烏邪: "rejanp",
  樊嬅: "ava",
  勇心: "yungsum",
  邪狼丸: "jaro",
  陸島橋之助: "tasuke",
  鬼鎧: "kigai",
  女媧: "ruwa",
  神母號: "stmary",
  暗黑菲沙: "darkfreeze",
  暗菲: "darkfiren",
  暗黑菲雲: "darkfiren",
  暗米: "darkcutie",
  暗黑女媧: "darkruwa",
  暗黑蚩尤: "darkchiyua",
  暗黑終極魔人: "darklastevil",
  米兒: "cutie",
};

/** 合體戰神 ← the pairs the players found, as written (either order makes the same) */
const FOUND: Record<string, string> = {
  duncun: "悟地+迪雲",
  karl: "迪倫+撒卡",
  landon: "黃帝+蚩尤",
  banick: `迪雲+迪倫 迪雲+陸道 迪雲+小丹 迪雲+EX 迪雲+邪鬼 星仔+小丹 小丹+域多 小丹+撒卡 悟地+EX
    悟地+域多 悟地+卓男 悟地+小丹 悟地+暗黑菲沙 悟地+璇瓏 璇瓏+托比 歷奇+馬龍 歷奇+達爾 約翰+亨利
    約翰+迪雲 約翰+幻音 約翰+達爾 約翰+陸道 約翰+暗黑蚩尤 達爾+陸道 達爾+迪倫 皇帝+迪雲 皇帝+蓮娜
    亨利+達爾 陸道+撒卡 陸道+陸島橋之助 幻音+暗菲 紅魔鬼+龍翼EX 天魔+龍翼EX EX+卓男 卓男+小丹
    蓮娜+小丹 泰加+天魔 迪倫+域多 迪倫+神母號 迪倫+悟地 迪倫+卓男 迪倫+龍翼EX 撒卡+天魔 撒卡+璇瓏
    終極魔人+迪雲 終極魔人+亨利 終極魔人+迪倫 終極魔人+約翰 黑羅剎+撒卡 黑羅剎+天魔 勇心+星奇
    暗黑菲雲+達爾`,
  xander: `星仔+夜剎 米兒+琪琪 比提+夜剎 邪鬼+魔姥 安雅+米兒 魔佬+烏邪 女媧+米兒 鬼鎧+邪鬼
    白帝+炎魔 女媧+安雅`,
  olivia: `迪雲+安雅 星仔+璇瓏 龍翼+暗黑女媧 約翰+安雅 天魔+安雅 蓮娜+神母號 蓮娜+黑羅剎
    蓮娜+紅魔鬼 蓮娜+璇瓏 迪倫+女媧 終極魔人+璇瓏 黃帝+米兒 白帝+樊嬅`,
  damian: `黑羅剎+奧龍 暗黑女媧+奧龍 owen+freeze 宇歷斯+星仔 溫蒂+亞真 星仔+黑羅剎 米兒+璇瓏
    奧龍+蓮娜 溫蒂+星奇 黑羅剎+邪鬼 奧龍+邪鬼 璇瓏+琪琪 邪鬼+龐士`,
  code: `龍翼+米兒 黃帝+奧龍 迪倫+奧龍 撒卡+奧龍 迪倫+蚩尤 達爾+奧龍 邪鬼+馬龍 天魔+比堤 比提+域多
    迪倫+宇歷斯 宇歷斯+黑羅剎 宇歷斯+撒卡 邪狼丸+黃帝 暗黑女媧+米兒 紅魔鬼+龐士 黃帝+迪倫
    終極魔+黑羅剎 米兒+龐士 天魔+奧龍 龍翼+悟地 龍翼+終極魔人 邪鬼+迪雲 托比+樂雲 托比+蚩尤
    烏邪+黑羅剎 約翰+邪鬼 邪鬼+玄武 終極魔+暗黑終極魔人 樂雲+小丹`,
};

const pairKey = (a: string, b: string) => [a, b].sort().join("+");

/** "a+b" (roster keys, sorted) → 合體戰神 key */
export const RECIPES: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const [fusion, list] of Object.entries(FOUND))
    for (const pair of list.split(/\s+/).filter(Boolean)) {
      const [a, b] = pair.split("+").map((n) => NAME[n]);
      // a name the remake has no character for: that formula can't be made here
      if (!a || !b || a === b) continue;
      const k = pairKey(a, b);
      if (!out.has(k)) out.set(k, fusion);
    }
  return out;
})();

/** A small stable hash: the same pair always falls the same way. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The 合體戰神 a pair makes when the fusion holds: its formula, else a fixed open one. */
export function formula(a: string, b: string) {
  return RECIPES.get(pairKey(a, b)) ?? OPEN[hash(pairKey(a, b)) % OPEN.length];
}

/** Can these two fuse? Two different characters, neither already a 合體戰神. */
export const canFuse = (a: string, b: string) => a !== b && !isFusion(a) && !isFusion(b);

/** Fuse: the pair's 合體戰神, or 波加 when it fails (`roll` in [0, 1)). */
export function fuse(a: string, b: string, roll: number) {
  return roll < FAIL_CHANCE ? FAILED : formula(a, b);
}

/** how often a clear hands out a 念源體: the server's odds are lost; the remake's */
export const NIANYUAN_CHANCE = 0.3;

/**
 * The 念源體 a clear may give, by where the players found them (the 公式表's 念源體獲得方法):
 * 光 any story, 雷 / 地 from the fifth chapter on, 風 / 火 missions, 冰 beating the dark
 * characters in VS. `roll` picks whether (below NIANYUAN_CHANCE) and `pick` which one.
 */
export function nianyuanDrop(
  where: { mode: "story" | "mission" | "vs"; chapter?: number; dark?: boolean },
  roll: number,
  pick: number,
): number | null {
  if (roll >= NIANYUAN_CHANCE) return null;
  const pool =
    where.mode === "story"
      ? [5331, ...((where.chapter ?? 0) >= 5 ? [5332, 5333] : [])]
      : where.mode === "mission"
        ? [5330, 5335]
        : where.dark
          ? [5334]
          : [];
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))] : null;
}
