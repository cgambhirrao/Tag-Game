const IT_ELIMINATE_TIME = 30;
const SEND_RATE = 20;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
canvas.width = innerWidth;
canvas.height = innerHeight;
addEventListener("resize", () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
});

const lobbyEl = document.getElementById("lobby");
const lobbyBox = document.getElementById("lobby-box");
const lobbyStatus = document.getElementById("lobby-status");
const lobbyHint = document.getElementById("lobby-hint");
const playerList = document.getElementById("player-list");
const hostControls = document.getElementById("host-controls");
const targetCountSpan = document.getElementById("target-count");
const decBtn = document.getElementById("dec-btn");
const incBtn = document.getElementById("inc-btn");
const startBtn = document.getElementById("start-btn");
const winnerEl = document.getElementById("winner");
const winnerNameEl = document.getElementById("winner-name");
const playAgainBtn = document.getElementById("play-again-btn");
const itLabel = document.getElementById("it-label");
const itBarOuter = document.getElementById("it-bar-outer");
const itBarInner = document.getElementById("it-bar-inner");
let tagFlashTimer = 0;
let lastTaggedId = "";

const socket = io();
let selfId = null;
let hostId = null;
let seq = 0;
let keys = new Set();
let currentState = null;

addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));

socket.on("connect", () => {
  const name = prompt("Your name:") || "TagPlayer";
  socket.emit("join", name, (reply) => {
    if (!reply.ok) { hud.textContent = reply.reason; return; }
    selfId = reply.selfId;
    hostId = reply.hostId;
    lobbyStatus.textContent = "Joined! Waiting for players...";
  });
});

decBtn.addEventListener("click", () => {
  const cur = parseInt(targetCountSpan.textContent, 10);
  if (cur > 2) {
    targetCountSpan.textContent = cur - 1;
    socket.emit("setTarget", { targetCount: cur - 1 });
  }
});

incBtn.addEventListener("click", () => {
  const cur = parseInt(targetCountSpan.textContent, 10);
  if (cur < 8) {
    targetCountSpan.textContent = cur + 1;
    socket.emit("setTarget", { targetCount: cur + 1 });
  }
});

startBtn.addEventListener("click", () => {
  socket.emit("start");
});

playAgainBtn.addEventListener("click", () => {
  socket.emit("restart");
});

socket.on("state", (state) => {
  currentState = state;

  if (state.phase === "lobby") {
    lobbyEl.classList.remove("hidden");
    winnerEl.classList.add("hidden");
    itLabel.classList.add("hidden");
    itBarOuter.classList.add("hidden");

    const isHost = selfId === state.hostId;
    hostControls.classList.toggle("hidden", !isHost);
    targetCountSpan.textContent = state.targetCount;
    lobbyStatus.textContent = `Players: ${state.playerCount} / ${state.targetCount}`;
    lobbyHint.textContent = state.playerCount < 2
      ? "Need at least 2 players to start."
      : state.playerCount < state.targetCount
        ? "Waiting for more players..."
        : "Starting game...";

    playerList.innerHTML = "";
    for (const p of state.players) {
      const li = document.createElement("li");
      li.textContent = p.name + (p.id === state.hostId ? " (host)" : "");
      playerList.appendChild(li);
    }
  }

  if (state.phase === "playing") {
    lobbyEl.classList.add("hidden");
    winnerEl.classList.add("hidden");
    itLabel.classList.remove("hidden");
    itBarOuter.classList.remove("hidden");

    if (state.lastTaggedPlayerId && state.lastTaggedPlayerId !== lastTaggedId) {
      tagFlashTimer = 15;
      lastTaggedId = state.lastTaggedPlayerId;
    }

    const itPlayer = state.players.find((p) => p.id === state.itPlayerId);
    if (itPlayer) {
      const elapsed = state.itElapsed;
      const pct = Math.min(100, (elapsed / IT_ELIMINATE_TIME) * 100);
      itBarInner.style.width = pct + "%";

      if (pct < 50) itBarInner.style.background = "#5ce87b";
      else if (pct < 80) itBarInner.style.background = "#f0c040";
      else itBarInner.style.background = "#e85c5c";

      const isMe = state.itPlayerId === selfId;
      itLabel.textContent = isMe
        ? `YOU ARE IT! (${elapsed.toFixed(1)}s)`
        : `IT: ${itPlayer.name} (${elapsed.toFixed(1)}s)`;
      itLabel.style.color = isMe ? "#e85c5c" : "#eee";
    }
  }

  if (state.phase === "finished") {
    lobbyEl.classList.add("hidden");
    winnerEl.classList.remove("hidden");
    itLabel.classList.add("hidden");
    itBarOuter.classList.add("hidden");
    winnerNameEl.textContent = state.winnerName;
  }
});

setInterval(() => {
  if (!selfId || !currentState || currentState.phase !== "playing") return;
  const dir = { x: 0, y: 0 };
  if (keys.has("KeyW") || keys.has("ArrowUp")) dir.y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) dir.y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) dir.x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) dir.x += 1;
  const len = Math.hypot(dir.x, dir.y);
  if (len > 0) { dir.x /= len; dir.y /= len; }
  socket.emit("input", { seq: ++seq, dir });
}, 1000 / SEND_RATE);

function render() {
  const W = 1600;
  const H = 1200;
  const scale = Math.min(canvas.width / W, canvas.height / H);
  const ox = (canvas.width - W * scale) / 2;
  const oy = (canvas.height - H * scale) / 2;

  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#1a1d24";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#3a3f4b";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, W, H);

  for (let x = 0; x < W; x += 80) {
    ctx.strokeStyle = "#22252b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 80) {
    ctx.strokeStyle = "#22252b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const state = currentState;
  if (!state) { ctx.restore(); requestAnimationFrame(render); return; }

  const players = state.players || [];
  for (const p of players) {
    if (!p.pos) continue;

    if (p.eliminated) {
      ctx.globalAlpha = 0.25;
    }

    const isIt = state.phase === "playing" && p.id === state.itPlayerId;

    if (isIt) {
      const pulse = 14 + Math.sin(performance.now() / 150) * 3;
      ctx.fillStyle = "#e85c5c";
      ctx.shadowColor = "#e85c5c";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      const grd = ctx.createRadialGradient(p.pos.x, p.pos.y, 14, p.pos.x, p.pos.y, 30);
      grd.addColorStop(0, "rgba(232,92,92,0.3)");
      grd.addColorStop(1, "rgba(232,92,92,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 30, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.id === selfId ? "#5ce87b" : "#5ab0f0";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#eee";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.name, p.pos.x, p.pos.y - 22);

    if (p.graceTicks > 0 && !p.eliminated) {
      ctx.fillStyle = "#f0c040";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("✦ protected", p.pos.x, p.pos.y + 26);
    }

    if (tagFlashTimer > 0 && p.id === state.lastTaggedPlayerId) {
      const alpha = Math.min(1, tagFlashTimer / 10);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "center";
      ctx.fillText("TAG!", p.pos.x, p.pos.y - 40);
    }

    ctx.globalAlpha = 1;
  }

  if (tagFlashTimer > 0) tagFlashTimer--;

  ctx.restore();
  requestAnimationFrame(render);
}
render();
