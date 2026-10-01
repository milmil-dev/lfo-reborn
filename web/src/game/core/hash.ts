/*
  State digests for netcode. Peers running the same inputs must end every tick in the same
  state; each hashes its World (World.hash) and a mismatch is a desync. FNV-1a over the IEEE-754
  bytes of every number, so nothing is rounded away: two states hash alike only when they agree
  bit for bit.
*/

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export class Hasher {
  private h = OFFSET;
  private readonly bytes = new DataView(new ArrayBuffer(8));

  private byte(b: number) {
    this.h = Math.imul(this.h ^ b, PRIME);
  }

  num(n: number) {
    this.bytes.setFloat64(0, n);
    for (let i = 0; i < 8; i++) this.byte(this.bytes.getUint8(i));
    return this;
  }

  bool(b: boolean) {
    this.byte(b ? 1 : 0);
    return this;
  }

  str(s: string) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.byte(c & 0xff);
      this.byte(c >> 8);
    }
    this.byte(0xff); // terminator: "ab" + "c" never reads like "a" + "bc"
    return this;
  }

  /** The digest so far, as an unsigned 32-bit integer. */
  get value() {
    return this.h >>> 0;
  }
}
