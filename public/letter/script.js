const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d", { alpha: true });

const audio = document.getElementById("audio");
const coverVideo = document.getElementById("coverVideo");
const COVER_VIDEO_DURATION_FALLBACK = 80;
let coverVideoReady = false;
let lastCoverVideoSync = -1;
const startBtn = document.getElementById("startBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const restartBtn = document.getElementById("restartBtn");
const muteBtn = document.getElementById("muteBtn");
const stickyPlay = document.getElementById("stickyPlay");
const progress = document.getElementById("progress");
const phoneLyricsPage = document.getElementById("phoneLyricsPage");
const phoneLyricsList = document.getElementById("phoneLyricsList");
const phoneFullLyrics = document.getElementById("phoneFullLyrics");
const phoneCurrentLyric = document.getElementById("phoneCurrentLyric");
const phoneLyricsProgressBar = document.getElementById("phoneLyricsProgressBar");
const phoneLyricsTime = document.getElementById("phoneLyricsTime");
const phoneLyricsBack = document.getElementById("phoneLyricsBack");
const phoneLyricsFull = document.getElementById("phoneLyricsFull");
const playerStatus = document.getElementById("playerStatus");
const stickyStatus = document.getElementById("stickyStatus");
const playCaption = document.getElementById("playCaption");
const durationEl = document.getElementById("duration");
const currentTimeEl = document.getElementById("currentTime");
const phoneTime = document.getElementById("phoneTime");
const songHeart = document.getElementById("songHeart");
const shuffleBtn = document.getElementById("shuffleBtn");
const nextBtn = document.getElementById("nextBtn");
const queueBtn = document.getElementById("queueBtn");
const minimizePlayerBtn = document.getElementById("minimizePlayerBtn");
const status = document.getElementById("status");

const timeline = [
  { start: 18.21, end: 20.50, text: "Girl, come through" },
  { start: 20.50, end: 22.78, text: "And let's do what we do" },
  { start: 22.78, end: 25.07, text: "In our imagination" },
  { start: 25.07, end: 27.35, text: "When I'm gone" },
  { start: 27.35, end: 29.64, text: "Show me through what we do" },
  { start: 29.64, end: 31.92, text: "In our imagination" },
  { start: 31.92, end: 34.21, text: "Girl, come through" },
  { start: 34.21, end: 36.50, text: "And let's do what we do" },
  { start: 36.50, end: 38.78, text: "In our imagination" },
  { start: 38.78, end: 41.07, text: "When I'm gone" },
  { start: 41.07, end: 43.35, text: "Show me through what we do" },
  { start: 43.35, end: 45.64, text: "In our imagination" },
  { start: 45.64, end: 47.92, text: "Girl, come-" },
  { start: 47.92, end: 50.21, text: "(Do in our imagination)" },
  { start: 50.21, end: 52.50, text: "(Show me through)" },
  { start: 52.50, end: 54.78, text: "(Do in our imagination)" },
  { start: 54.78, end: 57.07, text: "Girl, come-" },
  { start: 57.07, end: 59.35, text: "(Do in our imagination)" },
  { start: 59.35, end: 61.64, text: "(Show me through)" },
  { start: 61.64, end: 63.92, text: "(Do in our imagination)" },
  { start: 63.92, end: 66.21, text: "Girl, come through" },
  { start: 66.21, end: 68.50, text: "And let's do what we do" },
  { start: 68.50, end: 70.78, text: "In our imagination" },
  { start: 70.78, end: 73.07, text: "When I'm gone" },
  { start: 73.07, end: 75.35, text: "Show me through what we do" },
  { start: 75.35, end: 77.64, text: "In our imagination" },
  { start: 77.64, end: 79.92, text: "Girl, come through" },
  { start: 79.92, end: 82.21, text: "And let's do what we do" },
  { start: 82.21, end: 84.50, text: "In our imagination" },
  { start: 84.50, end: 86.78, text: "When I'm gone" },
  { start: 86.78, end: 89.07, text: "Show me through what we do" },
  { start: 89.07, end: 91.45, text: "In our imagination" }
];

let W = 0;
let H = 0;
let dpr = 1;
let audioCtx = null;
let analyser = null;
let source = null;
let freqData = new Uint8Array(512);
let timeData = new Uint8Array(1024);
let stars = [];
let dust = [];
let started = false;
let activeIndex = -1;
let animationId = 0;
let phoneLyricsOpen = false;
let fullLyricsOpen = false;

// Floating/burst particle layer used by the phone → headphone transition.
const floatParticles = [];
const burstParticles = [];
const FLOAT_COUNT = 140;

const PARTICLE_COLORS = [
  "#3b82f6",
  "#93c5fd",
  "#bfdbfe",
  "#60a5fa",
  "#2563eb",
  "#1d4ed8"
];

function randomParticleColor() {
  return PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
}

class Particle {
  constructor(x, y, type = "float") {
    this.x = x;
    this.y = y;
    this.type = type;
    this.vx = (Math.random() - 0.5) * (type === "burst" ? 5.5 : 0.45);
    this.vy = type === "burst"
      ? (Math.random() - 0.5) * 5.5
      : -(0.15 + Math.random() * 0.55);
    this.size = type === "burst"
      ? 1.2 + Math.random() * 3.2
      : 0.7 + Math.random() * 2.2;
    this.maxLife = type === "burst"
      ? 700 + Math.random() * 900
      : 7000 + Math.random() * 9000;
    this.life = type === "float" ? Math.random() * this.maxLife : 0;
    this.alpha = type === "burst" ? 0.9 : 0.25 + Math.random() * 0.4;
    this.color = randomParticleColor();
  }

  update(dt) {
    this.life += dt;

    if (this.type === "burst") {
      this.vx *= 0.992;
      this.vy *= 0.992;
      this.vy += 0.0025 * dt;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y < -10) this.y = H + 10;
      if (this.x < -10) this.x = W + 10;
      if (this.x > W + 10) this.x = -10;
      return this.life < this.maxLife;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    return this.life < this.maxLife;
  }

  draw() {
    const lifeRatio = Math.max(0, Math.min(1, this.life / this.maxLife));
    const fade = this.type === "burst"
      ? Math.sin(Math.PI * lifeRatio)
      : 1;

    ctx.save();
    ctx.globalAlpha = this.alpha * fade;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.type === "burst" ? 12 : 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

for (let i = 0; i < FLOAT_COUNT; i++) {
  const p = new Particle(Math.random() * W, Math.random() * H, "float");
  p.life = Math.random() * p.maxLife;
  floatParticles.push(p);
}

function spawnHeartBurst(x, y, count = 140) {
  for (let i = 0; i < count; i++) {
    burstParticles.push(new Particle(x, y, "burst"));
  }
}


const FINAL_CINEMATIC_AT = 91.45;
let finalCinematicActive = false;

function formatTime(value) {
  const t = Math.max(0, Number(value) || 0);
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
}

function updatePhoneClock() {
  if (!phoneTime) return;
  const now = new Date();
  phoneTime.textContent = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  }).replace(/^0/, "");
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const count = Math.max(45, Math.floor((W * H) / 15000));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.4 + Math.random() * 1.5,
    a: 0.1 + Math.random() * 0.55,
    p: Math.random() * Math.PI * 2
  }));

  dust = Array.from({ length: Math.max(30, Math.floor((W * H) / 30000)) }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.4 + Math.random() * 1.2,
    vx: (Math.random() - 0.5) * 0.04,
    vy: (Math.random() - 0.5) * 0.04
  }));

  // Keep the dedicated floating particle field inside the new viewport.
  floatParticles.forEach((p) => {
    if (!Number.isFinite(p.x) || p.x <= 0 || p.x > W + 20) p.x = Math.random() * W;
    if (!Number.isFinite(p.y) || p.y <= 0 || p.y > H + 20) p.y = Math.random() * H;
  });
}

function setupAudio() {
  if (audioCtx) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio API is not supported.");

  audioCtx = new AudioContextClass();
  source = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.86;

  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  freqData = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Uint8Array(analyser.fftSize);
}

function getEnergy() {
  if (!analyser) return 0;

  analyser.getByteFrequencyData(freqData);
  let sum = 0;
  const max = Math.min(120, freqData.length);

  for (let i = 1; i < max; i++) sum += freqData[i];

  return max > 1 ? sum / ((max - 1) * 255) : 0;
}

function drawBackground(t, energy) {
  ctx.clearRect(0, 0, W, H);

  const pulse = 0.55 + energy * 1.8 + Math.sin(t * 0.8) * 0.04;

  const glow = ctx.createRadialGradient(
    W * 0.5,
    H * 0.44,
    0,
    W * 0.5,
    H * 0.44,
    Math.max(W, H) * 0.68
  );

  glow.addColorStop(0, `rgba(218,205,137,${0.035 + pulse * 0.025})`);
  glow.addColorStop(0.42, "rgba(150,140,90,0.012)");
  glow.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.save();

  for (const s of stars) {
    const twinkle = 0.45 + 0.55 * Math.sin(t * 0.8 + s.p);
    ctx.globalAlpha = s.a * twinkle * (0.45 + energy * 1.4);
    ctx.fillStyle = "#eee8c9";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const d of dust) {
    d.x += d.vx * (1 + energy * 4);
    d.y += d.vy * (1 + energy * 4);
    if (d.x < 0) d.x = W;
    if (d.x > W) d.x = 0;
    if (d.y < 0) d.y = H;
    if (d.y > H) d.y = 0;

    ctx.globalAlpha = 0.025 + energy * 0.08;
    ctx.fillStyle = "#d9ce91";
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  const vignette = ctx.createRadialGradient(
    W * 0.5,
    H * 0.45,
    H * 0.1,
    W * 0.5,
    H * 0.45,
    Math.max(W, H) * 0.75
  );

  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.65, "rgba(0,0,0,0.08)");
  vignette.addColorStop(1, "rgba(0,0,0,0.72)");

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Blue particle field: subtle while idle, brighter during the transition.
  const dt = 1 / 60;
  for (let i = floatParticles.length - 1; i >= 0; i--) {
    const p = floatParticles[i];
    if (p.update(dt)) p.draw();
  }

  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const p = burstParticles[i];
    if (p.update(dt)) p.draw();
    else burstParticles.splice(i, 1);
  }
}



function lyricIndexAt(t) {
  // Timeline is the source of truth. rAF checks currentTime instead of
  // relying on timeupdate, which is throttled and can visibly lag.
  for (let i = 0; i < timeline.length; i++) {
    if (t >= timeline[i].start && t < timeline[i].end) return i;
  }
  return -1;
}

function renderPhoneLyrics() {
  phoneLyricsList.replaceChildren();
  phoneFullLyrics.replaceChildren();

  timeline.forEach((entry, index) => {
    const makeLine = (compact) => {
      const line = document.createElement("button");
      line.type = "button";
      line.className = "phoneLyricLine" + (!entry.text ? " silence" : "");
      line.dataset.index = String(index);
      line.innerHTML = `<span class="phoneLineTime">${formatTime(entry.start)}</span><span>${escapeHtml(entry.text || "…")}</span>`;
      line.addEventListener("click", () => {
        audio.currentTime = entry.start;
        updateLyric(audio.currentTime, true);
        if (audio.paused) playAudio();
      });
      return line;
    };

    phoneLyricsList.appendChild(makeLine(true));
    phoneFullLyrics.appendChild(makeLine(false));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateLyric(t, force = false) {
  const index = lyricIndexAt(t);
  if (!force && index === activeIndex) return;
  activeIndex = index;

  const entry = timeline[index];
  const text = entry ? (entry.text || "…") : "…";
  phoneCurrentLyric.textContent = text;

  document.querySelectorAll(".phoneLyricLine").forEach((el) => {
    const active = Number(el.dataset.index) === index;
    el.classList.toggle("active", active);
  });

  const activeLine = phoneLyricsOpen
    ? phoneLyricsList.querySelector(`.phoneLyricLine[data-index="${index}"]`)
    : null;

  if (activeLine) {
    activeLine.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const fullActive = fullLyricsOpen
    ? phoneFullLyrics.querySelector(`.phoneLyricLine[data-index="${index}"]`)
    : null;

  if (fullActive) {
    fullActive.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function openPhoneLyrics() {
  phoneLyricsOpen = true;
  phoneLyricsPage.classList.add("open");
  phoneLyricsPage.setAttribute("aria-hidden", "false");
  updateLyric(audio.currentTime, true);
}

function closePhoneLyrics() {
  phoneLyricsOpen = false;
  fullLyricsOpen = false;
  phoneLyricsPage.classList.remove("open", "full");
  phoneLyricsPage.setAttribute("aria-hidden", "true");
}

function toggleFullLyrics() {
  fullLyricsOpen = !fullLyricsOpen;
  phoneLyricsPage.classList.toggle("full", fullLyricsOpen);
  phoneFullLyrics.setAttribute("aria-hidden", String(!fullLyricsOpen));
  phoneLyricsList.setAttribute("aria-hidden", String(fullLyricsOpen));
  phoneLyricsFull.setAttribute("aria-label", fullLyricsOpen ? "Close full lyrics" : "Show full lyrics");
  if (fullLyricsOpen) {
    const active = phoneFullLyrics.querySelector(`.phoneLyricLine[data-index="${activeIndex}"]`);
    active?.scrollIntoView({ behavior: "auto", block: "center" });
  }
}

function resetFinalCinematic() {
  finalCinematicActive = false;
  document.body.classList.remove("finalCinematic");
}

function triggerFinalCinematic() {
  if (finalCinematicActive) return;
  finalCinematicActive = true;
  document.body.classList.add("finalCinematic");

  // Burst from the phone's former center as it dissolves into the headphones.
  spawnHeartBurst(W * 0.5, H * 0.49, 140);
}

function syncFinalCinematic(t) {
  if (t >= FINAL_CINEMATIC_AT) triggerFinalCinematic();
  else if (finalCinematicActive) resetFinalCinematic();
}

function getCoverVideoDuration() {
  return Number.isFinite(coverVideo?.duration) && coverVideo.duration > 0
    ? coverVideo.duration
    : COVER_VIDEO_DURATION_FALLBACK;
}

function syncCoverVideo(force = false) {
  if (!coverVideo) return;

  const songTime = Number(audio.currentTime) || 0;
  const visualDuration = getCoverVideoDuration();
  const target = ((songTime % visualDuration) + visualDuration) % visualDuration;

  if (force || Math.abs((coverVideo.currentTime || 0) - target) > 0.18) {
    try {
      coverVideo.currentTime = target;
      lastCoverVideoSync = target;
    } catch (error) {
      console.warn("[LETTER] Cover video seek failed:", error);
    }
  }
}

async function playCoverVideo() {
  if (!coverVideo) return;
  coverVideo.muted = true;
  try {
    await coverVideo.play();
    coverVideoReady = true;
  } catch (error) {
    // Muted autoplay is normally allowed, but keep the letter functional if
    // a browser blocks the visual layer.
    console.warn("[LETTER] Cover video playback blocked:", error);
  }
}

function pauseCoverVideo() {
  if (!coverVideo) return;
  coverVideo.pause();
}

function updatePlayerUI() {
  const t = audio.currentTime || 0;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 139;
  const pct = duration > 0 ? (t / duration) * 100 : 0;

  const safePct = Math.min(100, Math.max(0, pct));
  progress.value = String(safePct);
  progress.style.setProperty("--progress", safePct + "%");
  currentTimeEl.textContent = formatTime(t);
  durationEl.textContent = formatTime(duration);
  phoneLyricsProgressBar.style.width = Math.min(100, Math.max(0, pct)) + "%";
  phoneLyricsTime.textContent = formatTime(t);

  const playing = !audio.paused && !audio.ended;
  const state = playing ? "PLAYING" : (audio.ended ? "ENDED" : "PAUSED");

  playerStatus.textContent = state;
  stickyStatus.textContent = state;
  status.textContent = state;
  playPauseBtn.classList.toggle("isPlaying", playing);
  playPauseBtn.querySelector(".pauseGlyph").style.display = playing ? "flex" : "none";
  playPauseBtn.querySelector(".playGlyph").style.display = playing ? "none" : "block";
  playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  stickyPlay.textContent = playing ? "❚❚" : "▶";
  playCaption.textContent = playing ? "stay here for a while." : (audio.ended ? "the letter has finished." : "the song starts here.");
}

async function playAudio() {
  try {
    document.body.classList.remove("letterFinished");
    setupAudio();

    if (audioCtx.state === "suspended") await audioCtx.resume();
    await audio.play();

    syncCoverVideo(true);
    await playCoverVideo();

    started = true;
    document.body.classList.add("isPlaying");
    startBtn.innerHTML = '<span class="playIcon">❚❚</span><span>PLAYING</span>';

    // The phone becomes the lyric experience instead of sending the page
    // down to a separate lyrics section.
    window.setTimeout(() => {
      if (started && !audio.paused && !audio.ended) openPhoneLyrics();
    }, 1150);
  } catch (error) {
    console.error("[LETTER] Audio start failed:", error);
    playerStatus.textContent = "CHECK AUDIO";
    stickyStatus.textContent = "CHECK AUDIO";
  }
}

function togglePlay() {
  if (!started || audio.paused) playAudio();
  else {
    audio.pause();
    pauseCoverVideo();
  }
}

startBtn.addEventListener("click", togglePlay);
playPauseBtn.addEventListener("click", togglePlay);
stickyPlay.addEventListener("click", togglePlay);
phoneLyricsBack.addEventListener("click", closePhoneLyrics);
phoneLyricsFull.addEventListener("click", toggleFullLyrics);

restartBtn.addEventListener("click", () => {
  audio.currentTime = 0;
  syncCoverVideo(true);
  activeIndex = -1;
  resetFinalCinematic();
  playAudio();
});

muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  muteBtn.classList.toggle("isMuted", audio.muted);
  muteBtn.setAttribute("aria-label", audio.muted ? "Unmute" : "Mute");
});

songHeart?.addEventListener("click", () => {
  const liked = !songHeart.classList.contains("isLiked");
  songHeart.classList.toggle("isLiked", liked);
  songHeart.setAttribute("aria-pressed", String(liked));
});

shuffleBtn?.addEventListener("click", () => {
  const active = !shuffleBtn.classList.contains("isActive");
  shuffleBtn.classList.toggle("isActive", active);
  shuffleBtn.setAttribute("aria-pressed", String(active));
});

nextBtn?.addEventListener("click", () => {
  audio.currentTime = 0;
  activeIndex = -1;
  resetFinalCinematic();
  syncCoverVideo(true);
  updateLyric(0, true);
  playAudio();
});

queueBtn?.addEventListener("click", openPhoneLyrics);

minimizePlayerBtn?.addEventListener("click", () => {
  document.getElementById("playerSection")?.scrollIntoView({ behavior: "smooth", block: "center" });
});

progress.addEventListener("input", () => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 139;
  audio.currentTime = (Number(progress.value) / 100) * duration;
  syncCoverVideo(true);
  updateLyric(audio.currentTime, true);
  syncFinalCinematic(audio.currentTime);
});

audio.addEventListener("play", async () => {
  updatePlayerUI();
  syncCoverVideo(true);
  await playCoverVideo();
});
audio.addEventListener("pause", () => {
  pauseCoverVideo();
  updatePlayerUI();
});
audio.addEventListener("ended", () => {
  pauseCoverVideo();
  if (coverVideo) {
    try {
      coverVideo.currentTime = 0;
    } catch {}
  }
  updatePlayerUI();
  document.body.classList.remove("isPlaying");
  resetFinalCinematic();
  document.body.classList.add("letterFinished");
  startBtn.innerHTML = '<span class="playIcon">↻</span><span>PLAY AGAIN</span>';
  playCaption.textContent = "the letter has finished.";
  closePhoneLyrics();
  document.getElementById("archiveEnd")?.scrollIntoView({behavior:"smooth",block:"center"});
});
audio.addEventListener("loadedmetadata", () => {
  updatePlayerUI();
  syncCoverVideo(true);
});

if (coverVideo) {
  coverVideo.addEventListener("loadedmetadata", () => {
    coverVideoReady = true;
    syncCoverVideo(true);
  });

  coverVideo.addEventListener("error", () => {
    coverVideoReady = false;
    console.warn("[LETTER] Animated cover video could not be loaded.");
  });
}

function sync() {
  if (!audio.paused) {
    updateLyric(audio.currentTime);
    syncFinalCinematic(audio.currentTime);
    updatePlayerUI();
  }
  animationId = requestAnimationFrame(sync);
}

function frame(ms) {
  const t = ms / 1000;
  const energy = getEnergy();
  drawBackground(t, energy);

  const spectrumBars = document.querySelectorAll(".miniSpectrum i");
  if (spectrumBars.length) {
    spectrumBars.forEach((bar, index) => {
      const bin = Math.min(Math.max(0, freqData.length - 1), 3 + index * 4);
      const sample = freqData.length ? freqData[bin] / 255 : energy;
      bar.style.height = Math.max(8, Math.min(100, 10 + sample * 90)) + "%";
    });
  }

  if (analyser && !audio.paused && timeData.length) {
    analyser.getByteTimeDomainData(timeData);
  }

  animationId = requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);

phoneLyricsPage.addEventListener("click", (event) => {
  if (event.target === phoneLyricsPage) closePhoneLyrics();
});

resize();
renderPhoneLyrics();
updatePhoneClock();
window.setInterval(updatePhoneClock, 15000);
updatePlayerUI();
requestAnimationFrame(frame);
requestAnimationFrame(sync);
