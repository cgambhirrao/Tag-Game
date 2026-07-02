import {
  Vec2, PlayerSnapshot, GameState,
  PLAYER_SPEED, WORLD, TICK_RATE, MAX_PLAYERS,
  TAG_RANGE, IT_ELIMINATE_TIME, GRACE_TICKS,
} from "../shared/protocol.js";

interface ServerPlayer {
  id: string;
  name: string;
  pos: Vec2;
  lastDir: Vec2;
  lastSeq: number;
  eliminated: boolean;
  graceTicks: number;
  itElapsed: number;
}

const SPAWN_POINTS: Vec2[] = [
  { x: 200, y: 150 }, { x: 1400, y: 150 },
  { x: 200, y: 1050 }, { x: 1400, y: 1050 },
  { x: 800, y: 600 },
  { x: 400, y: 300 }, { x: 1200, y: 300 },
  { x: 400, y: 900 }, { x: 1200, y: 900 },
];

export class GameRoom {
  private players = new Map<string, ServerPlayer>();
  private _hostId = "";
  private _targetCount = MAX_PLAYERS;
  private _phase: "lobby" | "playing" | "finished" = "lobby";

  get phase(): string {
    return this._phase;
  }

  get hostId(): string {
    return this._hostId;
  }

  get targetCount(): number {
    return this._targetCount;
  }

  private itPlayerId = "";
  private winnerId = "";
  private winnerName = "";
  private tickCount = 0;
  private lastTaggedPlayerId = "";
  private tagTick = 0;

  get lobbyState(): GameState {
    const arr: { id: string; name: string }[] = [];
    for (const p of this.players.values()) {
      arr.push({ id: p.id, name: p.name });
    }
    return {
      phase: "lobby",
      playerCount: this.players.size,
      targetCount: this.targetCount,
      players: arr,
      hostId: this.hostId,
    };
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  get isLobbyReady(): boolean {
    return this.players.size >= 2 && this.players.size >= this.targetCount;
  }

  addPlayer(id: string, name: string): { hostId: string; isHost: boolean } {
    const isHost = this.players.size === 0;
    if (isHost) this._hostId = id;

    const spawn = SPAWN_POINTS[this.players.size % SPAWN_POINTS.length];
    const p: ServerPlayer = {
      id,
      name: name.slice(0, 16) || "Survivor",
      pos: { ...spawn },
      lastDir: { x: 0, y: 0 },
      lastSeq: 0,
      eliminated: false,
      graceTicks: 0,
      itElapsed: 0,
    };
    this.players.set(id, p);
    return { hostId: this.hostId, isHost };
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (this.hostId === id && this.players.size > 0) {
      this._hostId = this.players.keys().next().value;
    }
    if (this.phase === "playing") this.checkWin();
  }

  setTarget(id: string, target: number): boolean {
    if (id !== this.hostId || this.phase !== "lobby") return false;
    this._targetCount = Math.max(2, Math.min(MAX_PLAYERS, target));
    return true;
  }

  startGame(): void {
    if (this.players.size < 2) return;
    this._phase = "playing";
    this.tickCount = 0;

    const ids = [...this.players.keys()];
    for (let i = 0; i < ids.length; i++) {
      const p = this.players.get(ids[i])!;
      p.eliminated = false;
      p.graceTicks = 0;
      p.itElapsed = 0;
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      p.pos = { ...spawn };
    }

    this.itPlayerId = ids[Math.floor(Math.random() * ids.length)];
    const it = this.players.get(this.itPlayerId)!;
    it.graceTicks = GRACE_TICKS;
  }

  resetGame(): void {
    this._phase = "lobby";
    this.players.clear();
    this._hostId = "";
    this._targetCount = MAX_PLAYERS;
    this.itPlayerId = "";
    this.winnerId = "";
    this.winnerName = "";
    this.tickCount = 0;
  }

  setInput(id: string, seq: number, dir: Vec2): void {
    const p = this.players.get(id);
    if (!p || seq <= p.lastSeq) return;
    let { x, y } = dir;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.lastDir = { x, y };
    p.lastSeq = seq;
  }

  tick(): void {
    if (this.phase !== "playing") return;
    const dt = 1 / TICK_RATE;
    this.tickCount++;

    const it = this.players.get(this.itPlayerId);
    if (!it || it.eliminated) {
      this.pickNextIt();
      return;
    }

    if (it.graceTicks > 0) {
      it.graceTicks--;
    } else {
      it.itElapsed += dt;
      if (it.itElapsed >= IT_ELIMINATE_TIME) {
        it.eliminated = true;
        this.pickNextIt();
        this.checkWin();
        return;
      }
    }

    for (const p of this.players.values()) {
      if (p.id === this.itPlayerId) continue;
      if (p.eliminated) continue;
      p.pos.x += p.lastDir.x * PLAYER_SPEED * dt;
      p.pos.y += p.lastDir.y * PLAYER_SPEED * dt;
      p.pos.x = Math.max(0, Math.min(WORLD.width, p.pos.x));
      p.pos.y = Math.max(0, Math.min(WORLD.height, p.pos.y));
    }

    it.pos.x += it.lastDir.x * PLAYER_SPEED * dt;
    it.pos.y += it.lastDir.y * PLAYER_SPEED * dt;
    it.pos.x = Math.max(0, Math.min(WORLD.width, it.pos.x));
    it.pos.y = Math.max(0, Math.min(WORLD.height, it.pos.y));

    for (const p of this.players.values()) {
      if (p.id === this.itPlayerId) continue;
      if (p.eliminated) continue;
      const dx = it.pos.x - p.pos.x;
      const dy = it.pos.y - p.pos.y;
      if (Math.hypot(dx, dy) < TAG_RANGE) {
        p.graceTicks = GRACE_TICKS;
        p.itElapsed = 0;
        this.itPlayerId = p.id;
        this.lastTaggedPlayerId = p.id;
        this.tagTick = this.tickCount;
        break;
      }
    }
  }

  private pickNextIt(): void {
    const alive = [...this.players.values()].filter((p) => !p.eliminated);
    if (alive.length <= 1) return;
    const idx = alive.findIndex((p) => p.id === this.itPlayerId);
    const next = alive[(idx + 1) % alive.length];
    this.itPlayerId = next.id;
    next.graceTicks = GRACE_TICKS;
    next.itElapsed = 0;
  }

  private checkWin(): void {
    const alive = [...this.players.values()].filter((p) => !p.eliminated);
    if (alive.length <= 1) {
      this._phase = "finished";
      if (alive.length === 1) {
        this.winnerId = alive[0].id;
        this.winnerName = alive[0].name;
      }
    }
  }

  snapshot(): GameState {
    if (this.phase === "lobby") return this.lobbyState;

    const players: PlayerSnapshot[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        name: p.name,
        pos: { ...p.pos },
        eliminated: p.eliminated,
        graceTicks: p.graceTicks,
      });
    }

    if (this.phase === "finished") {
      return {
        phase: "finished",
        winnerId: this.winnerId,
        winnerName: this.winnerName,
        players,
      };
    }

    const it = this.players.get(this.itPlayerId);
    const recentTag = this.tickCount - this.tagTick <= 3 ? this.lastTaggedPlayerId : "";
    return {
      phase: "playing",
      players,
      itPlayerId: this.itPlayerId,
      itElapsed: it ? it.itElapsed : 0,
      serverTime: Date.now(),
      lastTaggedPlayerId: recentTag,
      tagTick: this.tagTick,
    };
  }
}
