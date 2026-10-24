import { RoomClient } from "./client";

/*
  The seat's token (lfo-reborn.seat.<CODE>) is what makes a refresh come back to the same seat:
  it goes out with `hello`, it is kept from the room's reply, and leaving on purpose gives it up.
  A fake socket stands in for the Worker.
*/
class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: string[] = [];
  closed: [number, string] | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.closed = [code, reason];
  }
  /** the socket opening, and what the room says back */
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  get hello() {
    const first = this.sent.map((s) => JSON.parse(s) as { t: string });
    return first.find((m) => m.t === "hello") as { token?: string } | undefined;
  }
}

const room = (you: number) => ({
  t: "room",
  you,
  room: {
    code: "ABCD",
    phase: "lobby",
    build: "dev",
    rules: { stage: "vs_school", level: 10, name: "", listed: true },
    seats: [],
  },
});

describe("RoomClient's seat token", () => {
  beforeEach(() => {
    localStorage.clear();
    FakeSocket.last = null;
    vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the token the room hands out and sends it back on the next connection", () => {
    const a = new RoomClient("ws://room", "ABCD", "阿強");
    const ws = FakeSocket.last!;
    ws.open();
    expect(ws.hello?.token).toBeUndefined();
    ws.receive({ ...room(0), token: "secret" });
    expect(localStorage.getItem("lfo-reborn.seat.ABCD")).toBe("secret");

    // the tab refreshes: a new client on the same code comes back to the seat
    const b = new RoomClient("ws://room", "ABCD", "阿強");
    FakeSocket.last!.open();
    expect(FakeSocket.last!.hello?.token).toBe("secret");
    b.dispose();
    a.dispose();
  });

  it("gives the seat up when the player leaves on purpose", () => {
    const c = new RoomClient("ws://room", "ABCD", "阿強");
    const ws = FakeSocket.last!;
    ws.open();
    ws.receive({ ...room(0), token: "secret" });
    c.close();
    expect(ws.sent.map((s) => (JSON.parse(s) as { t: string }).t)).toContain("bye");
    expect(localStorage.getItem("lfo-reborn.seat.ABCD")).toBeNull();
  });

  it("drops the socket without giving the seat up when the screen unmounts", () => {
    const c = new RoomClient("ws://room", "ABCD", "阿強");
    const ws = FakeSocket.last!;
    ws.open();
    ws.receive({ ...room(0), token: "secret" });
    c.dispose();
    expect(ws.sent.map((s) => (JSON.parse(s) as { t: string }).t)).not.toContain("bye");
    expect(localStorage.getItem("lfo-reborn.seat.ABCD")).toBe("secret");
  });

  it("is resuming from the room's word until the replay is through", () => {
    const c = new RoomClient("ws://room", "ABCD", "阿強");
    const ws = FakeSocket.last!;
    ws.open();
    expect(c.getSnapshot().resuming).toBe(false);
    ws.receive({ t: "resume", k: 0 });
    expect(c.getSnapshot().resuming).toBe(true);
    ws.receive({ t: "resume-end", k: 120 });
    expect(c.getSnapshot().resuming).toBe(false);
    c.dispose();
  });

  /*
    Seats renumber when someone leaves, so a chat line cannot be credited from its seat index
    later: the room sends the speaker's name with the line and that is what is shown. Before,
    "P2: hi" turned into "P3: hi" once P2 left and the last seat took its index — or into a bare
    "P2" once the speaker was gone.
  */
  it("keeps each chat line's speaker name, whatever the seats do afterwards", () => {
    const c = new RoomClient("ws://room", "ABCD", "阿強");
    const ws = FakeSocket.last!;
    ws.open();
    ws.receive({ t: "chat", seat: 1, name: "小明", text: "hi" });
    ws.receive({ t: "chat", seat: 2, name: "大文", text: "hello" });
    // 小明 leaves: the seats shrink and 大文 moves into index 1
    ws.receive(room(0));
    expect(c.getSnapshot().chat).toEqual([
      { seat: 1, name: "小明", text: "hi" },
      { seat: 2, name: "大文", text: "hello" },
    ]);
    c.dispose();
  });
});
