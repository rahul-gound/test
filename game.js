/* ===================================================================
   ONE TAP ESCAPE 3D — game.js
   A production-ready endless runner built with BabylonJS (CDN).
   Organised into clear sections for maintainability.
   =================================================================== */

"use strict";

/* ------------------------------------------------------------------
   1. CONSTANTS
   ------------------------------------------------------------------ */
const TRACK_WIDTH       = 4;
const TRACK_DEPTH       = 12;
const SEGMENT_POOL_SIZE = 20;
const OBSTACLE_POOL     = 30;
const VISIBLE_SEGMENTS  = 12;

const GRAVITY           = -28;
const JUMP_IMPULSE      = 12;
const PLAYER_SIZE       = 0.8;
const PLAYER_START_Y    = PLAYER_SIZE / 2;

const BASE_SPEED        = 10;
const MAX_SPEED         = 28;
const SPEED_INCREMENT   = 0.0008;
const MIN_GAP           = 1.6;

const CAM_OFFSET = new BABYLON.Vector3(0, 4.5, -8);
const CAM_LERP   = 0.06;

const ALLOW_DOUBLE_JUMP = false;

/* ------------------------------------------------------------------
   2. ENGINE SETUP
   ------------------------------------------------------------------ */
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: false,
  disableWebGL2Support: false,
  doNotHandleContextLost: true,
  audioEngine: false
});
engine.setHardwareScalingLevel(1 / window.devicePixelRatio);

/* ------------------------------------------------------------------
   3. SCENE CREATION
   ------------------------------------------------------------------ */
let scene;
let hemiLight, dirLight;

function createScene() {
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.06, 1);
  scene.ambientColor = new BABYLON.Color3(0.08, 0.08, 0.12);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.025;
  scene.fogColor = new BABYLON.Color3(0.02, 0.02, 0.06);
  scene.collisionsEnabled = false;
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;

  hemiLight = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.5;
  hemiLight.diffuse = new BABYLON.Color3(0.6, 0.65, 0.8);

  dirLight = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.4, -1, 0.6), scene);
  dirLight.intensity = 0.4;
  dirLight.diffuse = new BABYLON.Color3(0.4, 0.5, 0.7);

  return scene;
}

/* ------------------------------------------------------------------
   4. REUSABLE MATERIALS
   ------------------------------------------------------------------ */
let matTrack, matPlayer, matObstacle, matGlow;

function createMaterials() {
  matTrack = new BABYLON.StandardMaterial("matTrack", scene);
  matTrack.diffuseColor  = new BABYLON.Color3(0.12, 0.12, 0.18);
  matTrack.emissiveColor = new BABYLON.Color3(0.03, 0.04, 0.08);
  matTrack.specularColor = BABYLON.Color3.Black();
  matTrack.freeze();

  matPlayer = new BABYLON.StandardMaterial("matPlayer", scene);
  matPlayer.diffuseColor  = new BABYLON.Color3(0.0, 0.75, 1.0);
  matPlayer.emissiveColor = new BABYLON.Color3(0.0, 0.2, 0.35);
  matPlayer.specularColor = BABYLON.Color3.Black();
  matPlayer.freeze();

  matObstacle = new BABYLON.StandardMaterial("matObstacle", scene);
  matObstacle.diffuseColor  = new BABYLON.Color3(1.0, 0.2, 0.2);
  matObstacle.emissiveColor = new BABYLON.Color3(0.3, 0.05, 0.05);
  matObstacle.specularColor = BABYLON.Color3.Black();
  matObstacle.freeze();

  matGlow = new BABYLON.StandardMaterial("matGlow", scene);
  matGlow.diffuseColor  = new BABYLON.Color3(0.0, 1.0, 0.6);
  matGlow.emissiveColor = new BABYLON.Color3(0.0, 0.3, 0.15);
  matGlow.specularColor = BABYLON.Color3.Black();
  matGlow.freeze();
}

/* ------------------------------------------------------------------
   5. PLAYER CLASS
   ------------------------------------------------------------------ */
const player = {
  mesh: null,
  velocityY: 0,
  isGrounded: false,
  jumpCount: 0,
  alive: true,
  zPos: 0
};

function createPlayer() {
  player.mesh = BABYLON.MeshBuilder.CreateBox("player", {
    width: PLAYER_SIZE, height: PLAYER_SIZE, depth: PLAYER_SIZE
  }, scene);
  player.mesh.material = matPlayer;
  player.mesh.position.set(0, PLAYER_START_Y, 0);
  player.velocityY = 0;
  player.isGrounded = false;
  player.jumpCount = 0;
  player.alive = true;
  player.zPos = 0;
}

function resetPlayer() {
  player.mesh.position.set(0, PLAYER_START_Y, 0);
  player.velocityY = 0;
  player.isGrounded = false;
  player.jumpCount = 0;
  player.alive = true;
  player.zPos = 0;
}

function playerJump() {
  if (!player.alive) return;
  const maxJumps = ALLOW_DOUBLE_JUMP ? 2 : 1;
  if (player.jumpCount < maxJumps) {
    player.velocityY = JUMP_IMPULSE;
    player.isGrounded = false;
    player.jumpCount++;
    AudioManager.playJump();
  }
}

/* ------------------------------------------------------------------
   6. CAMERA CONTROLLER
   ------------------------------------------------------------------ */
let cam;
const _camTarget = new BABYLON.Vector3();

function createCamera() {
  cam = new BABYLON.FreeCamera("cam", BABYLON.Vector3.Zero(), scene);
  cam.minZ = 0.5;
  cam.maxZ = 120;
  cam.fov = 0.9;
  updateCameraImmediate();
}

function updateCameraImmediate() {
  cam.position.copyFrom(player.mesh.position).addInPlace(CAM_OFFSET);
  _camTarget.copyFrom(player.mesh.position);
  _camTarget.y += 1;
  cam.setTarget(_camTarget);
}

function updateCamera() {
  const target = player.mesh.position;
  cam.position.x += (target.x + CAM_OFFSET.x - cam.position.x) * CAM_LERP;
  cam.position.y += (target.y + CAM_OFFSET.y - cam.position.y) * CAM_LERP;
  cam.position.z += (target.z + CAM_OFFSET.z - cam.position.z) * CAM_LERP;
  _camTarget.copyFrom(target);
  _camTarget.y += 1;
  cam.setTarget(_camTarget);
}

/* ------------------------------------------------------------------
   7. TRACK MANAGER (object pooling)
   ------------------------------------------------------------------ */
const TrackManager = (() => {
  const pool = [];
  let nextZ = 0;
  const activeSegments = [];

  function init() {
    for (let i = 0; i < SEGMENT_POOL_SIZE; i++) {
      const m = BABYLON.MeshBuilder.CreateBox("seg" + i, {
        width: TRACK_WIDTH, height: 0.4, depth: TRACK_DEPTH
      }, scene);
      m.material = matTrack;
      m.isVisible = false;
      m.freezeWorldMatrix();
      pool.push(m);
    }
    nextZ = -TRACK_DEPTH;
    activeSegments.length = 0;
  }

  function getSegment() {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].isVisible) return pool[i];
    }
    return null;
  }

  function spawnAhead(playerZ) {
    const horizon = playerZ + VISIBLE_SEGMENTS * TRACK_DEPTH;
    while (nextZ < horizon) {
      const seg = getSegment();
      if (!seg) break;
      seg.position.set(0, -0.2, nextZ + TRACK_DEPTH / 2);
      seg.isVisible = true;
      seg.unfreezeWorldMatrix();
      seg.computeWorldMatrix(true);
      seg.freezeWorldMatrix();
      activeSegments.push({ mesh: seg, z: nextZ });
      nextZ += TRACK_DEPTH;
    }
  }

  function recycle(playerZ) {
    const behind = playerZ - TRACK_DEPTH * 2;
    while (activeSegments.length > 0 && activeSegments[0].z + TRACK_DEPTH < behind) {
      const s = activeSegments.shift();
      s.mesh.isVisible = false;
    }
  }

  function reset() {
    for (let i = 0; i < pool.length; i++) pool[i].isVisible = false;
    activeSegments.length = 0;
    nextZ = -TRACK_DEPTH;
  }

  function getActiveSegments() { return activeSegments; }

  return { init, spawnAhead, recycle, reset, getActiveSegments };
})();

/* ------------------------------------------------------------------
   8. OBSTACLE MANAGER (object pooling)
   ------------------------------------------------------------------ */
const ObstacleManager = (() => {
  const pool = [];
  const active = [];
  let lastSpawnZ = 0;
  let spawnGap = 14;
  let _tmpMin = new BABYLON.Vector3();
  let _tmpMax = new BABYLON.Vector3();

  // Obstacle types: 0=hurdle, 1=gap(handled by track), 2=moving side block, 3=rotating bar
  function init() {
    for (let i = 0; i < OBSTACLE_POOL; i++) {
      const m = BABYLON.MeshBuilder.CreateBox("obs" + i, {
        width: 1, height: 1, depth: 1
      }, scene);
      m.material = matObstacle;
      m.isVisible = false;
      m.metadata = { type: 0, baseX: 0, speed: 0, time: 0, rotAxis: 0 };
      pool.push(m);
    }
    lastSpawnZ = 20;
    spawnGap = 14;
    active.length = 0;
  }

  function getFree() {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].isVisible) return pool[i];
    }
    return null;
  }

  function spawnAhead(playerZ, difficulty) {
    const horizon = playerZ + VISIBLE_SEGMENTS * TRACK_DEPTH;
    while (lastSpawnZ < horizon) {
      lastSpawnZ += spawnGap;
      const obs = getFree();
      if (!obs) break;

      const typeRoll = Math.random();
      let type;
      if (typeRoll < 0.4) type = 0;       // hurdle
      else if (typeRoll < 0.65) type = 2;  // moving side block
      else if (typeRoll < 0.85) type = 3;  // rotating bar
      else type = 0;                       // default hurdle

      obs.metadata.type = type;
      obs.metadata.time = 0;
      obs.isVisible = true;

      switch (type) {
        case 0: // static hurdle
          obs.scaling.set(TRACK_WIDTH * 0.9, 1.2, 0.5);
          obs.position.set(0, 0.6, lastSpawnZ);
          obs.rotation.set(0, 0, 0);
          obs.metadata.baseX = 0;
          obs.metadata.speed = 0;
          break;
        case 2: // moving side block
          obs.scaling.set(1.2, 1.5, 1.2);
          obs.metadata.baseX = 0;
          obs.metadata.speed = 2 + Math.random() * 2;
          obs.position.set(0, 0.75, lastSpawnZ);
          obs.rotation.set(0, 0, 0);
          break;
        case 3: // rotating bar
          obs.scaling.set(TRACK_WIDTH * 0.8, 0.35, 0.35);
          obs.position.set(0, 1.0, lastSpawnZ);
          obs.rotation.set(0, 0, 0);
          obs.metadata.baseX = 0;
          obs.metadata.speed = 1.5 + Math.random() * 1.5;
          break;
      }

      obs.computeWorldMatrix(true);
      active.push(obs);

      // Tighten spacing with difficulty
      spawnGap = Math.max(MIN_GAP * TRACK_DEPTH, 14 - difficulty * 0.3);
    }
  }

  function updateObstacles(dt) {
    for (let i = 0; i < active.length; i++) {
      const o = active[i];
      if (!o.isVisible) continue;
      const md = o.metadata;
      md.time += dt;

      switch (md.type) {
        case 2: // side-to-side
          o.position.x = Math.sin(md.time * md.speed) * (TRACK_WIDTH * 0.35);
          break;
        case 3: // rotating bar
          o.rotation.z = md.time * md.speed;
          break;
      }
    }
  }

  function checkCollision(pPos) {
    const halfP = PLAYER_SIZE * 0.4; // slightly forgiving
    for (let i = 0; i < active.length; i++) {
      const o = active[i];
      if (!o.isVisible) continue;

      const s = o.scaling;
      const hw = s.x * 0.5;
      const hh = s.y * 0.5;
      const hd = s.z * 0.5;

      _tmpMin.set(o.position.x - hw, o.position.y - hh, o.position.z - hd);
      _tmpMax.set(o.position.x + hw, o.position.y + hh, o.position.z + hd);

      if (
        pPos.x + halfP > _tmpMin.x && pPos.x - halfP < _tmpMax.x &&
        pPos.y + halfP > _tmpMin.y && pPos.y - halfP < _tmpMax.y &&
        pPos.z + halfP > _tmpMin.z && pPos.z - halfP < _tmpMax.z
      ) {
        return true;
      }
    }
    return false;
  }

  function recycle(playerZ) {
    const behind = playerZ - TRACK_DEPTH * 2;
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].position.z < behind) {
        active[i].isVisible = false;
        active.splice(i, 1);
      }
    }
  }

  function reset() {
    for (let i = 0; i < pool.length; i++) pool[i].isVisible = false;
    active.length = 0;
    lastSpawnZ = 20;
    spawnGap = 14;
  }

  return { init, spawnAhead, updateObstacles, checkCollision, recycle, reset };
})();

/* ------------------------------------------------------------------
   9. INPUT HANDLER
   ------------------------------------------------------------------ */
const Input = (() => {
  let jumpPressed = false;

  function init() {
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onPointer);

    const jumpBtn = document.getElementById("jumpBtn");
    if (jumpBtn) {
      jumpBtn.addEventListener("touchstart", (e) => { e.preventDefault(); onJumpAction(); }, { passive: false });
      jumpBtn.addEventListener("mousedown", (e) => { e.preventDefault(); onJumpAction(); });
    }
  }

  function onKey(e) {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      onJumpAction();
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      GameState.togglePause();
    }
  }

  function onPointer(e) {
    // Ignore if the click is on a UI button
    if (e.target.tagName === "BUTTON") return;
    onJumpAction();
  }

  function onJumpAction() {
    if (GameState.state === "playing") {
      playerJump();
    }
  }

  return { init };
})();

/* ------------------------------------------------------------------
   10. UI MANAGER
   ------------------------------------------------------------------ */
const UI = (() => {
  const els = {};

  function init() {
    els.hud          = document.getElementById("hud");
    els.score        = document.getElementById("score");
    els.pauseBtn     = document.getElementById("pauseBtn");
    els.soundBtn     = document.getElementById("soundBtn");
    els.jumpBtn      = document.getElementById("jumpBtn");
    els.startScreen  = document.getElementById("startScreen");
    els.startBest    = document.getElementById("startBest");
    els.pauseScreen  = document.getElementById("pauseScreen");
    els.resumeBtn    = document.getElementById("resumeBtn");
    els.gameOver     = document.getElementById("gameOverScreen");
    els.finalScore   = document.getElementById("finalScore");
    els.bestScore    = document.getElementById("bestScore");
    els.playBtn      = document.getElementById("playBtn");
    els.restartBtn   = document.getElementById("restartBtn");

    els.playBtn.addEventListener("click",    () => GameState.startGame());
    els.restartBtn.addEventListener("click",  () => GameState.startGame());
    els.resumeBtn.addEventListener("click",   () => GameState.togglePause());
    els.pauseBtn.addEventListener("click",    () => GameState.togglePause());
    els.soundBtn.addEventListener("click",    () => AudioManager.toggle());

    detectMobile();
  }

  function detectMobile() {
    const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isMobile && els.jumpBtn) els.jumpBtn.classList.remove("hidden");
  }

  function showScreen(name) {
    els.startScreen.classList.add("hidden");
    els.pauseScreen.classList.add("hidden");
    els.gameOver.classList.add("hidden");
    els.hud.classList.add("hidden");
    if (els.jumpBtn) els.jumpBtn.classList.add("hidden");

    switch (name) {
      case "start":
        els.startBest.textContent = "Best: " + GameState.bestScore;
        els.startScreen.classList.remove("hidden");
        break;
      case "playing":
        els.hud.classList.remove("hidden");
        detectMobile();
        break;
      case "paused":
        els.hud.classList.remove("hidden");
        els.pauseScreen.classList.remove("hidden");
        break;
      case "gameover":
        els.finalScore.textContent = "Score: " + GameState.currentScore;
        els.bestScore.textContent  = "Best: " + GameState.bestScore;
        els.gameOver.classList.remove("hidden");
        break;
    }
  }

  function updateScore(val) {
    els.score.textContent = "Score: " + val;
  }

  function updateSoundIcon(on) {
    els.soundBtn.innerHTML = on ? "&#128264;" : "&#128263;";
  }

  return { init, showScreen, updateScore, updateSoundIcon };
})();

/* ------------------------------------------------------------------
   11. AUDIO MANAGER (Web Audio API)
   ------------------------------------------------------------------ */
const AudioManager = (() => {
  let ctx = null;
  let enabled = true;
  let initialized = false;

  function ensureCtx() {
    if (!initialized) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        initialized = true;
      } catch (_) {
        enabled = false;
      }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  function playTone(freq, dur, type, vol) {
    if (!enabled || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function playJump() {
    ensureCtx();
    playTone(520, 0.12, "square", 0.10);
  }

  function playGameOver() {
    ensureCtx();
    playTone(180, 0.35, "sawtooth", 0.14);
    if (ctx) {
      setTimeout(() => playTone(120, 0.4, "sawtooth", 0.10), 200);
    }
  }

  function toggle() {
    enabled = !enabled;
    UI.updateSoundIcon(enabled);
  }

  function isEnabled() { return enabled; }

  return { playJump, playGameOver, toggle, isEnabled, ensureCtx };
})();

/* ------------------------------------------------------------------
   12. GAME STATE MANAGER
   ------------------------------------------------------------------ */
const GameState = (() => {
  let state = "start"; // start | playing | paused | gameover
  let currentScore = 0;
  let bestScore = parseInt(localStorage.getItem("oteBest") || "0", 10);
  let speed = BASE_SPEED;
  let difficulty = 0;

  function startGame() {
    AudioManager.ensureCtx();
    resetAll();
    state = "playing";
    UI.showScreen("playing");
  }

  function resetAll() {
    currentScore = 0;
    speed = BASE_SPEED;
    difficulty = 0;
    TrackManager.reset();
    ObstacleManager.reset();
    resetPlayer();
    TrackManager.spawnAhead(0);
    updateCameraImmediate();
  }

  function gameOver() {
    if (state !== "playing") return;
    state = "gameover";
    player.alive = false;
    AudioManager.playGameOver();
    if (currentScore > bestScore) {
      bestScore = currentScore;
      localStorage.setItem("oteBest", String(bestScore));
    }
    UI.showScreen("gameover");
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      UI.showScreen("paused");
    } else if (state === "paused") {
      state = "playing";
      UI.showScreen("playing");
    }
  }

  return {
    get state()        { return state; },
    get currentScore() { return currentScore; },
    set currentScore(v){ currentScore = v; },
    get bestScore()    { return bestScore; },
    get speed()        { return speed; },
    set speed(v)       { speed = v; },
    get difficulty()   { return difficulty; },
    set difficulty(v)  { difficulty = v; },
    startGame,
    gameOver,
    togglePause
  };
})();

/* ------------------------------------------------------------------
   13. GROUND DETECTION (simple AABB against track segments)
   ------------------------------------------------------------------ */
function checkGrounded(pPos) {
  const segs = TrackManager.getActiveSegments();
  const halfW = TRACK_WIDTH / 2;
  for (let i = 0; i < segs.length; i++) {
    const sz = segs[i].z;
    const segTop = 0; // top surface of track at y≈0
    if (
      pPos.z > sz && pPos.z < sz + TRACK_DEPTH &&
      pPos.x > -halfW && pPos.x < halfW &&
      pPos.y - PLAYER_SIZE / 2 <= segTop + 0.1 &&
      pPos.y - PLAYER_SIZE / 2 >= segTop - 0.5
    ) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------
   14. MAIN UPDATE LOOP
   ------------------------------------------------------------------ */
let lastTime = 0;

function update() {
  if (GameState.state !== "playing") return;

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  if (dt > 0.1) dt = 0.016; // clamp large spikes
  lastTime = now;

  const spd = GameState.speed;

  // Move player forward
  player.zPos += spd * dt;
  player.mesh.position.z = player.zPos;

  // Gravity
  player.velocityY += GRAVITY * dt;
  player.mesh.position.y += player.velocityY * dt;

  // Ground detection
  const pos = player.mesh.position;
  if (checkGrounded(pos)) {
    if (player.velocityY <= 0) {
      player.mesh.position.y = PLAYER_START_Y;
      player.velocityY = 0;
      player.isGrounded = true;
      player.jumpCount = 0;
    }
  } else {
    player.isGrounded = false;
  }

  // Fell off
  if (pos.y < -8) {
    GameState.gameOver();
    return;
  }

  // Obstacle collision
  if (ObstacleManager.checkCollision(pos)) {
    GameState.gameOver();
    return;
  }

  // Spawn / recycle
  TrackManager.spawnAhead(player.zPos);
  TrackManager.recycle(player.zPos);
  ObstacleManager.spawnAhead(player.zPos, GameState.difficulty);
  ObstacleManager.updateObstacles(dt);
  ObstacleManager.recycle(player.zPos);

  // Increase difficulty
  GameState.speed = Math.min(MAX_SPEED, spd + SPEED_INCREMENT);
  GameState.difficulty += dt * 0.05;

  // Score
  GameState.currentScore = Math.floor(player.zPos);
  UI.updateScore(GameState.currentScore);

  // Camera
  updateCamera();
}

/* ------------------------------------------------------------------
   15. INITIALISATION & RENDER LOOP
   ------------------------------------------------------------------ */
function boot() {
  createScene();
  createMaterials();
  createPlayer();
  createCamera();
  TrackManager.init();
  ObstacleManager.init();
  Input.init();
  UI.init();
  UI.showScreen("start");

  engine.runRenderLoop(() => {
    if (GameState.state === "playing") {
      if (lastTime === 0) lastTime = performance.now();
      update();
    }
    scene.render();
  });

  window.addEventListener("resize", () => engine.resize());
}

boot();
