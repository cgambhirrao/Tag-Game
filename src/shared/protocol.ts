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

export type GamePhase = "lobby" | "playing" | "finished";

export interface Vec2 { x: number; y: number }

export interface ShieldPickup {
  pos: Vec2;
  active: boolean;
}

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LobbyState {
  phase: "lobby";
  playerCount: number;
  targetCount: number;
  players: { id: string; name: string }[];
  hostId: string;
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
  worldBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface FinishedState {
  phase: "finished";
  winnerId: string;
  winnerName: string;
  players: PlayerSnapshot[];
}

export type GameState = LobbyState | PlayingState | FinishedState;

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
}

export interface InputMsg {
  seq: number;
  dir: Vec2;
  sprint: boolean;
  invisible: boolean;
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
}
