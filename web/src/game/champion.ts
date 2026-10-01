/*
  王者爭霸 (LFO 皇者爭霸戰, champion/): an eight-team knockout drawn on the client's bracket
  (championbox: quarter-finals, Semi Final ×2, FINAL), two fighters a team (championteam).
  Online it was a scheduled event; offline the player's team (you and a COM partner) meets seven
  COM teams. Your matches are real bouts on 王者爭霸台 (vs_champion); the others are decided by
  the teams' strength with some luck.
*/

export type Member = { key: string; lv: number };
export type Team = { id: number; name: string; members: Member[]; you?: boolean };
/** Teams in bracket order; `rounds[r]` holds the ids that reached round r (0 = all eight). */
export type Bracket = { teams: Team[]; rounds: number[][]; champion: number | null };

export const ROUND_NAMES = ["八強", "準決賽", "決賽"] as const;
/** honor for lifting the cup (the remake's number) */
export const CUP_HONOR = 60;

/** Eight teams: yours first, then seven drawn from the roster around your level. */
export function newBracket(
  you: { name: string; key: string; lv: number },
  partner: string,
  roster: string[],
  rand = Math.random,
): Bracket {
  const pick = () => roster[Math.floor(rand() * roster.length)];
  const lvAround = (lv: number) => Math.max(1, Math.round(lv * (0.7 + rand() * 0.6)));
  const teams: Team[] = [
    {
      id: 0,
      name: you.name,
      you: true,
      members: [
        { key: you.key, lv: you.lv },
        { key: partner, lv: you.lv },
      ],
    },
  ];
  for (let i = 1; i < 8; i++)
    teams.push({
      id: i,
      name: `第${i + 1}隊`,
      members: [
        { key: pick(), lv: lvAround(you.lv) },
        { key: pick(), lv: lvAround(you.lv) },
      ],
    });
  // shuffle the draw so your team isn't always in the first slot
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  return { teams, rounds: [teams.map((t) => t.id)], champion: null };
}

/** The pairs of the round being played. */
export function pairs(b: Bracket): [number, number][] {
  const r = b.rounds.at(-1)!;
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i], r[i + 1]]);
  return out;
}

export const team = (b: Bracket, id: number) => b.teams.find((t) => t.id === id)!;
export const yourTeam = (b: Bracket) => b.teams.find((t) => t.you)!;

/** The pair your team plays this round, or null once it is out (or the cup is over). */
export function yourMatch(b: Bracket): [number, number] | null {
  if (b.champion !== null) return null;
  const me = yourTeam(b).id;
  return pairs(b).find(([a, c]) => a === me || c === me) ?? null;
}

const strength = (t: Team) => t.members.reduce((n, m) => n + m.lv, 0);

/** A match between two COM teams: the stronger wins more often than not. */
export function simulate(a: Team, c: Team, rand = Math.random) {
  const pa = strength(a) / (strength(a) + strength(c));
  return rand() < pa ? a.id : c.id;
}

/**
 * Close the round: your match's result as given (if you're in it), every other match simulated.
 * The last winner standing is the champion.
 */
export function playRound(b: Bracket, youWon: boolean | null, rand = Math.random): Bracket {
  const me = yourTeam(b).id;
  const next = pairs(b).map(([a, c]) => {
    if (a === me || c === me) return youWon ? me : a === me ? c : a;
    return simulate(team(b, a), team(b, c), rand);
  });
  return {
    ...b,
    rounds: [...b.rounds, next],
    champion: next.length === 1 ? next[0] : null,
  };
}
