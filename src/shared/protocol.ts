export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 20;
export const PLAYER_SPEED = 220;
export const WORLD = { width: 1600, height: 1200 };
export const MAX_PLAYERS = 8;
export const TAG_RANGE = 45;
export const IT_ELIMINATE_TIME = 120;
export const GRACE_TICKS = TICK_RATE * 5;

export const SHIELD_DURATION = 5;
export const SHIELD_RESPAWN_TICKS = TICK_RATE * 10;
export const MAX_SHIELDS = 3;
export const SHIELD_PICKUP_RANGE = 36;

export const SPRINT_SPEED_MULT = 2;
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_PER_TICK = 3;
export const STAMINA_REGEN_PER_TICK = 1;

export const INVISIBLE_DURATION_TICKS = TICK_RATE * 3;
export const INVISIBLE_COOLDOWN_TICKS = TICK_RATE * 8;

export const SHRINK_STEP = 100;
export const MIN_WORLD_SIZE = 400;
export const OBSTACLE_PLAYER_RADIUS = 14;

export const POWERUP_SPEED_DURATION = TICK_RATE * 5;
export const POWERUP_SPEED_MULT = 1.5;
export const POWERUP_FREEZE_DURATION = TICK_RATE * 3;
export const POWERUP_MAGNET_RANGE = 150;
export const POWERUP_MAGNET_FORCE = 80;
export const POWERUP_RESPAWN_TICKS = TICK_RATE * 15;
export const MAX_POWERUPS = 3;
export const POWERUP_PICKUP_RANGE = 36;

export const DASH_SPEED_MULT = 4;
export const DASH_DURATION_TICKS = 8;
export const DASH_COOLDOWN_TICKS = TICK_RATE * 5;

export const TRAP_RADIUS = 60;
export const TRAP_SLOW_MULT = 0.3;
export const TRAP_DURATION_TICKS = TICK_RATE * 4;
export const TRAP_COOLDOWN_TICKS = TICK_RATE * 10;
export const MAX_TRAPS_PER_PLAYER = 2;

export const TELEPORT_RANGE = 200;
export const TELEPORT_COOLDOWN_TICKS = TICK_RATE * 8;

export const DANGER_ZONE_RADIUS = 50;
export const DANGER_ZONE_TICKS = TICK_RATE * 5;
export const DANGER_ZONE_SPAWN_TICKS = TICK_RATE * 20;
export const MAX_DANGER_ZONES = 3;

export const MOVING_OBSTACLE_SPEED = 60;

export const GRAVITY_WELL_RADIUS = 120;
export const GRAVITY_WELL_FORCE = 100;
export const GRAVITY_WELL_SPAWN_TICKS = TICK_RATE * 30;
export const MAX_GRAVITY_WELLS = 2;

export const EMOTE_DURATION_TICKS = TICK_RATE * 3;

export const MAP_COUNT = 4;

export const SKINS: { id: string; name: string; color: string; unlockTags: number }[] = [
  { id: "default", name: "Default", color: "#5ce87b", unlockTags: 0 },
  { id: "blue", name: "Ocean", color: "#5ab0f0", unlockTags: 5 },
  { id: "red", name: "Crimson", color: "#e85c5c", unlockTags: 10 },
  { id: "gold", name: "Gold", color: "#f0c040", unlockTags: 20 },
  { id: "purple", name: "Violet", color: "#b07cf0", unlockTags: 35 },
  { id: "cyan", name: "Cyan", color: "#5cf0e8", unlockTags: 50 },
  { id: "orange", name: "Blaze", color: "#f0924c", unlockTags: 75 },
  { id: "pink", name: "Neon", color: "#f05ca8", unlockTags: 100 },
];

export const DAILY_CHALLENGES: { id: string; desc: string; reward: number }[] = [
  { id: "tag3", desc: "Tag 3 players in one game", reward: 5 },
  { id: "win", desc: "Win a game", reward: 10 },
  { id: "survive60", desc: "Survive 60s as IT", reward: 8 },
  { id: "dash3", desc: "Use dash 3 times", reward: 3 },
  { id: "trap2", desc: "Trap 2 players", reward: 5 },
  { id: "teleport5", desc: "Use teleport 5 times", reward: 4 },
  { id: "nodash", desc: "Win without using dash", reward: 15 },
  { id: "shield3", desc: "Collect 3 shields", reward: 6 },
];

export type GamePhase = "lobby" | "playing" | "finished";

export type PowerUpType = "speed" | "freeze" | "magnet";
export type EmoteType = "close" | "nice" | "help" | "gg";

export interface Vec2 { x: number; y: number }

export interface ShieldPickup { pos: Vec2; active: boolean }

export interface Obstacle { x: number; y: number; w: number; h: number }

export interface PowerUp { pos: Vec2; type: PowerUpType; active: boolean }

export interface Trap { pos: Vec2; playerId: string; active: boolean; ticksLeft: number }

export interface DangerZone { pos: Vec2; ticksLeft: number; radius: number }

export interface MovingObstacle { x: number; y: number; w: number; h: number; vx: number; vy: number }

export interface GravityWell { pos: Vec2; ticksLeft: number; radius: number; force: number }

export interface Emote { playerId: string; text: string; ticksLeft: number }

export interface PlayerSnapshot {
  id: string;
  name: string;
  pos: Vec2;
  eliminated: boolean;
  graceTicks: number;
  sprintActive: boolean;
  invisibleActive: boolean;
  shieldTimer: number;
  stamina: number;
  frozen: boolean;
  speedBoosted: boolean;
  trapped: boolean;
  skinId: string;
  tags: number;
  streak: number;
}

export interface LobbyState {
  phase: "lobby";
  playerCount: number;
  targetCount: number;
  players: { id: string; name: string; skinId: string }[];
  hostId: string;
  mapIndex: number;
  teamMode: boolean;
}

export interface PlayingState {
  phase: "playing";
  players: PlayerSnapshot[];
  itPlayerId: string;
  itElapsed: number;
  serverTime: number;
  lastTaggedPlayerId: string;
  tagTick: number;
  shields: ShieldPickup[];
  obstacles: Obstacle[];
  movingObstacles: MovingObstacle[];
  powerUps: PowerUp[];
  traps: Trap[];
  dangerZones: DangerZone[];
  gravityWells: GravityWell[];
  emotes: Emote[];
  worldBounds: { minX: number; minY: number; maxX: number; maxY: number };
  ticksLeft30: boolean;
}

export interface FinishedState {
  phase: "finished";
  winnerId: string;
  winnerName: string;
  players: PlayerSnapshot[];
  stats: { id: string; name: string; tags: number; streak: number }[];
}

export type GameState = LobbyState | PlayingState | FinishedState;

export interface InputMsg {
  seq: number;
  dir: Vec2;
  sprint: boolean;
  invisible: boolean;
  dash?: boolean;
  placeTrap?: boolean;
  teleport?: Vec2;
  emote?: EmoteType;
}

export interface CreateRoomReply {
  ok: boolean;
  code?: string;
  selfId?: string;
  reason?: string;
}

export interface JoinRoomMsg {
  code: string;
  name: string;
  skinId?: string;
}
