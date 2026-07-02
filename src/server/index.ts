import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { GameRoom } from "./game.js";
import { TICK_RATE, SNAPSHOT_RATE, InputMsg, JoinReply, SetTargetMsg } from "../shared/protocol.js";

const app = express();
app.use(express.static("src/public"));

const httpServer = createServer(app);
const io = new Server(httpServer);
const room = new GameRoom();

io.on("connection", (socket) => {
  let joined = false;

  socket.on("join", (name: unknown, reply: (r: JoinReply) => void) => {
    if (joined) return;
    if (room.phase === "finished") room.resetGame();
    if (room.phase !== "lobby") return reply({ ok: false, reason: "Game already started" });
    if (room.isFull) return reply({ ok: false, reason: "Room is full" });

    const { hostId, isHost } = room.addPlayer(
      socket.id,
      typeof name === "string" ? name : ""
    );
    joined = true;
    reply({ ok: true, selfId: socket.id, hostId });

    if (room.isLobbyReady) {
      room.startGame();
    }
  });

  socket.on("start", () => {
    if (!joined) return;
    if (socket.id !== room.hostId) return;
    room.startGame();
  });

  socket.on("setTarget", (msg: SetTargetMsg) => {
    if (!joined) return;
    room.setTarget(socket.id, msg.targetCount);
  });

  socket.on("input", (msg: InputMsg) => {
    if (!joined || !msg || typeof msg.seq !== "number") return;
    room.setInput(socket.id, msg.seq, msg.dir ?? { x: 0, y: 0 });
  });

  socket.on("disconnect", () => {
    room.removePlayer(socket.id);
    console.log(`[leave] ${socket.id}`);
  });
});

setInterval(() => room.tick(), 1000 / TICK_RATE);
setInterval(() => io.emit("state", room.snapshot()), 1000 / SNAPSHOT_RATE);

const PORT = parseInt(process.env.PORT || "3000", 10);
httpServer.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
