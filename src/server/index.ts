import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { GameRoom } from "./game.js";
import {
  TICK_RATE, SNAPSHOT_RATE, MAX_PLAYERS,
  InputMsg, CreateRoomReply, JoinRoomMsg,
} from "../shared/protocol.js";

const app = express();
app.use(express.static("src/public"));

const httpServer = createServer(app);
const io = new Server(httpServer);

const rooms = new Map<string, GameRoom>();
const socketRoom = new Map<string, string>();

function generateCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function cleanupRoom(code: string): void {
  const room = rooms.get(code);
  if (room && room.playerCount === 0) {
    rooms.delete(code);
  }
}

function tickAll(): void {
  for (const room of rooms.values()) room.tick();
}
function broadcastAll(): void {
  for (const [code, room] of rooms) {
    io.to(code).emit("state", room.snapshot());
  }
}

setInterval(tickAll, 1000 / TICK_RATE);
setInterval(broadcastAll, 1000 / SNAPSHOT_RATE);

io.on("connection", (socket) => {
  socket.on("createRoom", (name: unknown, reply: (r: CreateRoomReply) => void) => {
    const code = generateCode();
    const room = new GameRoom();
    room.addPlayer(socket.id, typeof name === "string" ? name : "");
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
    reply({ ok: true, code, selfId: socket.id });
    console.log(`[create] ${code} by ${socket.id}`);
  });

  socket.on("joinRoom", (msg: JoinRoomMsg, reply: (r: CreateRoomReply) => void) => {
    if (typeof msg !== "object" || typeof msg.code !== "string" || typeof msg.name !== "string") {
      return reply({ ok: false, reason: "Invalid request" });
    }
    const room = rooms.get(msg.code);
    if (!room) return reply({ ok: false, reason: "Room not found" });
    if (room.phase !== "lobby") return reply({ ok: false, reason: "Game already started" });
    if (room.isFull) return reply({ ok: false, reason: "Room is full" });

    const { hostId } = room.addPlayer(socket.id, msg.name);
    socketRoom.set(socket.id, msg.code);
    socket.join(msg.code);
    reply({ ok: true, selfId: socket.id });

    if (room.isLobbyReady) room.startGame();
  });

  socket.on("setTarget", (targetCount: number) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.setTarget(socket.id, Math.max(2, Math.min(MAX_PLAYERS, targetCount)));
  });

  socket.on("start", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;
    room.startGame();
  });

  socket.on("restart", () => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || socket.id !== room.hostId) return;
    room.restartGame();
  });

  socket.on("input", (msg: InputMsg) => {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || !msg || typeof msg.seq !== "number") return;
    room.setInput(
      socket.id, msg.seq, msg.dir ?? { x: 0, y: 0 },
      !!msg.sprint, !!msg.invisible
    );
  });

  socket.on("disconnect", () => {
    const code = socketRoom.get(socket.id);
    if (code) {
      const room = rooms.get(code);
      if (room) {
        room.removePlayer(socket.id);
        cleanupRoom(code);
      }
      socketRoom.delete(socket.id);
    }
    console.log(`[leave] ${socket.id}`);
  });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
httpServer.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
