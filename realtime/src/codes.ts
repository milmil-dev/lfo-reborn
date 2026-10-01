/** Room codes: four letters people can read out, with the look-alikes (0 O 1 I) left out. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE = /^[A-Z0-9]{4,8}$/;

export function newCode(length = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}
