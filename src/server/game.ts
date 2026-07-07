import {
  Vec2, PlayerSnapshot, GameState, ShieldPickup, Obstacle,
  PLAYER_SPEED, WORLD, TICK_RATE, MAX_PLAYERS,
  TAG_RANGE, IT_ELIMINATE_TIME, GRACE_TICKS,
  SHIELD_DURATION, SHIELD_RESPAWN_TICKS, MAX_SHIELDS, SHIELD_PICKUP_RANGE,
  SPRINT_SPEED_MULT, STAMINA_MAX, STAMINA_DRAIN_PER_TICK, STAMINA_REGEN_PER_TICK,
  INVISIBLE_DURATION_TICKS, INVISIBLE_COOLDOWN_TICKS,
  SHRINK_STEP, MIN_WORLD_SIZE, OBSTACLE_PLAYER_RADIUS,
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
  stamina: number;
  sprinting: boolean;
  invisibleTicks: number;
  invisibleCooldown: number;
  shieldTimer: number;
}

const SPAWN_POINTS: Vec2[] = [
  { x: 200, y: 150 }, { x: 1400, y: 150 },
  { x: 200, y: 1050 }, { x: 1400, y: 1050 },
  { x: 800, y: 600 },
  { x: 400, y: 300 }, { x: 1200, y: 300 },
  { x: 400, y: 900 },
];

function randomSpawn(worldBounds: { minX: number; minY: number; maxX: number; maxY: number }): Vec2 {
  return {
    x: worldBounds.minX + Math.random() * (worldBounds.maxX - worldBounds.minX),
    y: worldBounds.minY + Math.random() * (worldBounds.maxY - worldBounds.minY),
  };
}

export class GameRoom {
  private players = new Map<string, ServerPlayer>();
  private _hostId = "";
  private _targetCount = MAX_PLAYERS;
  private _phase: "lobby" | "playing" | "finished" = "lobby";

  get phase(): string { return this._phase; }
  get hostId(): string { return this._hostId; }
  get targetCount(): number { return this._targetCount; }
  get playerCount(): number { return this.players.size; }

  private itPlayerId = "";
  private winnerId = "";
  private winnerName = "";
  private tickCount = 0;
  private lastTaggedPlayerId = "";
  private tagTick = 0;

  private shields: ShieldPickup[] = [];
  private shieldRespawnTimer = 0;
  private obstacles: Obstacle[] = [];
  private worldMinX = 0;
  private worldMinY = 0;
  private worldMaxX = WORLD.width;
  private worldMaxY = WORLD.height;

  get isFull(): boolean { return this.players.size >= MAX_PLAYERS; }

  get isLobbyReady(): boolean {
    return this.players.size >= 2 && this.players.size >= this._targetCount;
  }

  get lobbyState(): GameState {
    const arr: { id: string; name: string }[] = [];
    for (const p of this.players.values()) arr.push({ id: p.id, name: p.name });
    return {
      phase: "lobby",
      playerCount: this.players.size,
      targetCount: this._targetCount,
      players: arr,
      hostId: this._hostId,
    };
  }

  addPlayer(id: string, name: string): { hostId: string; isHost: boolean } {
    const isHost = this.players.size === 0;
    if (isHost) this._hostId = id;

    const spawn = SPAWN_POINTS[this.players.size % SPAWN_POINTS.length];
    const p: ServerPlayer = {
      id, name: name.slice(0, 16) || "Survivor",
      pos: { ...spawn },
      lastDir: { x: 0, y: 0 }, lastSeq: 0,
      eliminated: false, graceTicks: 0, itElapsed: 0,
      stamina: STAMINA_MAX, sprinting: false,
      invisibleTicks: 0, invisibleCooldown: 0,
      shieldTimer: 0,
    };
    this.players.set(id, p);
    return { hostId: this._hostId, isHost };
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (this._hostId === id && this.players.size > 0) {
      this._hostId = this.players.keys().next().value!;
    }
    if (this._phase === "playing") this.checkWin();
  }

  setTarget(id: string, target: number): boolean {
    if (id !== this._hostId || this._phase !== "lobby") return false;
    this._targetCount = Math.max(2, Math.min(MAX_PLAYERS, target));
    return true;
  }

  startGame(): void {
    if (this.players.size < 2) return;
    this._phase = "playing";
    this.tickCount = 0;
    this.worldMinX = 0; this.worldMinY = 0;
    this.worldMaxX = WORLD.width; this.worldMaxY = WORLD.height;
    this.shields = [];
    this.shieldRespawnTimer = 0;
    this.obstacles = this.generateObstacles();

    const ids = [...this.players.keys()];
    for (let i = 0; i < ids.length; i++) {
      const p = this.players.get(ids[i])!;
      p.eliminated = false; p.graceTicks = 0; p.itElapsed = 0;
      p.stamina = STAMINA_MAX; p.sprinting = false;
      p.invisibleTicks = 0; p.invisibleCooldown = 0;
      p.shieldTimer = 0;
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      p.pos = { ...spawn };
    }

    this.itPlayerId = ids[Math.floor(Math.random() * ids.length)];
    const it = this.players.get(this.itPlayerId)!;
    it.graceTicks = GRACE_TICKS;
  }

  restartGame(): void {
    if (this.players.size < 2) return;
    this._phase = "playing";
    this.tickCount = 0;
    this.winnerId = ""; this.winnerName = "";
    this.lastTaggedPlayerId = ""; this.tagTick = 0;
    this.worldMinX = 0; this.worldMinY = 0;
    this.worldMaxX = WORLD.width; this.worldMaxY = WORLD.height;
    this.shields = []; this.shieldRespawnTimer = 0;
    this.obstacles = this.generateObstacles();

    const ids = [...this.players.keys()];
    for (let i = 0; i < ids.length; i++) {
      const p = this.players.get(ids[i])!;
      p.eliminated = false; p.graceTicks = 0; p.itElapsed = 0;
      p.stamina = STAMINA_MAX; p.sprinting = false;
      p.invisibleTicks = 0; p.invisibleCooldown = 0;
      p.shieldTimer = 0;
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      p.pos = { ...spawn };
    }

    this.itPlayerId = ids[Math.floor(Math.random() * ids.length)];
    const it = this.players.get(this.itPlayerId)!;
    it.graceTicks = GRACE_TICKS;
  }

  setInput(id: string, seq: number, dir: Vec2, sprint: boolean, invisible: boolean): void {
    const p = this.players.get(id);
    if (!p || seq <= p.lastSeq) return;
    let { x, y } = dir;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.lastDir = { x, y };
    p.lastSeq = seq;

    p.sprinting = sprint && p.stamina > 0;
    if (invisible && p.invisibleCooldown <= 0 && p.invisibleTicks <= 0) {
      p.invisibleTicks = INVISIBLE_DURATION_TICKS;
      p.invisibleCooldown = INVISIBLE_COOLDOWN_TICKS;
    }
  }

  tick(): void {
    if (this._phase !== "playing") return;
    const dt = 1 / TICK_RATE;
    this.tickCount++;

    const it = this.players.get(this.itPlayerId);
    if (!it || it.eliminated) { this.pickNextIt(); return; }

    for (const p of this.players.values()) {
      if (p.sprinting && p.stamina > 0) {
        p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN_PER_TICK);
        if (p.stamina <= 0) p.sprinting = false;
      } else {
        p.stamina = Math.min(STAMINA_MAX, p.stamina + STAMINA_REGEN_PER_TICK);
      }
      if (p.invisibleCooldown > 0) p.invisibleCooldown--;
      if (p.invisibleTicks > 0) p.invisibleTicks--;
      if (p.shieldTimer > 0) p.shieldTimer--;
    }

    if (it.graceTicks > 0) {
      it.graceTicks--;
    } else if (it.shieldTimer > 0) {
    } else {
      it.itElapsed += dt;
      if (it.itElapsed >= IT_ELIMINATE_TIME) {
        it.eliminated = true;
        this.shrinkWorld();
        this.pickNextIt();
        this.checkWin();
        return;
      }
    }

    const bounds = { minX: this.worldMinX, minY: this.worldMinY, maxX: this.worldMaxX, maxY: this.worldMaxY };
    for (const p of this.players.values()) {
      if (p.eliminated) continue;
      const speed = (p.sprinting && p.stamina > 0 ? PLAYER_SPEED * SPRINT_SPEED_MULT : PLAYER_SPEED);
      p.pos.x += p.lastDir.x * speed * dt;
      p.pos.y += p.lastDir.y * speed * dt;
      p.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, p.pos.x));
      p.pos.y = Math.max(bounds.minY, Math.min(bounds.maxY, p.pos.y));

      for (const o of this.obstacles) {
        const closestX = Math.max(o.x, Math.min(p.pos.x, o.x + o.w));
        const closestY = Math.max(o.y, Math.min(p.pos.y, o.y + o.h));
        const dx = p.pos.x - closestX;
        const dy = p.pos.y - closestY;
        const dist = Math.hypot(dx, dy);
        if (dist < OBSTACLE_PLAYER_RADIUS) {
          if (dist === 0) {
            const pushLeft = p.pos.x - o.x;
            const pushTop = p.pos.y - o.y;
            const pushRight = (o.x + o.w) - p.pos.x;
            const pushBottom = (o.y + o.h) - p.pos.y;
            const minX = Math.min(pushLeft, pushRight);
            const minY = Math.min(pushTop, pushBottom);
            if (minX < minY) {
              p.pos.x += pushLeft < pushRight ? -OBSTACLE_PLAYER_RADIUS : OBSTACLE_PLAYER_RADIUS;
            } else {
              p.pos.y += pushTop < pushBottom ? -OBSTACLE_PLAYER_RADIUS : OBSTACLE_PLAYER_RADIUS;
            }
          } else {
            const overlap = OBSTACLE_PLAYER_RADIUS - dist;
            p.pos.x += (dx / dist) * overlap;
            p.pos.y += (dy / dist) * overlap;
          }
        }
      }
    }

    for (const p of this.players.values()) {
      if (p.eliminated || p.id === this.itPlayerId) continue;
      if (p.shieldTimer > 0) continue;
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

    for (const p of this.players.values()) {
      if (p.eliminated) continue;
      for (const s of this.shields) {
        if (!s.active) continue;
        const dx = p.pos.x - s.pos.x;
        const dy = p.pos.y - s.pos.y;
        if (Math.hypot(dx, dy) < SHIELD_PICKUP_RANGE) {
          p.shieldTimer = SHIELD_DURATION * TICK_RATE;
          s.active = false;
        }
      }
    }

    this.shieldRespawnTimer--;
    if (this.shieldRespawnTimer <= 0) {
      const activeCount = this.shields.filter((s) => s.active).length;
      if (activeCount < MAX_SHIELDS) {
        const inactiveIdx = this.shields.findIndex((s) => !s.active);
        if (inactiveIdx >= 0) {
          this.shields[inactiveIdx] = { pos: this.randomShieldPos(), active: true };
        } else {
          this.shields.push({ pos: this.randomShieldPos(), active: true });
        }
      }
      this.shieldRespawnTimer = SHIELD_RESPAWN_TICKS;
    }
  }

  private randomShieldPos(): Vec2 {
    const margin = 80;
    return {
      x: this.worldMinX + margin + Math.random() * (this.worldMaxX - this.worldMinX - margin * 2),
      y: this.worldMinY + margin + Math.random() * (this.worldMaxY - this.worldMinY - margin * 2),
    };
  }

  private generateObstacles(): Obstacle[] {
    const w = WORLD.width;
    const h = WORLD.height;
    const margin = 120;
    const minDim = 50;
    const maxDim = 140;

    const layouts: Obstacle[] = [
      { x: w * 0.2, y: h * 0.25, w: 120, h: 30 },
      { x: w * 0.8, y: h * 0.25, w: 30, h: 120 },
      { x: w * 0.5, y: h * 0.5, w: 100, h: 30 },
      { x: w * 0.35, y: h * 0.7, w: 30, h: 100 },
      { x: w * 0.65, y: h * 0.7, w: 120, h: 30 },
      { x: w * 0.15, y: h * 0.5, w: 80, h: 30 },
      { x: w * 0.85, y: h * 0.5, w: 30, h: 80 },
      { x: w * 0.5, y: h * 0.2, w: 30, h: 80 },
      { x: w * 0.5, y: h * 0.8, w: 80, h: 30 },
      { x: w * 0.25, y: h * 0.4, w: 60, h: 30 },
      { x: w * 0.75, y: h * 0.6, w: 30, h: 60 },
      { x: w * 0.4, y: h * 0.35, w: 30, h: 70 },
    ];

    return layouts;
  }

  private shrinkWorld(): void {
    if (this.worldMaxX - this.worldMinX > MIN_WORLD_SIZE) {
      this.worldMinX += SHRINK_STEP;
      this.worldMaxX -= SHRINK_STEP;
    }
    if (this.worldMaxY - this.worldMinY > MIN_WORLD_SIZE) {
      this.worldMinY += SHRINK_STEP;
      this.worldMaxY -= SHRINK_STEP;
    }
    for (const p of this.players.values()) {
      p.pos.x = Math.max(this.worldMinX, Math.min(this.worldMaxX, p.pos.x));
      p.pos.y = Math.max(this.worldMinY, Math.min(this.worldMaxY, p.pos.y));
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
    if (this._phase === "lobby") return this.lobbyState;

    const players: PlayerSnapshot[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, name: p.name, pos: { ...p.pos },
        eliminated: p.eliminated, graceTicks: p.graceTicks,
        sprintActive: p.sprinting && p.stamina > 0,
        stamina: Math.ceil(p.stamina),
        invisibleActive: p.invisibleTicks > 0,
        shieldTimer: p.shieldTimer > 0 ? Math.ceil(p.shieldTimer / TICK_RATE) : 0,
      });
    }

    if (this._phase === "finished") {
      return { phase: "finished", winnerId: this.winnerId, winnerName: this.winnerName, players };
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
      shields: this.shields.filter((s) => s.active),
      obstacles: this.obstacles,
      worldBounds: {
        minX: this.worldMinX, minY: this.worldMinY,
        maxX: this.worldMaxX, maxY: this.worldMaxY,
      },
    };
  }
}
