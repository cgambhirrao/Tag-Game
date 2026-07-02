export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 20;
export const PLAYER_SPEED = 220;
export const WORLD = { width: 1600, height: 1200 };
export const MAX_PLAYERS = 8;
export const TAG_RANGE = 45;
export const IT_ELIMINATE_TIME = 30;
export const GRACE_TICKS = TICK_RATE * 2;

export type GamePhase = "lobby" | "playing" | "finished";

export interface Vec2 { x: number; y: number }

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
}

export interface InputMsg {
  seq: number;
  dir: Vec2;
}

export interface JoinReply {
  ok: boolean;
  reason?: string;
  selfId?: string;
  hostId?: string;
}

export interface SetTargetMsg {
  targetCount: number;
}
