/*
  Character names, by the client's own rules and lines: a name can't be empty, can't hold symbols
  (「角色名字不能含有附號」, system.tzw 1520) and can't be one another character already has
  (「角式名稱已被使用。」, 23 — the client's typo kept). Letters of any script, digits and spaces
  are fine; twelve characters at most.
*/
export const NAME_MAX = 12;

export function nameProblem(name: string, taken: (string | null | undefined)[]): string | null {
  const n = name.trim();
  if (!n) return "請輸入角色名字";
  if (n.length > NAME_MAX) return `角色名字最多 ${NAME_MAX} 個字`;
  if (/[^\p{L}\p{N} ]/u.test(n)) return "角色名字不能含有附號";
  if (taken.some((t) => t && t.trim().toLowerCase() === n.toLowerCase()))
    return "角式名稱已被使用。";
  return null;
}
