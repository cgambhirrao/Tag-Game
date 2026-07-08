const IT_ELIMINATE_TIME = 120;
const SEND_RATE = 20;
const TELEPORT_RANGE = 200;
const TRAP_RADIUS = 60;
const SKIN_DATA = [
  { id: "default", name: "Default", color: "#5ce87b", unlockTags: 0 },
  { id: "blue", name: "Ocean", color: "#5ab0f0", unlockTags: 5 },
  { id: "red", name: "Crimson", color: "#e85c5c", unlockTags: 10 },
  { id: "gold", name: "Gold", color: "#f0c040", unlockTags: 20 },
  { id: "purple", name: "Violet", color: "#b07cf0", unlockTags: 35 },
  { id: "cyan", name: "Cyan", color: "#5cf0e8", unlockTags: 50 },
  { id: "orange", name: "Blaze", color: "#f0924c", unlockTags: 75 },
  { id: "pink", name: "Neon", color: "#f05ca8", unlockTags: 100 },
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
canvas.width = innerWidth;
canvas.height = innerHeight;
addEventListener("resize", () => { canvas.width = innerWidth; canvas.height = innerHeight; });

const roomScreen = document.getElementById("room-screen");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const roomCodeInput = document.getElementById("room-code-input");
const roomError = document.getElementById("room-error");
const lobbyEl = document.getElementById("lobby");
const lobbyStatus = document.getElementById("lobby-status");
const lobbyHint = document.getElementById("lobby-hint");
const playerList = document.getElementById("player-list");
const hostControls = document.getElementById("host-controls");
const targetCountSpan = document.getElementById("target-count");
const decBtn = document.getElementById("dec-btn");
const incBtn = document.getElementById("inc-btn");
const startBtn = document.getElementById("start-btn");
const roomCodeDisplay = document.getElementById("room-code");
const winnerEl = document.getElementById("winner");
const winnerNameEl = document.getElementById("winner-name");
const playAgainBtn = document.getElementById("play-again-btn");
const itLabel = document.getElementById("it-label");
const itBarOuter = document.getElementById("it-bar-outer");
const itBarInner = document.getElementById("it-bar-inner");
const abilityHud = document.getElementById("ability-hud");
const endStatsEl = document.getElementById("end-stats");
const statsPanel = document.getElementById("stats-panel");
const emoteHint = document.getElementById("emote-hint");
const spectatorLabel = document.getElementById("spectator-label");
const controlsPanel = document.getElementById("controls-panel");
const controlsToggle = document.getElementById("controls-toggle");
const skinGrid = document.getElementById("skin-grid");
const mapGrid = document.getElementById("map-grid");
const teamModeBtn = document.getElementById("team-mode-btn");
const addBotBtn = document.getElementById("add-bot-btn");
const removeBotBtn = document.getElementById("remove-bot-btn");
const botCountSpan = document.getElementById("bot-count");

let socket = null;
let selfId = null;
let roomCode = null;
let seq = 0;
let keys = new Set();
let currentState = null;
let tagFlashTimer = 0;
let lastTaggedId = "";
let sprintPressed = false;
let invisiblePressed = false;
let dashPressed = false;
let trapPressed = false;
let teleportMode = false;
let teleportTarget = null;
let selectedSkin = "default";
let selectedMap = 0;
let teamMode = false;
let totalTags = 0;
let lastLobbyMapIndex = -1;
let lastSkinRebuildTags = -1;
let controlsVisible = true;

const trailHistory = {};
const TRAIL_LENGTH = 8;
let lastSoundTime = {};

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  const now = Date.now();
  if (lastSoundTime[type] && now - lastSoundTime[type] < 100) return;
  lastSoundTime[type] = now;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;
    const t = ctx.currentTime;
    switch (type) {
      case "tag":
        osc.type = "square";
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
        break;
      case "eliminate":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.5);
        break;
      case "pickup":
        osc.type = "sine";
        osc.frequency.setValueAtTime(500, t);
        osc.frequency.exponentialRampToValueAtTime(1000, t + 0.05);
        osc.frequency.exponentialRampToValueAtTime(1500, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.15);
        break;
      case "dash":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
        break;
      case "danger":
        osc.type = "square";
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.setValueAtTime(600, t + 0.05);
        osc.frequency.setValueAtTime(800, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.15);
        break;
      case "emote":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t); osc.stop(t + 0.2);
        break;
      case "sprint":
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, t);
        gain.gain.value = 0.03;
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
        break;
    }
  } catch (_) {}
}

function getSkinColor(skinId) {
  const skin = SKIN_DATA.find((s) => s.id === skinId);
  return skin ? skin.color : SKIN_DATA[0].color;
}

function buildSkinGrid() {
  skinGrid.innerHTML = "";
  for (const skin of SKIN_DATA) {
    const btn = document.createElement("div");
    btn.className = "skin-btn" + (skin.id === selectedSkin ? " selected" : "");
    if (totalTags < skin.unlockTags) btn.classList.add("locked");
    btn.style.background = skin.color;
    btn.textContent = skin.name[0];
    btn.title = skin.name + (skin.unlockTags > 0 ? ` (${skin.unlockTags} tags)` : "");
    btn.addEventListener("click", () => {
      if (totalTags >= skin.unlockTags) {
        selectedSkin = skin.id;
        buildSkinGrid();
        if (socket) socket.emit("setSkin", skin.id);
      }
    });
    skinGrid.appendChild(btn);
  }
}

const MAP_NAMES = ["Classic", "Arena", "Fortress", "Chaos"];
function buildMapGrid() {
  mapGrid.innerHTML = "";
  for (let i = 0; i < MAP_NAMES.length; i++) {
    const btn = document.createElement("div");
    btn.className = "map-btn" + (i === selectedMap ? " selected" : "");
    btn.textContent = MAP_NAMES[i];
    btn.addEventListener("click", () => {
      selectedMap = i;
      buildMapGrid();
      socket.emit("setMap", i);
    });
    mapGrid.appendChild(btn);
  }
}

teamModeBtn.addEventListener("click", () => {
  teamMode = !teamMode;
  teamModeBtn.textContent = "Team Mode: " + (teamMode ? "ON" : "OFF");
  teamModeBtn.className = teamMode ? "btn btn-active" : "btn";
  socket.emit("setTeamMode", teamMode);
});

addBotBtn.addEventListener("click", () => {
  socket.emit("addBot");
});

removeBotBtn.addEventListener("click", () => {
  socket.emit("removeBot");
});

function connectSocket() {
  socket = io();
  seq = 0;
  selfId = null;
  currentState = null;

  socket.on("connect", () => {
    hud.textContent = "connected";
  });

  socket.on("state", (state) => {
    const prevPhase = currentState ? currentState.phase : null;
    currentState = state;

    if (state.phase === "lobby") {
      lobbyEl.classList.remove("hidden");
      winnerEl.classList.add("hidden");
      itLabel.classList.add("hidden");
      itBarOuter.classList.add("hidden");
      abilityHud.classList.add("hidden");
      statsPanel.classList.add("hidden");
      emoteHint.classList.add("hidden");
      spectatorLabel.classList.add("hidden");
      controlsPanel.classList.add("hidden");
      controlsToggle.classList.add("hidden");
      roomScreen.classList.add("hidden");

      selectedMap = state.mapIndex || 0;
      teamMode = state.teamMode || false;
      teamModeBtn.textContent = "Team Mode: " + (teamMode ? "ON" : "OFF");
      teamModeBtn.className = teamMode ? "btn btn-active" : "btn";
      if (lastLobbyMapIndex !== selectedMap) {
        lastLobbyMapIndex = selectedMap;
        buildMapGrid();
      }
      if (lastSkinRebuildTags !== totalTags) {
        lastSkinRebuildTags = totalTags;
        buildSkinGrid();
      }

      const isHost = selfId === state.hostId;
      hostControls.classList.toggle("hidden", !isHost);
      targetCountSpan.textContent = state.targetCount;
      const botCount = state.botCount || 0;
      botCountSpan.textContent = botCount;
      lobbyStatus.textContent = `Players: ${state.playerCount} / ${state.targetCount}`;
      const hasBots = botCount > 0;
      if (state.playerCount < 2 && !hasBots) {
        lobbyHint.textContent = "Add bots or wait for players to start.";
      } else if (state.playerCount < state.targetCount) {
        lobbyHint.textContent = hasBots ? "Waiting for more players or add more bots..." : "Waiting for more players...";
      } else {
        lobbyHint.textContent = "Starting game...";
      }
      playerList.innerHTML = "";
      for (const p of state.players) {
        const li = document.createElement("li");
        li.textContent = p.name + (p.id === state.hostId ? " (host)" : "");
        playerList.appendChild(li);
      }
    }

    if (state.phase === "playing") {
      roomScreen.classList.add("hidden");
      lobbyEl.classList.add("hidden");
      winnerEl.classList.add("hidden");
      itLabel.classList.remove("hidden");
      itBarOuter.classList.remove("hidden");
      abilityHud.classList.remove("hidden");
      statsPanel.classList.remove("hidden");
      emoteHint.classList.remove("hidden");
      controlsPanel.classList.toggle("hidden", !controlsVisible);
      controlsToggle.classList.toggle("hidden", controlsVisible);

      const me = state.players.find((p) => p.id === selfId);
      const isEliminated = me && me.eliminated;
      spectatorLabel.classList.toggle("hidden", !isEliminated);
      if (isEliminated) {
        itLabel.classList.add("hidden");
        itBarOuter.classList.add("hidden");
      }

      if (state.lastTaggedPlayerId && state.lastTaggedPlayerId !== lastTaggedId) {
        tagFlashTimer = 15;
        lastTaggedId = state.lastTaggedPlayerId;
        if (state.lastTaggedPlayerId === selfId) playSound("tag");
      }

      const itPlayer = state.players.find((p) => p.id === state.itPlayerId);
      if (itPlayer && !isEliminated) {
        const elapsed = state.itElapsed;
        const pct = Math.min(100, (elapsed / IT_ELIMINATE_TIME) * 100);
        itBarInner.style.width = pct + "%";
        if (pct < 50) itBarInner.style.background = "#5ce87b";
        else if (pct < 80) itBarInner.style.background = "#f0c040";
        else itBarInner.style.background = "#e85c5c";
        const isMe = state.itPlayerId === selfId;
        itLabel.textContent = isMe
          ? `YOU ARE IT! (${elapsed.toFixed(1)}s / ${IT_ELIMINATE_TIME}s)`
          : `IT: ${itPlayer.name} (${elapsed.toFixed(1)}s / ${IT_ELIMINATE_TIME}s)`;
        itLabel.style.color = isMe ? "#e85c5c" : "#eee";
        if (state.ticksLeft30 && isMe) playSound("danger");
      }

      if (me) {
        const parts = [];
        if (me.sprintActive) parts.push("SPRINT");
        if (me.invisibleActive) parts.push("INVISIBLE");
        if (me.shieldTimer > 0) parts.push("Shield " + me.shieldTimer + "s");
        if (me.frozen) parts.push("FROZEN");
        if (me.speedBoosted) parts.push("SPEED+");
        if (me.stamina !== undefined) {
          const spct = Math.max(0, Math.min(100, me.stamina));
          const color = spct > 50 ? "#5ce87b" : spct > 25 ? "#f0c040" : "#e85c5c";
          const filled = Math.floor(spct / 10);
          const bar = `<span style="color:${color}">${"█".repeat(filled)}${"░".repeat(10 - filled)}</span>`;
          parts.push(`STM ${bar}`);
        }
        abilityHud.innerHTML = parts.join("  |  ");

        if (me.tags > totalTags) totalTags = me.tags;
        buildSkinGrid();
      }

      let statsHtml = "";
      for (const p of state.players) {
        if (p.eliminated) continue;
        const isMe = p.id === selfId;
        statsHtml += `<div style="color:${isMe ? '#5ce87b' : '#aaa'}">${p.name}: ${p.tags} tags${p.streak > 1 ? ` (${p.streak}x)` : ""}</div>`;
      }
      statsPanel.innerHTML = statsHtml;

      if (me && me.eliminated) {
        const spectatorTarget = state.players.find((p) => !p.eliminated && p.id !== state.itPlayerId);
        if (spectatorTarget) {
          spectatorLabel.textContent = `SPECTATING: ${spectatorTarget.name}`;
        }
      }
    }

    if (state.phase === "finished") {
      roomScreen.classList.add("hidden");
      lobbyEl.classList.add("hidden");
      winnerEl.classList.remove("hidden");
      itLabel.classList.add("hidden");
      itBarOuter.classList.add("hidden");
      abilityHud.classList.add("hidden");
      statsPanel.classList.add("hidden");
      emoteHint.classList.add("hidden");
      spectatorLabel.classList.add("hidden");
      controlsPanel.classList.add("hidden");
      controlsToggle.classList.add("hidden");
      winnerNameEl.textContent = state.winnerName;

      if (state.stats) {
        let html = "<b>Stats:</b><br>";
        for (const s of state.stats) {
          const isMe = s.id === selfId;
          html += `<div style="color:${isMe ? '#5ce87b' : '#aaa'}">${s.name}: ${s.tags} tags</div>`;
        }
        endStatsEl.innerHTML = html;
      }

      if (prevPhase === "playing") playSound("eliminate");
    }
  });
}

createRoomBtn.addEventListener("click", () => {
  const name = prompt("Your name:") || "TagPlayer";
  socket.emit("createRoom", name, (reply) => {
    if (!reply.ok) { roomError.textContent = reply.reason; return; }
    selfId = reply.selfId;
    roomCode = reply.code;
    roomCodeDisplay.textContent = roomCode;
    roomError.textContent = "";
  });
});

joinRoomBtn.addEventListener("click", () => {
  const code = roomCodeInput.value.trim();
  if (code.length !== 4) { roomError.textContent = "Enter a 4-digit code"; return; }
  const name = prompt("Your name:") || "TagPlayer";
  socket.emit("joinRoom", { code, name, skinId: selectedSkin }, (reply) => {
    if (!reply.ok) { roomError.textContent = reply.reason; return; }
    selfId = reply.selfId;
    roomCode = code;
    roomCodeDisplay.textContent = code;
    roomError.textContent = "";
  });
});

roomCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoomBtn.click();
});

decBtn.addEventListener("click", () => {
  const cur = parseInt(targetCountSpan.textContent, 10);
  if (cur > 2) {
    targetCountSpan.textContent = cur - 1;
    socket.emit("setTarget", cur - 1);
  }
});

incBtn.addEventListener("click", () => {
  const cur = parseInt(targetCountSpan.textContent, 10);
  if (cur < 8) {
    targetCountSpan.textContent = cur + 1;
    socket.emit("setTarget", cur + 1);
  }
});

startBtn.addEventListener("click", () => socket.emit("start"));
playAgainBtn.addEventListener("click", () => socket.emit("restart"));

addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") sprintPressed = true;
  if (e.code === "Space") {
    e.preventDefault();
    invisiblePressed = true;
  }
  if (e.code === "KeyQ") dashPressed = true;
  if (e.code === "KeyE") trapPressed = true;
  if (e.code === "KeyR") {
    teleportMode = !teleportMode;
  }
  if (e.code === "Digit1") sendEmote("close");
  if (e.code === "Digit2") sendEmote("nice");
  if (e.code === "Digit3") sendEmote("help");
  if (e.code === "Digit4") sendEmote("gg");
  if (e.code === "KeyH") {
    controlsVisible = !controlsVisible;
    controlsPanel.classList.toggle("hidden", !controlsVisible);
    controlsToggle.classList.toggle("hidden", controlsVisible);
  }
});
addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") sprintPressed = false;
  if (e.code === "Space") invisiblePressed = false;
});

canvas.addEventListener("click", (e) => {
  if (!teleportMode || !selfId || !currentState || currentState.phase !== "playing") return;
  const me = currentState.players.find((p) => p.id === selfId);
  if (!me || me.eliminated) return;
  const W = 1600, H = 1200;
  const scale = Math.min(canvas.width / W, canvas.height / H);
  const ox = (canvas.width - W * scale) / 2;
  const oy = (canvas.height - H * scale) / 2;
  const worldX = (e.clientX - ox) / scale;
  const worldY = (e.clientY - oy) / scale;
  teleportTarget = { x: worldX, y: worldY };
  teleportMode = false;
});

canvas.addEventListener("dblclick", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.body.requestFullscreen();
});

controlsToggle.addEventListener("click", () => {
  controlsVisible = true;
  controlsPanel.classList.remove("hidden");
  controlsToggle.classList.add("hidden");
});

function sendEmote(type) {
  if (!selfId || !currentState || currentState.phase !== "playing") return;
  socket.emit("input", { seq: ++seq, dir: { x: 0, y: 0 }, sprint: false, invisible: false, emote: type });
  playSound("emote");
}

setInterval(() => {
  if (!selfId || !currentState || currentState.phase !== "playing") return;
  const dir = { x: 0, y: 0 };
  if (keys.has("KeyW") || keys.has("ArrowUp")) dir.y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) dir.y += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) dir.x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) dir.x += 1;
  const len = Math.hypot(dir.x, dir.y);
  if (len > 0) { dir.x /= len; dir.y /= len; }
  socket.emit("input", {
    seq: ++seq, dir, sprint: sprintPressed, invisible: invisiblePressed,
    dash: dashPressed, placeTrap: trapPressed,
    teleport: teleportTarget,
  });
  invisiblePressed = false;
  dashPressed = false;
  trapPressed = false;
  teleportTarget = null;
}, 1000 / SEND_RATE);

function render() {
  const state = currentState;
  const W = 1600;
  const H = 1200;
  const scale = Math.min(canvas.width / W, canvas.height / H);
  const ox = (canvas.width - W * scale) / 2;
  const oy = (canvas.height - H * scale) / 2;

  ctx.fillStyle = "#1a1d24";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  if (state && state.phase === "playing") {
    const b = state.worldBounds;
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a1d24";
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

    ctx.strokeStyle = "#e85c5c";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    ctx.setLineDash([]);

    for (const gw of (state.gravityWells || [])) {
      const alpha = Math.min(1, gw.ticksLeft / 40);
      for (let r = 3; r >= 0; r--) {
        const rad = gw.radius * (0.3 + r * 0.2);
        const angle = performance.now() / 500 + r;
        ctx.save();
        ctx.translate(gw.pos.x, gw.pos.y);
        ctx.rotate(angle);
        ctx.strokeStyle = `rgba(180,120,240,${alpha * (0.15 + r * 0.08)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = `rgba(180,120,240,${alpha * 0.08})`;
      ctx.beginPath();
      ctx.arc(gw.pos.x, gw.pos.y, gw.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const dz of (state.dangerZones || [])) {
      const alpha = Math.min(1, dz.ticksLeft / 30);
      const pulse = 1 + Math.sin(performance.now() / 100) * 0.1;
      ctx.fillStyle = `rgba(232,92,92,${alpha * 0.2 * pulse})`;
      ctx.beginPath();
      ctx.arc(dz.pos.x, dz.pos.y, dz.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(232,92,92,${alpha * 0.6})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(dz.pos.x, dz.pos.y, dz.radius * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(232,92,92,${alpha * 0.8})`;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DANGER", dz.pos.x, dz.pos.y + 4);
    }

    if (state.obstacles) {
      for (const o of state.obstacles) {
        ctx.fillStyle = "#3a3f4b";
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = "#555b68";
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      }
    }

    for (const mo of (state.movingObstacles || [])) {
      ctx.fillStyle = "#4a3a3a";
      ctx.fillRect(mo.x, mo.y, mo.w, mo.h);
      ctx.strokeStyle = "#8a5a5a";
      ctx.lineWidth = 2;
      ctx.strokeRect(mo.x, mo.y, mo.w, mo.h);
    }

    for (const trap of (state.traps || [])) {
      const alpha = Math.min(1, trap.ticksLeft / 20);
      ctx.fillStyle = `rgba(180,120,60,${alpha * 0.25})`;
      ctx.beginPath();
      ctx.arc(trap.pos.x, trap.pos.y, TRAP_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(180,120,60,${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(trap.pos.x, trap.pos.y, TRAP_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(180,120,60,${alpha * 0.7})`;
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("x", trap.pos.x, trap.pos.y + 5);
    }

    for (const s of state.shields) {
      const pulse = 10 + Math.sin(performance.now() / 200) * 3;
      ctx.fillStyle = "rgba(240,192,64,0.15)";
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0c040";
      ctx.shadowColor = "#f0c040";
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("S", s.pos.x, s.pos.y + 4);
    }

    for (const pu of (state.powerUps || [])) {
      const pulse = 10 + Math.sin(performance.now() / 180) * 3;
      const colors = { speed: "#5ce87b", freeze: "#5ab0f0", magnet: "#f0924c" };
      const labels = { speed: ">>", freeze: "*", magnet: "U" };
      const color = colors[pu.type] || "#fff";
      ctx.fillStyle = color + "30";
      ctx.beginPath();
      ctx.arc(pu.pos.x, pu.pos.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pu.pos.x, pu.pos.y, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(labels[pu.type], pu.pos.x, pu.pos.y + 4);
    }

    if (teleportMode && selfId) {
      const me = state.players.find((p) => p.id === selfId);
      if (me && !me.eliminated) {
        ctx.strokeStyle = "rgba(180,120,240,0.4)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(me.pos.x, me.pos.y, TELEPORT_RANGE, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(180,120,240,0.5)";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("CLICK TO TELEPORT", me.pos.x, me.pos.y - 50);
      }
    }
  }

  if (state) {
    const players = state.players || [];
    for (const p of players) {
      if (!p.pos) continue;

      if (p.eliminated) {
        ctx.globalAlpha = 0.2;
      } else if (p.invisibleActive && p.id !== selfId) {
        continue;
      }

      if (!trailHistory[p.id]) trailHistory[p.id] = [];
      if (!p.eliminated) {
        trailHistory[p.id].push({ x: p.pos.x, y: p.pos.y });
        if (trailHistory[p.id].length > TRAIL_LENGTH) trailHistory[p.id].shift();
      }

      if (p.sprintActive && !p.eliminated) {
        const trail = trailHistory[p.id] || [];
        const skinColor = getSkinColor(p.skinId);
        for (let i = 0; i < trail.length - 1; i++) {
          const alpha = (i / trail.length) * 0.3;
          const rad = 14 * (i / trail.length) * 0.6;
          ctx.fillStyle = skinColor + Math.floor(alpha * 255).toString(16).padStart(2, "0");
          ctx.beginPath();
          ctx.arc(trail[i].x, trail[i].y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const isIt = state.phase === "playing" && p.id === state.itPlayerId;

      if (p.frozen && !p.eliminated) {
        ctx.fillStyle = "rgba(90,176,240,0.15)";
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(90,176,240,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6;
          const r = 22;
          if (i === 0) ctx.moveTo(p.pos.x + Math.cos(a) * r, p.pos.y + Math.sin(a) * r);
          else ctx.lineTo(p.pos.x + Math.cos(a) * r, p.pos.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
      }

      const skinColor = getSkinColor(p.skinId);

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
        ctx.fillStyle = p.id === selfId ? "#5ce87b" : skinColor;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.speedBoosted && !p.eliminated) {
        ctx.strokeStyle = "#5ce87b";
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const angle = (performance.now() / 80 + i * Math.PI * 2 / 3) % (Math.PI * 2);
          ctx.beginPath();
          ctx.moveTo(p.pos.x + Math.cos(angle) * 16, p.pos.y + Math.sin(angle) * 16);
          ctx.lineTo(p.pos.x + Math.cos(angle) * 26, p.pos.y + Math.sin(angle) * 26);
          ctx.stroke();
        }
      }

      if (p.sprintActive && !p.eliminated) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const angle = (performance.now() / 100 + i * Math.PI / 2) % (Math.PI * 2);
          ctx.beginPath();
          ctx.moveTo(p.pos.x + Math.cos(angle) * 18, p.pos.y + Math.sin(angle) * 18);
          ctx.lineTo(p.pos.x + Math.cos(angle) * 28, p.pos.y + Math.sin(angle) * 28);
          ctx.stroke();
        }
      }

      if (p.trapped && !p.eliminated) {
        ctx.strokeStyle = "rgba(180,120,60,0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.fillStyle = "#eee";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText(p.name, p.pos.x, p.pos.y - 22);

      if (p.tags > 0) {
        ctx.fillStyle = "#f0c040";
        ctx.font = "10px monospace";
        ctx.fillText(`${p.tags} tags`, p.pos.x, p.pos.y - 36);
      }

      if (p.graceTicks > 0 && !p.eliminated) {
        ctx.fillStyle = "#f0c040";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("protected", p.pos.x, p.pos.y + 26);
      }

      if (p.shieldTimer > 0 && !p.eliminated) {
        ctx.fillStyle = "#f0c040";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Shield " + p.shieldTimer + "s", p.pos.x, p.pos.y + 40);
      }

      if (tagFlashTimer > 0 && p.id === state.lastTaggedPlayerId) {
        const alpha = Math.min(1, tagFlashTimer / 10);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = "bold 24px monospace";
        ctx.textAlign = "center";
        ctx.fillText("TAG!", p.pos.x, p.pos.y - 40);
      }

      for (const em of (state.emotes || [])) {
        if (em.playerId === p.id) {
          const alpha = Math.min(1, em.ticksLeft / 15);
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.font = "bold 14px monospace";
          ctx.textAlign = "center";
          ctx.fillText(em.text, p.pos.x, p.pos.y - 55);
        }
      }

      ctx.globalAlpha = 1;
    }
  }

  if (tagFlashTimer > 0) tagFlashTimer--;

  ctx.restore();
  requestAnimationFrame(render);
}

connectSocket();
buildMapGrid();
buildSkinGrid();
render();
