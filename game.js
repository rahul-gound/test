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

const BASE_FOV          = 0.9;
const MAX_FOV           = 1.05;

/* ------------------------------------------------------------------
   1b. GRAPHICS QUALITY SETTINGS
   ------------------------------------------------------------------ */
const QualitySettings = {
  low:    { bloom: false, shadows: false, particles: false, cameraBob: false, rimLight: true },
  medium: { bloom: false, shadows: false, particles: true,  cameraBob: true,  rimLight: true },
  high:   { bloom: true,  shadows: true,  particles: true,  cameraBob: true,  rimLight: true }
};
let currentQuality = "low";

function getQuality() {
  return QualitySettings[currentQuality];
}

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
let hemiLight, dirLight, rimLight;
let shadowGenerator = null;
let pipeline = null;

function createScene() {
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.06, 1);
  scene.ambientColor = new BABYLON.Color3(0.08, 0.08, 0.12);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.022;
  scene.fogColor = new BABYLON.Color3(0.02, 0.02, 0.06);
  scene.collisionsEnabled = false;
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;

  // Hemispheric light (ambient fill)
  hemiLight = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.55;
  hemiLight.diffuse = new BABYLON.Color3(0.55, 0.6, 0.8);
  hemiLight.groundColor = new BABYLON.Color3(0.05, 0.05, 0.12);

  // Key directional light
  dirLight = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-0.4, -1, 0.6), scene);
  dirLight.intensity = 0.5;
  dirLight.diffuse = new BABYLON.Color3(0.4, 0.5, 0.7);

  // Subtle rim / back light for depth
  rimLight = new BABYLON.DirectionalLight("rim", new BABYLON.Vector3(0.3, -0.3, -1), scene);
  rimLight.intensity = 0.2;
  rimLight.diffuse = new BABYLON.Color3(0.0, 0.6, 1.0);

  return scene;
}

/* ------------------------------------------------------------------
   3b. PROCEDURAL GRADIENT SKYBOX
   ------------------------------------------------------------------ */
function createSkyGradient() {
  // Tiny procedural sky using a vertical gradient plane far behind
  var skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.disableLighting = true;
  skyMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.06);
  skyMat.backFaceCulling = false;
  skyMat.freeze();

  var sky = BABYLON.MeshBuilder.CreatePlane("sky", { width: 200, height: 100 }, scene);
  sky.position.set(0, 25, 100);
  sky.material = skyMat;
  sky.isPickable = false;
  sky.freezeWorldMatrix();
}

/* ------------------------------------------------------------------
   3c. BLOOM / RENDERING PIPELINE
   ------------------------------------------------------------------ */
function createPipeline() {
  if (pipeline) {
    pipeline.dispose();
    pipeline = null;
  }
  var q = getQuality();
  if (!q.bloom) return;

  pipeline = new BABYLON.DefaultRenderingPipeline("defaultPipeline", true, scene, [cam]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.6;
  pipeline.bloomWeight = 0.15;
  pipeline.bloomKernel = 32;
  pipeline.bloomScale = 0.3;
}

/* ------------------------------------------------------------------
   3d. SHADOW SETUP (optional, OFF by default)
   ------------------------------------------------------------------ */
function createShadows() {
  disposeShadows();
  var q = getQuality();
  if (!q.shadows) return;

  shadowGenerator = new BABYLON.ShadowGenerator(512, dirLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 8;

  if (player.mesh) {
    shadowGenerator.addShadowCaster(player.mesh);
  }
}

function disposeShadows() {
  if (shadowGenerator) {
    shadowGenerator.dispose();
    shadowGenerator = null;
  }
}

/* ------------------------------------------------------------------
   4. REUSABLE MATERIALS  (PBR for key objects)
   ------------------------------------------------------------------ */
let matTrack, matPlayer, matObstacle, matGlow, matEdge, matRail;

function createMaterials() {
  // Track – dark metallic
  matTrack = new BABYLON.PBRMaterial("matTrack", scene);
  matTrack.albedoColor  = new BABYLON.Color3(0.08, 0.08, 0.14);
  matTrack.metallic     = 0.7;
  matTrack.roughness    = 0.6;
  matTrack.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.05);
  matTrack.freeze();

  // Player – neon cyan
  matPlayer = new BABYLON.PBRMaterial("matPlayer", scene);
  matPlayer.albedoColor  = new BABYLON.Color3(0.0, 0.7, 1.0);
  matPlayer.metallic     = 0.3;
  matPlayer.roughness    = 0.4;
  matPlayer.emissiveColor = new BABYLON.Color3(0.0, 0.25, 0.4);
  matPlayer.freeze();

  // Obstacle – neon red/orange
  matObstacle = new BABYLON.PBRMaterial("matObstacle", scene);
  matObstacle.albedoColor  = new BABYLON.Color3(1.0, 0.15, 0.1);
  matObstacle.metallic     = 0.2;
  matObstacle.roughness    = 0.5;
  matObstacle.emissiveColor = new BABYLON.Color3(0.4, 0.05, 0.02);
  matObstacle.freeze();

  // Glow – neon green accent
  matGlow = new BABYLON.PBRMaterial("matGlow", scene);
  matGlow.albedoColor  = new BABYLON.Color3(0.0, 1.0, 0.5);
  matGlow.metallic     = 0.1;
  matGlow.roughness    = 0.3;
  matGlow.emissiveColor = new BABYLON.Color3(0.0, 0.5, 0.2);
  matGlow.freeze();

  // Edge strips – bright emissive cyan for readability
  matEdge = new BABYLON.PBRMaterial("matEdge", scene);
  matEdge.albedoColor  = new BABYLON.Color3(0.0, 0.8, 1.0);
  matEdge.metallic     = 0.0;
  matEdge.roughness    = 0.9;
  matEdge.emissiveColor = new BABYLON.Color3(0.0, 0.35, 0.5);
  matEdge.freeze();

  // Rail material – subtle dark accent
  matRail = new BABYLON.PBRMaterial("matRail", scene);
  matRail.albedoColor  = new BABYLON.Color3(0.05, 0.05, 0.1);
  matRail.metallic     = 0.8;
  matRail.roughness    = 0.3;
  matRail.emissiveColor = new BABYLON.Color3(0.01, 0.01, 0.03);
  matRail.freeze();
}

/* ------------------------------------------------------------------
   5. PLAYER CLASS
   ------------------------------------------------------------------ */
const player = {
  mesh: null,
  bevelMeshes: [],
  velocityY: 0,
  isGrounded: false,
  jumpCount: 0,
  alive: true,
  zPos: 0,
  wasGrounded: false
};

function createPlayer() {
  player.mesh = BABYLON.MeshBuilder.CreateBox("player", {
    width: PLAYER_SIZE, height: PLAYER_SIZE, depth: PLAYER_SIZE
  }, scene);
  player.mesh.material = matPlayer;
  player.mesh.position.set(0, PLAYER_START_Y, 0);

  // Bevel illusion: thin bright edge strips on the player cube
  var edgeW = 0.04;
  var s = PLAYER_SIZE;
  var edges = [
    { w: s + edgeW, h: edgeW, d: edgeW, x: 0, y:  s / 2, z: 0 },
    { w: s + edgeW, h: edgeW, d: edgeW, x: 0, y: -s / 2, z: 0 },
    { w: edgeW, h: s, d: edgeW, x:  s / 2, y: 0, z: 0 },
    { w: edgeW, h: s, d: edgeW, x: -s / 2, y: 0, z: 0 }
  ];
  player.bevelMeshes = [];
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    var bm = BABYLON.MeshBuilder.CreateBox("pEdge" + i, { width: e.w, height: e.h, depth: e.d }, scene);
    bm.material = matEdge;
    bm.parent = player.mesh;
    bm.position.set(e.x, e.y, e.z);
    bm.isPickable = false;
    player.bevelMeshes.push(bm);
  }

  player.velocityY = 0;
  player.isGrounded = false;
  player.jumpCount = 0;
  player.alive = true;
  player.zPos = 0;
  player.wasGrounded = false;
}

function resetPlayer() {
  player.mesh.position.set(0, PLAYER_START_Y, 0);
  player.velocityY = 0;
  player.isGrounded = false;
  player.jumpCount = 0;
  player.alive = true;
  player.zPos = 0;
  player.wasGrounded = false;
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
let camBobTime = 0;

function createCamera() {
  cam = new BABYLON.FreeCamera("cam", BABYLON.Vector3.Zero(), scene);
  cam.minZ = 0.5;
  cam.maxZ = 120;
  cam.fov = BASE_FOV;
  updateCameraImmediate();
}

function updateCameraImmediate() {
  cam.position.copyFrom(player.mesh.position).addInPlace(CAM_OFFSET);
  _camTarget.copyFrom(player.mesh.position);
  _camTarget.y += 1;
  cam.setTarget(_camTarget);
  cam.fov = BASE_FOV;
  camBobTime = 0;
}

function updateCamera(dt, speed) {
  const target = player.mesh.position;
  cam.position.x += (target.x + CAM_OFFSET.x - cam.position.x) * CAM_LERP;
  cam.position.y += (target.y + CAM_OFFSET.y - cam.position.y) * CAM_LERP;
  cam.position.z += (target.z + CAM_OFFSET.z - cam.position.z) * CAM_LERP;

  // Subtle camera bob (only when grounded, medium+ quality)
  var q = getQuality();
  if (q.cameraBob && player.isGrounded) {
    camBobTime += dt * speed * 0.5;
    cam.position.y += Math.sin(camBobTime) * 0.012;
  }

  _camTarget.copyFrom(target);
  _camTarget.y += 1;
  cam.setTarget(_camTarget);

  // Dynamic FOV: increase slightly with speed
  var speedRatio = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
  var targetFov = BASE_FOV + (MAX_FOV - BASE_FOV) * speedRatio;
  cam.fov += (targetFov - cam.fov) * 0.02;
}

/* ------------------------------------------------------------------
   7. TRACK MANAGER (object pooling)
   ------------------------------------------------------------------ */
const TrackManager = (() => {
  const pool = [];
  const edgePool = [];   // left/right emissive edge strips
  const railPool = [];   // rail meshes for variation
  let nextZ = 0;
  const activeSegments = [];
  let segIndex = 0;

  function init() {
    for (let i = 0; i < SEGMENT_POOL_SIZE; i++) {
      const m = BABYLON.MeshBuilder.CreateBox("seg" + i, {
        width: TRACK_WIDTH, height: 0.4, depth: TRACK_DEPTH
      }, scene);
      m.material = matTrack;
      m.isVisible = false;
      m.freezeWorldMatrix();
      pool.push(m);

      // Emissive edge strips (left + right)
      var edgeH = 0.08;
      var edgeD = TRACK_DEPTH;
      var eL = BABYLON.MeshBuilder.CreateBox("edgeL" + i, { width: 0.08, height: edgeH, depth: edgeD }, scene);
      eL.material = matEdge;
      eL.isVisible = false;
      eL.isPickable = false;

      var eR = BABYLON.MeshBuilder.CreateBox("edgeR" + i, { width: 0.08, height: edgeH, depth: edgeD }, scene);
      eR.material = matEdge;
      eR.isVisible = false;
      eR.isPickable = false;

      edgePool.push({ left: eL, right: eR });

      // Rail variation mesh (every other segment)
      var rail = BABYLON.MeshBuilder.CreateBox("rail" + i, { width: 0.12, height: 0.15, depth: edgeD }, scene);
      rail.material = matRail;
      rail.isVisible = false;
      rail.isPickable = false;
      railPool.push(rail);
    }
    nextZ = -TRACK_DEPTH;
    activeSegments.length = 0;
    segIndex = 0;
  }

  function getSegment() {
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].isVisible) return i;
    }
    return -1;
  }

  function spawnAhead(playerZ) {
    const horizon = playerZ + VISIBLE_SEGMENTS * TRACK_DEPTH;
    while (nextZ < horizon) {
      const idx = getSegment();
      if (idx < 0) break;
      var seg = pool[idx];
      var centerZ = nextZ + TRACK_DEPTH / 2;
      seg.position.set(0, -0.2, centerZ);
      seg.isVisible = true;
      seg.unfreezeWorldMatrix();
      seg.computeWorldMatrix(true);
      seg.freezeWorldMatrix();

      // Edge strips
      var edges = edgePool[idx];
      var halfW = TRACK_WIDTH / 2;
      edges.left.position.set(-halfW, 0.02, centerZ);
      edges.left.isVisible = true;
      edges.right.position.set(halfW, 0.02, centerZ);
      edges.right.isVisible = true;

      // Rail variation on alternating segments
      var rail = railPool[idx];
      if (segIndex % 2 === 0) {
        rail.position.set(0, 0.05, centerZ);
        rail.isVisible = true;
      } else {
        rail.isVisible = false;
      }

      activeSegments.push({ mesh: seg, z: nextZ, idx: idx });
      nextZ += TRACK_DEPTH;
      segIndex++;
    }
  }

  function recycle(playerZ) {
    const behind = playerZ - TRACK_DEPTH * 2;
    while (activeSegments.length > 0 && activeSegments[0].z + TRACK_DEPTH < behind) {
      const s = activeSegments.shift();
      s.mesh.isVisible = false;
      edgePool[s.idx].left.isVisible = false;
      edgePool[s.idx].right.isVisible = false;
      railPool[s.idx].isVisible = false;
    }
  }

  function reset() {
    for (let i = 0; i < pool.length; i++) {
      pool[i].isVisible = false;
      edgePool[i].left.isVisible = false;
      edgePool[i].right.isVisible = false;
      railPool[i].isVisible = false;
    }
    activeSegments.length = 0;
    nextZ = -TRACK_DEPTH;
    segIndex = 0;
  }

  function getActiveSegments() { return activeSegments; }

  return { init, spawnAhead, recycle, reset, getActiveSegments };
})();

/* ------------------------------------------------------------------
   8. OBSTACLE MANAGER (object pooling)
   ------------------------------------------------------------------ */
const ObstacleManager = (() => {
  const pool = [];
  const edgeMeshes = [];  // emissive edge for each obstacle
  const active = [];
  let lastSpawnZ = 0;
  let spawnGap = 14;
  let _tmpMin = new BABYLON.Vector3();
  let _tmpMax = new BABYLON.Vector3();

  function init() {
    for (let i = 0; i < OBSTACLE_POOL; i++) {
      const m = BABYLON.MeshBuilder.CreateBox("obs" + i, {
        width: 1, height: 1, depth: 1
      }, scene);
      m.material = matObstacle;
      m.isVisible = false;
      m.metadata = { type: 0, baseX: 0, speed: 0, time: 0, rotAxis: 0 };
      pool.push(m);

      // Thin emissive accent strip on top of each obstacle
      var accent = BABYLON.MeshBuilder.CreateBox("obsEdge" + i, { width: 1, height: 0.05, depth: 1 }, scene);
      accent.material = matGlow;
      accent.parent = m;
      accent.position.set(0, 0.52, 0);
      accent.isPickable = false;
      edgeMeshes.push(accent);
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
   8b. PARTICLE EFFECTS (landing dust & speed streaks)
   ------------------------------------------------------------------ */
const ParticleEffects = (() => {
  let dustSystem = null;
  let streakSystem = null;

  function init() {
    // Landing dust puff
    dustSystem = new BABYLON.ParticleSystem("dust", 30, scene);
    dustSystem.createPointEmitter(new BABYLON.Vector3(-0.3, 0, -0.3), new BABYLON.Vector3(0.3, 0.3, 0.3));
    dustSystem.color1 = new BABYLON.Color4(0.6, 0.6, 0.7, 0.5);
    dustSystem.color2 = new BABYLON.Color4(0.3, 0.3, 0.4, 0.3);
    dustSystem.colorDead = new BABYLON.Color4(0.1, 0.1, 0.15, 0);
    dustSystem.minSize = 0.05;
    dustSystem.maxSize = 0.2;
    dustSystem.minLifeTime = 0.15;
    dustSystem.maxLifeTime = 0.35;
    dustSystem.emitRate = 0;
    dustSystem.gravity = new BABYLON.Vector3(0, -2, 0);
    dustSystem.manualEmitCount = 0;
    dustSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    dustSystem.start();

    // Speed streaks (very few particles)
    streakSystem = new BABYLON.ParticleSystem("streaks", 15, scene);
    streakSystem.createPointEmitter(new BABYLON.Vector3(-1, 0.5, 2), new BABYLON.Vector3(1, 1.5, 4));
    streakSystem.color1 = new BABYLON.Color4(0.0, 0.7, 1.0, 0.15);
    streakSystem.color2 = new BABYLON.Color4(0.0, 0.5, 0.8, 0.08);
    streakSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    streakSystem.minSize = 0.02;
    streakSystem.maxSize = 0.06;
    streakSystem.minLifeTime = 0.1;
    streakSystem.maxLifeTime = 0.25;
    streakSystem.emitRate = 0;
    streakSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    streakSystem.start();
  }

  function emitDust(position) {
    if (!getQuality().particles) return;
    if (!dustSystem) return;
    dustSystem.emitter = position.clone();
    dustSystem.emitter.y = 0.05;
    dustSystem.manualEmitCount = 12;
  }

  function updateStreaks(position, speed) {
    if (!streakSystem) return;
    if (!getQuality().particles || speed < BASE_SPEED + 4) {
      streakSystem.emitRate = 0;
      return;
    }
    streakSystem.emitter = position;
    var ratio = (speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    streakSystem.emitRate = Math.floor(ratio * 10);
  }

  function stop() {
    if (dustSystem) dustSystem.emitRate = 0;
    if (streakSystem) streakSystem.emitRate = 0;
  }

  return { init, emitDust, updateStreaks, stop };
})();

/* ------------------------------------------------------------------
   8c. HIT FLASH / VIGNETTE
   ------------------------------------------------------------------ */
const VignetteEffect = (() => {
  let el = null;
  let timer = 0;

  function init() {
    el = document.getElementById("vignette");
  }

  function flash() {
    if (!el) return;
    el.classList.add("flash");
    timer = 150;
  }

  function update(dt) {
    if (timer <= 0) return;
    timer -= dt * 1000;
    if (timer <= 0 && el) {
      el.classList.remove("flash");
    }
  }

  return { init, flash, update };
})();

/* ------------------------------------------------------------------
   9. INPUT HANDLER
   ------------------------------------------------------------------ */
const Input = (() => {
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
    if (e.target.tagName === "BUTTON" || e.target.tagName === "SELECT") return;
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
    els.hud           = document.getElementById("hud");
    els.score         = document.getElementById("score");
    els.pauseBtn      = document.getElementById("pauseBtn");
    els.soundBtn      = document.getElementById("soundBtn");
    els.jumpBtn       = document.getElementById("jumpBtn");
    els.startScreen   = document.getElementById("startScreen");
    els.startBest     = document.getElementById("startBest");
    els.pauseScreen   = document.getElementById("pauseScreen");
    els.resumeBtn     = document.getElementById("resumeBtn");
    els.gameOver      = document.getElementById("gameOverScreen");
    els.finalScore    = document.getElementById("finalScore");
    els.bestScore     = document.getElementById("bestScore");
    els.playBtn       = document.getElementById("playBtn");
    els.restartBtn    = document.getElementById("restartBtn");
    els.qualitySelect = document.getElementById("qualitySelect");

    els.playBtn.addEventListener("click",    () => GameState.startGame());
    els.restartBtn.addEventListener("click",  () => GameState.startGame());
    els.resumeBtn.addEventListener("click",   () => GameState.togglePause());
    els.pauseBtn.addEventListener("click",    () => GameState.togglePause());
    els.soundBtn.addEventListener("click",    () => AudioManager.toggle());

    if (els.qualitySelect) {
      els.qualitySelect.addEventListener("change", (e) => {
        applyQuality(e.target.value);
      });
    }

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
   10b. QUALITY MANAGER
   ------------------------------------------------------------------ */
function applyQuality(level) {
  currentQuality = level;

  // Rebuild pipeline
  createPipeline();

  // Rebuild shadows
  createShadows();

  // Update rim light intensity
  if (rimLight) {
    rimLight.intensity = getQuality().rimLight ? 0.2 : 0;
  }

  // Stop particles if disabled
  if (!getQuality().particles) {
    ParticleEffects.stop();
  }
}

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
    ParticleEffects.stop();
  }

  function gameOver() {
    if (state !== "playing") return;
    state = "gameover";
    player.alive = false;
    AudioManager.playGameOver();
    VignetteEffect.flash();
    ParticleEffects.stop();
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
  const grounded = checkGrounded(pos);
  if (grounded) {
    if (player.velocityY <= 0) {
      // Landing dust effect (transition from air to ground)
      if (!player.wasGrounded && player.wasGrounded !== undefined) {
        ParticleEffects.emitDust(pos);
      }
      player.mesh.position.y = PLAYER_START_Y;
      player.velocityY = 0;
      player.isGrounded = true;
      player.jumpCount = 0;
    }
  } else {
    player.isGrounded = false;
  }
  player.wasGrounded = grounded;

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

  // Camera (with dt and speed for bob + dynamic FOV)
  updateCamera(dt, spd);

  // Particles
  ParticleEffects.updateStreaks(pos, spd);

  // Vignette update
  VignetteEffect.update(dt);
}

/* ------------------------------------------------------------------
   15. INITIALISATION & RENDER LOOP
   ------------------------------------------------------------------ */
function boot() {
  createScene();
  createMaterials();
  createPlayer();
  createCamera();
  createSkyGradient();
  TrackManager.init();
  ObstacleManager.init();
  ParticleEffects.init();
  VignetteEffect.init();
  Input.init();
  UI.init();
  applyQuality(currentQuality);
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
