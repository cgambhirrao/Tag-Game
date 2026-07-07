import {
  Vec2, PlayerSnapshot, GameState, ShieldPickup, Obstacle,
  PowerUp, PowerUpType, Trap, DangerZone, MovingObstacle, GravityWell, Emote,
  PLAYER_SPEED, WORLD, TICK_RATE, MAX_PLAYERS,
  TAG_RANGE, IT_ELIMINATE_TIME, GRACE_TICKS,
  SHIELD_DURATION, SHIELD_RESPAWN_TICKS, MAX_SHIELDS, SHIELD_PICKUP_RANGE,
  SPRINT_SPEED_MULT, STAMINA_MAX, STAMINA_DRAIN_PER_TICK, STAMINA_REGEN_PER_TICK,
  INVISIBLE_DURATION_TICKS, INVISIBLE_COOLDOWN_TICKS,
  SHRINK_STEP, MIN_WORLD_SIZE, OBSTACLE_PLAYER_RADIUS,
  POWERUP_SPEED_DURATION, POWERUP_SPEED_MULT, POWERUP_FREEZE_DURATION,
  POWERUP_MAGNET_RANGE, POWERUP_MAGNET_FORCE,
  POWERUP_RESPAWN_TICKS, MAX_POWERUPS, POWERUP_PICKUP_RANGE,
  DASH_SPEED_MULT, DASH_DURATION_TICKS, DASH_COOLDOWN_TICKS,
  TRAP_RADIUS, TRAP_SLOW_MULT, TRAP_DURATION_TICKS, TRAP_COOLDOWN_TICKS, MAX_TRAPS_PER_PLAYER,
  TELEPORT_RANGE, TELEPORT_COOLDOWN_TICKS,
  DANGER_ZONE_RADIUS, DANGER_ZONE_TICKS, DANGER_ZONE_SPAWN_TICKS, MAX_DANGER_ZONES,
  MOVING_OBSTACLE_SPEED,
  GRAVITY_WELL_RADIUS, GRAVITY_WELL_FORCE, GRAVITY_WELL_SPAWN_TICKS, MAX_GRAVITY_WELLS,
  EMOTE_DURATION_TICKS, MAP_COUNT, EmoteType,
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
  frozenTicks: number;
  speedBoostTicks: number;
  dashTicks: number;
  dashCooldown: number;
  trapCooldown: number;
  teleportCooldown: number;
  teleportUsed: boolean;
  dashUsed: boolean;
  emoteCooldown: number;
  tags: number;
  streak: number;
  bestStreak: number;
  skinId: string;
}

const SPAWN_POINTS: Vec2[] = [
  { x: 200, y: 150 }, { x: 1400, y: 150 },
  { x: 200, y: 1050 }, { x: 1400, y: 1050 },
  { x: 800, y: 600 },
  { x: 400, y: 300 }, { x: 1200, y: 300 },
  { x: 400, y: 900 },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class GameRoom {
  private players = new Map<string, ServerPlayer>();
  private _hostId = "";
  private _targetCount = MAX_PLAYERS;
  private _phase: "lobby" | "playing" | "finished" = "lobby";
  private _mapIndex = 0;
  private _teamMode = false;

  get phase(): string { return this._phase; }
  get hostId(): string { return this._hostId; }
  get targetCount(): number { return this._targetCount; }
  get playerCount(): number { return this.players.size; }
  get mapIndex(): number { return this._mapIndex; }
  get teamMode(): boolean { return this._teamMode; }

  private itPlayerId = "";
  private winnerId = "";
  private winnerName = "";
  private tickCount = 0;
  private lastTaggedPlayerId = "";
  private tagTick = 0;

  private shields: ShieldPickup[] = [];
  private shieldRespawnTimer = 0;
  private obstacles: Obstacle[] = [];
  private movingObstacles: MovingObstacle[] = [];
  private powerUps: PowerUp[] = [];
  private powerUpRespawnTimer = 0;
  private traps: Trap[] = [];
  private dangerZones: DangerZone[] = [];
  private dangerSpawnTimer = 0;
  private gravityWells: GravityWell[] = [];
  private gravityWellSpawnTimer = 0;
  private emotes: Emote[] = [];

  private worldMinX = 0;
  private worldMinY = 0;
  private worldMaxX = WORLD.width;
  private worldMaxY = WORLD.height;

  get isFull(): boolean { return this.players.size >= MAX_PLAYERS; }

  get isLobbyReady(): boolean {
    return this.players.size >= 2 && this.players.size >= this._targetCount;
  }

  get lobbyState(): GameState {
    const arr: { id: string; name: string; skinId: string }[] = [];
    for (const p of this.players.values()) arr.push({ id: p.id, name: p.name, skinId: p.skinId });
    return {
      phase: "lobby",
      playerCount: this.players.size,
      targetCount: this._targetCount,
      players: arr,
      hostId: this._hostId,
      mapIndex: this._mapIndex,
      teamMode: this._teamMode,
    };
  }

  setMap(id: string, idx: number): boolean {
    if (id !== this._hostId || this._phase !== "lobby") return false;
    this._mapIndex = clamp(idx, 0, MAP_COUNT - 1);
    return true;
  }

  setTeamMode(id: string, on: boolean): boolean {
    if (id !== this._hostId || this._phase !== "lobby") return false;
    this._teamMode = on;
    return true;
  }

  setSkin(id: string, skinId: string): boolean {
    if (this._phase !== "lobby") return false;
    const p = this.players.get(id);
    if (!p) return false;
    p.skinId = skinId.slice(0, 16) || "default";
    return true;
  }

  addPlayer(id: string, name: string, skinId?: string): { hostId: string; isHost: boolean } {
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
      shieldTimer: 0, frozenTicks: 0, speedBoostTicks: 0,
      dashTicks: 0, dashCooldown: 0,
      trapCooldown: 0, teleportCooldown: 0,
      teleportUsed: false, dashUsed: false, emoteCooldown: 0,
      tags: 0, streak: 0, bestStreak: 0,
      skinId: skinId || "default",
    };
    this.players.set(id, p);
    return { hostId: this._hostId, isHost };
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.traps = this.traps.filter((t) => t.playerId !== id);
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
    this.shields = []; this.shieldRespawnTimer = 0;
    this.powerUps = []; this.powerUpRespawnTimer = 0;
    this.traps = []; this.dangerZones = []; this.dangerSpawnTimer = 0;
    this.gravityWells = []; this.gravityWellSpawnTimer = 0;
    this.emotes = [];
    this.lastTaggedPlayerId = ""; this.tagTick = 0;

    this.obstacles = this.generateObstacles(this._mapIndex);
    this.movingObstacles = this.generateMovingObstacles(this._mapIndex);

    const ids = [...this.players.keys()];
    for (let i = 0; i < ids.length; i++) {
      const p = this.players.get(ids[i])!;
      p.eliminated = false; p.graceTicks = 0; p.itElapsed = 0;
      p.stamina = STAMINA_MAX; p.sprinting = false;
      p.invisibleTicks = 0; p.invisibleCooldown = 0;
      p.shieldTimer = 0; p.frozenTicks = 0; p.speedBoostTicks = 0;
      p.dashTicks = 0; p.dashCooldown = 0;
      p.trapCooldown = 0; p.teleportCooldown = 0;
      p.teleportUsed = false; p.dashUsed = false; p.emoteCooldown = 0;
      p.tags = 0; p.streak = 0;
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
    this.powerUps = []; this.powerUpRespawnTimer = 0;
    this.traps = []; this.dangerZones = []; this.dangerSpawnTimer = 0;
    this.gravityWells = []; this.gravityWellSpawnTimer = 0;
    this.emotes = [];

    this.obstacles = this.generateObstacles(this._mapIndex);
    this.movingObstacles = this.generateMovingObstacles(this._mapIndex);

    const ids = [...this.players.keys()];
    for (let i = 0; i < ids.length; i++) {
      const p = this.players.get(ids[i])!;
      p.eliminated = false; p.graceTicks = 0; p.itElapsed = 0;
      p.stamina = STAMINA_MAX; p.sprinting = false;
      p.invisibleTicks = 0; p.invisibleCooldown = 0;
      p.shieldTimer = 0; p.frozenTicks = 0; p.speedBoostTicks = 0;
      p.dashTicks = 0; p.dashCooldown = 0;
      p.trapCooldown = 0; p.teleportCooldown = 0;
      p.teleportUsed = false; p.dashUsed = false; p.emoteCooldown = 0;
      p.tags = 0; p.streak = 0;
      const spawn = SPAWN_POINTS[i % SPAWN_POINTS.length];
      p.pos = { ...spawn };
    }

    this.itPlayerId = ids[Math.floor(Math.random() * ids.length)];
    const it = this.players.get(this.itPlayerId)!;
    it.graceTicks = GRACE_TICKS;
  }

  setInput(id: string, seq: number, dir: Vec2, sprint: boolean, invisible: boolean, dash?: boolean, placeTrap?: boolean, teleport?: Vec2, emote?: EmoteType): void {
    const p = this.players.get(id);
    if (!p || seq <= p.lastSeq) return;
    let { x, y } = dir;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.lastDir = { x, y };
    p.lastSeq = seq;

    p.sprinting = sprint && p.stamina > 0 && p.frozenTicks <= 0;
    if (invisible && p.invisibleCooldown <= 0 && p.invisibleTicks <= 0) {
      p.invisibleTicks = INVISIBLE_DURATION_TICKS;
      p.invisibleCooldown = INVISIBLE_COOLDOWN_TICKS;
    }

    if (dash && p.dashCooldown <= 0 && p.dashTicks <= 0 && p.frozenTicks <= 0) {
      p.dashTicks = DASH_DURATION_TICKS;
      p.dashCooldown = DASH_COOLDOWN_TICKS;
      p.dashUsed = true;
    }

    if (placeTrap && p.trapCooldown <= 0 && p.frozenTicks <= 0) {
      const myTraps = this.traps.filter((t) => t.playerId === id && t.active).length;
      if (myTraps < MAX_TRAPS_PER_PLAYER) {
        this.traps.push({ pos: { ...p.pos }, playerId: id, active: true, ticksLeft: TRAP_DURATION_TICKS });
        p.trapCooldown = TRAP_COOLDOWN_TICKS;
      }
    }

    if (teleport && p.teleportCooldown <= 0 && p.frozenTicks <= 0 && !p.teleportUsed) {
      const dist = Math.hypot(teleport.x - p.pos.x, teleport.y - p.pos.y);
      if (dist <= TELEPORT_RANGE && this.isInBounds(teleport)) {
        let blocked = false;
        for (const o of this.obstacles) {
          if (teleport.x > o.x - OBSTACLE_PLAYER_RADIUS && teleport.x < o.x + o.w + OBSTACLE_PLAYER_RADIUS &&
              teleport.y > o.y - OBSTACLE_PLAYER_RADIUS && teleport.y < o.y + o.h + OBSTACLE_PLAYER_RADIUS) {
            blocked = true; break;
          }
        }
        if (!blocked) {
          p.pos.x = teleport.x;
          p.pos.y = teleport.y;
          p.teleportCooldown = TELEPORT_COOLDOWN_TICKS;
          p.teleportUsed = true;
        }
      }
    }

    if (emote && p.emoteCooldown <= 0) {
      const texts: Record<EmoteType, string> = {
        close: "CLOSE!", nice: "NICE!", help: "HELP!", gg: "GG!",
      };
      this.emotes.push({ playerId: id, text: texts[emote], ticksLeft: EMOTE_DURATION_TICKS });
      p.emoteCooldown = TICK_RATE * 2;
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
      if (p.frozenTicks > 0) p.frozenTicks--;
      if (p.speedBoostTicks > 0) p.speedBoostTicks--;
      if (p.dashTicks > 0) p.dashTicks--;
      if (p.dashCooldown > 0) p.dashCooldown--;
      if (p.trapCooldown > 0) p.trapCooldown--;
      if (p.teleportCooldown > 0) p.teleportCooldown--;
      if (p.emoteCooldown > 0) p.emoteCooldown--;
      p.teleportUsed = false;
    }

    if (it.graceTicks > 0) {
      it.graceTicks--;
    } else if (it.shieldTimer > 0) {
    } else {
      it.itElapsed += dt;
      if (it.itElapsed >= IT_ELIMINATE_TIME) {
        it.eliminated = true;
        it.streak = 0;
        this.shrinkWorld();
        this.pickNextIt();
        this.checkWin();
        return;
      }
    }

    for (const mo of this.movingObstacles) {
      mo.x += mo.vx * dt;
      mo.y += mo.vy * dt;
      if (mo.x < this.worldMinX || mo.x + mo.w > this.worldMaxX) { mo.vx *= -1; mo.x = clamp(mo.x, this.worldMinX, this.worldMaxX - mo.w); }
      if (mo.y < this.worldMinY || mo.y + mo.h > this.worldMaxY) { mo.vy *= -1; mo.y = clamp(mo.y, this.worldMinY, this.worldMaxY - mo.h); }
    }

    const bounds = { minX: this.worldMinX, minY: this.worldMinY, maxX: this.worldMaxX, maxY: this.worldMaxY };
    for (const p of this.players.values()) {
      if (p.eliminated) continue;
      if (p.frozenTicks > 0) continue;

      let speed = PLAYER_SPEED;
      if (p.sprinting && p.stamina > 0) speed *= SPRINT_SPEED_MULT;
      if (p.speedBoostTicks > 0) speed *= POWERUP_SPEED_MULT;
      if (p.dashTicks > 0) speed *= DASH_SPEED_MULT;

      let trapped = false;
      for (const trap of this.traps) {
        if (!trap.active || trap.playerId === p.id) continue;
        const tdx = p.pos.x - trap.pos.x;
        const tdy = p.pos.y - trap.pos.y;
        if (Math.hypot(tdx, tdy) < TRAP_RADIUS) {
          trapped = true;
          break;
        }
      }
      if (trapped) speed *= TRAP_SLOW_MULT;

      for (const gw of this.gravityWells) {
        if (gw.ticksLeft <= 0) continue;
        const gdx = gw.pos.x - p.pos.x;
        const gdy = gw.pos.y - p.pos.y;
        const gdist = Math.hypot(gdx, gdy);
        if (gdist < gw.radius && gdist > 1) {
          const factor = (1 - gdist / gw.radius) * gw.force * dt;
          p.pos.x += (gdx / gdist) * factor;
          p.pos.y += (gdy / gdist) * factor;
        }
      }

      p.pos.x += p.lastDir.x * speed * dt;
      p.pos.y += p.lastDir.y * speed * dt;
      p.pos.x = clamp(p.pos.x, bounds.minX, bounds.maxX);
      p.pos.y = clamp(p.pos.y, bounds.minY, bounds.maxY);

      const allObs = [...this.obstacles, ...this.movingObstacles.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h }))];
      for (const o of allObs) {
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
      if (p.shieldTimer > 0 || p.frozenTicks > 0) continue;
      const dx = it.pos.x - p.pos.x;
      const dy = it.pos.y - p.pos.y;
      if (Math.hypot(dx, dy) < TAG_RANGE) {
        p.graceTicks = GRACE_TICKS;
        p.itElapsed = 0;
        this.itPlayerId = p.id;
        this.lastTaggedPlayerId = p.id;
        this.tagTick = this.tickCount;
        it.tags++;
        it.streak++;
        if (it.streak > it.bestStreak) it.bestStreak = it.streak;
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

    for (const p of this.players.values()) {
      if (p.eliminated) continue;
      for (const pu of this.powerUps) {
        if (!pu.active) continue;
        const dx = p.pos.x - pu.pos.x;
        const dy = p.pos.y - pu.pos.y;
        if (Math.hypot(dx, dy) < POWERUP_PICKUP_RANGE) {
          if (pu.type === "speed") {
            p.speedBoostTicks = POWERUP_SPEED_DURATION;
          } else if (pu.type === "freeze") {
            const target = this.getClosestEnemy(p);
            if (target) target.frozenTicks = POWERUP_FREEZE_DURATION;
          } else if (pu.type === "magnet") {
            const target = this.getClosestEnemy(p);
            if (target) {
              const mdx = p.pos.x - target.pos.x;
              const mdy = p.pos.y - target.pos.y;
              const mdist = Math.hypot(mdx, mdy);
              if (mdist > 1 && mdist < POWERUP_MAGNET_RANGE) {
                target.pos.x += (mdx / mdist) * POWERUP_MAGNET_FORCE * dt * TICK_RATE;
                target.pos.y += (mdy / mdist) * POWERUP_MAGNET_FORCE * dt * TICK_RATE;
              }
            }
          }
          pu.active = false;
        }
      }
    }

    for (const trap of this.traps) {
      if (!trap.active) continue;
      trap.ticksLeft--;
      if (trap.ticksLeft <= 0) trap.active = false;
    }

    for (const dz of this.dangerZones) {
      dz.ticksLeft--;
      for (const p of this.players.values()) {
        if (p.eliminated || p.shieldTimer > 0) continue;
        const ddx = p.pos.x - dz.pos.x;
        const ddy = p.pos.y - dz.pos.y;
        if (Math.hypot(ddx, ddy) < dz.radius) {
          if (p.id === this.itPlayerId) {
            it.itElapsed += dt * 2;
          } else {
            p.eliminated = true;
            p.streak = 0;
            this.shrinkWorld();
            this.pickNextIt();
          }
        }
      }
    }
    this.dangerZones = this.dangerZones.filter((dz) => dz.ticksLeft > 0);

    for (const gw of this.gravityWells) {
      gw.ticksLeft--;
    }
    this.gravityWells = this.gravityWells.filter((gw) => gw.ticksLeft > 0);

    for (const em of this.emotes) {
      em.ticksLeft--;
    }
    this.emotes = this.emotes.filter((em) => em.ticksLeft > 0);

    this.shieldRespawnTimer--;
    if (this.shieldRespawnTimer <= 0) {
      const activeCount = this.shields.filter((s) => s.active).length;
      if (activeCount < MAX_SHIELDS) {
        const inactiveIdx = this.shields.findIndex((s) => !s.active);
        if (inactiveIdx >= 0) {
          this.shields[inactiveIdx] = { pos: this.randomPos(80), active: true };
        } else {
          this.shields.push({ pos: this.randomPos(80), active: true });
        }
      }
      this.shieldRespawnTimer = SHIELD_RESPAWN_TICKS;
    }

    this.powerUpRespawnTimer--;
    if (this.powerUpRespawnTimer <= 0) {
      const activeCount = this.powerUps.filter((s) => s.active).length;
      if (activeCount < MAX_POWERUPS) {
        const types: PowerUpType[] = ["speed", "freeze", "magnet"];
        const type = types[Math.floor(Math.random() * types.length)];
        const inactiveIdx = this.powerUps.findIndex((s) => !s.active);
        if (inactiveIdx >= 0) {
          this.powerUps[inactiveIdx] = { pos: this.randomPos(80), type, active: true };
        } else {
          this.powerUps.push({ pos: this.randomPos(80), type, active: true });
        }
      }
      this.powerUpRespawnTimer = POWERUP_RESPAWN_TICKS;
    }

    this.dangerSpawnTimer--;
    if (this.dangerSpawnTimer <= 0 && this.dangerZones.length < MAX_DANGER_ZONES) {
      this.dangerZones.push({ pos: this.randomPos(100), ticksLeft: DANGER_ZONE_TICKS, radius: DANGER_ZONE_RADIUS });
      this.dangerSpawnTimer = DANGER_ZONE_SPAWN_TICKS;
    }

    this.gravityWellSpawnTimer--;
    if (this.gravityWellSpawnTimer <= 0 && this.gravityWells.length < MAX_GRAVITY_WELLS) {
      this.gravityWells.push({
        pos: this.randomPos(100),
        ticksLeft: TICK_RATE * 10,
        radius: GRAVITY_WELL_RADIUS,
        force: GRAVITY_WELL_FORCE,
      });
      this.gravityWellSpawnTimer = GRAVITY_WELL_SPAWN_TICKS;
    }
  }

  private getClosestEnemy(p: ServerPlayer): ServerPlayer | null {
    let closest: ServerPlayer | null = null;
    let minDist = Infinity;
    for (const other of this.players.values()) {
      if (other.id === p.id || other.eliminated) continue;
      const dx = other.pos.x - p.pos.x;
      const dy = other.pos.y - p.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) { minDist = dist; closest = other; }
    }
    return closest;
  }

  private isInBounds(pos: Vec2): boolean {
    return pos.x >= this.worldMinX && pos.x <= this.worldMaxX &&
           pos.y >= this.worldMinY && pos.y <= this.worldMaxY;
  }

  private randomPos(margin: number): Vec2 {
    return {
      x: this.worldMinX + margin + Math.random() * (this.worldMaxX - this.worldMinX - margin * 2),
      y: this.worldMinY + margin + Math.random() * (this.worldMaxY - this.worldMinY - margin * 2),
    };
  }

  private generateObstacles(mapIdx: number): Obstacle[] {
    const w = WORLD.width;
    const h = WORLD.height;
    const layouts: Obstacle[][] = [
      [
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
      ],
      [
        { x: w * 0.5, y: h * 0.3, w: 200, h: 20 },
        { x: w * 0.5, y: h * 0.7, w: 200, h: 20 },
        { x: w * 0.3, y: h * 0.5, w: 20, h: 200 },
        { x: w * 0.7, y: h * 0.5, w: 20, h: 200 },
        { x: w * 0.2, y: h * 0.2, w: 80, h: 20 },
        { x: w * 0.8, y: h * 0.2, w: 80, h: 20 },
        { x: w * 0.2, y: h * 0.8, w: 80, h: 20 },
        { x: w * 0.8, y: h * 0.8, w: 80, h: 20 },
      ],
      [
        { x: w * 0.1, y: h * 0.1, w: 100, h: 30 },
        { x: w * 0.9 - 100, y: h * 0.1, w: 100, h: 30 },
        { x: w * 0.1, y: h * 0.9 - 30, w: 100, h: 30 },
        { x: w * 0.9 - 100, y: h * 0.9 - 30, w: 100, h: 30 },
        { x: w * 0.5 - 15, y: h * 0.15, w: 30, h: 80 },
        { x: w * 0.5 - 15, y: h * 0.85 - 80, w: 30, h: 80 },
        { x: w * 0.3, y: h * 0.5 - 15, w: 80, h: 30 },
        { x: w * 0.7 - 80, y: h * 0.5 - 15, w: 80, h: 30 },
        { x: w * 0.5 - 40, y: h * 0.5 - 40, w: 80, h: 80 },
      ],
      [
        { x: w * 0.15, y: h * 0.3, w: 60, h: 60 },
        { x: w * 0.85 - 60, y: h * 0.3, w: 60, h: 60 },
        { x: w * 0.15, y: h * 0.7 - 60, w: 60, h: 60 },
        { x: w * 0.85 - 60, y: h * 0.7 - 60, w: 60, h: 60 },
        { x: w * 0.4, y: h * 0.1, w: 30, h: 100 },
        { x: w * 0.6 - 30, y: h * 0.1, w: 30, h: 100 },
        { x: w * 0.4, y: h * 0.9 - 100, w: 30, h: 100 },
        { x: w * 0.6 - 30, y: h * 0.9 - 100, w: 30, h: 100 },
        { x: w * 0.45, y: h * 0.45, w: 100, h: 20 },
        { x: w * 0.5 - 10, y: h * 0.45, w: 20, h: 100 },
      ],
    ];
    return layouts[mapIdx % layouts.length];
  }

  private generateMovingObstacles(mapIdx: number): MovingObstacle[] {
    const w = WORLD.width;
    const h = WORLD.height;
    if (mapIdx === 1) {
      return [
        { x: w * 0.3, y: h * 0.15, w: 40, h: 40, vx: MOVING_OBSTACLE_SPEED, vy: 0 },
        { x: w * 0.7, y: h * 0.85, w: 40, h: 40, vx: -MOVING_OBSTACLE_SPEED, vy: 0 },
      ];
    }
    if (mapIdx === 3) {
      return [
        { x: w * 0.5, y: h * 0.2, w: 50, h: 20, vx: 0, vy: MOVING_OBSTACLE_SPEED },
        { x: w * 0.5, y: h * 0.8, w: 50, h: 20, vx: 0, vy: -MOVING_OBSTACLE_SPEED },
      ];
    }
    return [];
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
      p.pos.x = clamp(p.pos.x, this.worldMinX, this.worldMaxX);
      p.pos.y = clamp(p.pos.y, this.worldMinY, this.worldMaxY);
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
      let trapped = false;
      for (const trap of this.traps) {
        if (!trap.active || trap.playerId === p.id) continue;
        if (Math.hypot(p.pos.x - trap.pos.x, p.pos.y - trap.pos.y) < TRAP_RADIUS) {
          trapped = true; break;
        }
      }
      players.push({
        id: p.id, name: p.name, pos: { ...p.pos },
        eliminated: p.eliminated, graceTicks: p.graceTicks,
        sprintActive: p.sprinting && p.stamina > 0,
        stamina: Math.ceil(p.stamina),
        invisibleActive: p.invisibleTicks > 0,
        shieldTimer: p.shieldTimer > 0 ? Math.ceil(p.shieldTimer / TICK_RATE) : 0,
        frozen: p.frozenTicks > 0,
        speedBoosted: p.speedBoostTicks > 0,
        trapped,
        skinId: p.skinId,
        tags: p.tags,
        streak: p.streak,
      });
    }

    if (this._phase === "finished") {
      const stats = players.map((p) => ({ id: p.id, name: p.name, tags: p.tags, streak: p.streak }));
      stats.sort((a, b) => b.tags - a.tags);
      return { phase: "finished", winnerId: this.winnerId, winnerName: this.winnerName, players, stats };
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
      movingObstacles: this.movingObstacles,
      powerUps: this.powerUps.filter((s) => s.active),
      traps: this.traps.filter((t) => t.active),
      dangerZones: this.dangerZones,
      gravityWells: this.gravityWells,
      emotes: this.emotes,
      worldBounds: {
        minX: this.worldMinX, minY: this.worldMinY,
        maxX: this.worldMaxX, maxY: this.worldMaxY,
      },
      ticksLeft30: it ? it.itElapsed >= IT_ELIMINATE_TIME - 30 : false,
    };
  }
}
