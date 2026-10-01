const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d", { alpha: true });

const audio = document.getElementById("audio");
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
const status = document.getElementById("status");

const timeline = [
  { start: 0.000,   end: 7.733,   text: "SO WHAT IF I CALL?" },

  { start: 7.733,   end: 12.400,  text: "AND YOU PICK UP THE PHONE" },
  { start: 12.400,   end: 15.367,  text: "AND I USE THIS HOLIDAY" },
  { start: 15.367,   end: 20.867,  text: "TO MAKE MY WAY TO YOUR GHOST" },

  { start: 20.867,  end: 33.167,  text: "YOU WALKED IN THE PARTY, YOUR COAT WAS UNTIED" },
  { start: 33.167,  end: 41.367,  text: "SLAMMING THE DOOR 'CAUSE IT'S COLDER OUTSIDE" },
  { start: 41.367,  end: 51.167,  text: "NOW I WON'T FORGET THAT MOMENT LIKE THE BLINK OF AN EYE" },
  { start: 51.167,  end: 57.967,  text: "YOU'RE OFF TO THE BEACH NOW 'TIL THE WEATHER GETS NICE" },

  { start: 57.967,  end: 62.367,  text: "BUT WHAT IF I CALL?" },
  { start: 62.367,  end: 67.334,  text: "AND YOU PICK UP THE PHONE" },
  { start: 67.334,  end: 70.334,  text: "AND I USE THIS HOLIDAY" },
  { start: 70.334,  end: 76.234,  text: "TO MAKE MY WAY TO YOUR GHOST" },

  { start: 76.234,  end: 80.767,  text: "OH, WHAT IF YOU'RE LONELY?" },
  { start: 80.767,  end: 85.434,  text: "AND YOU KNOW I AM TOO" },
  { start: 85.434,  end: 88.301,  text: "AND I GET THE CHANCE TO SAY" },
  { start: 88.301,  end: 94.768,  text: "I WISH I DIDN'T BUT I MISS YOU" },

  { start: 94.768,  end: 96.568,  text: "I MISS YOU" },
  { start: 96.568,  end: 103.734, text: "YOU KNOW IT'S TRUE" },
  { start: 103.734, end: 108.534, text: "YEAH, I MISS YOU" },
  { start: 108.534, end: 112.701, text: "YOU KNOW IT'S TRUE" },

  { start: 112.701, end: 117.301, text: "SO WHAT IF I CALL?" },
  { start: 117.301, end: 122.068, text: "AND YOU PICK UP THE PHONE" },
  { start: 122.068, end: 125.268, text: "AND I USE THIS HOLIDAY" },
  { start: 125.268, end: 131.201, text: "TO MAKE MY WAY TO YOUR GHOST" },

  { start: 131.201, end: 133.601, text: "OH, WHAT IF YOU'RE LONELY?" },
  { start: 133.601, end: 140.501, text: "AND YOU KNOW I AM TOO" },
  { start: 140.501, end: 143.601, text: "AND I GET THE CHANCE TO SAY" },
  { start: 143.601, end: 149.868, text: "I WISH I DIDN'T BUT I MISS YOU" },

  { start: 149.868, end: 151.802, text: "I MISS YOU" },
  { start: 151.802, end: 162.702, text: "…" }
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

function formatTime(value) {
  const t = Math.max(0, Number(value) || 0);
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
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
}



function lyricIndexAt(t) {
  // Timeline is the source of truth. rAF checks currentTime instead of
  // relying on timeupdate, which is throttled and can visibly lag.
  for (let i = 0; i < timeline.length; i++) {
    if (t >= timeline[i].start && t < timeline[i].end) return i;
  }
  return t >= timeline[timeline.length - 1].start ? timeline.length - 1 : -1;
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

function updatePlayerUI() {
  const t = audio.currentTime || 0;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 162.7;
  const pct = duration > 0 ? (t / duration) * 100 : 0;

  progress.value = String(Math.min(100, Math.max(0, pct)));
  durationEl.textContent = formatTime(duration);
  phoneLyricsProgressBar.style.width = Math.min(100, Math.max(0, pct)) + "%";
  phoneLyricsTime.textContent = formatTime(t);

  const playing = !audio.paused && !audio.ended;
  const state = playing ? "PLAYING" : (audio.ended ? "ENDED" : "PAUSED");

  playerStatus.textContent = state;
  stickyStatus.textContent = state;
  status.textContent = state;
  playPauseBtn.textContent = playing ? "❚❚" : "▶";
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
  else audio.pause();
}

startBtn.addEventListener("click", togglePlay);
playPauseBtn.addEventListener("click", togglePlay);
stickyPlay.addEventListener("click", togglePlay);
phoneLyricsBack.addEventListener("click", closePhoneLyrics);
phoneLyricsFull.addEventListener("click", toggleFullLyrics);

restartBtn.addEventListener("click", () => {
  audio.currentTime = 0;
  activeIndex = -1;
  playAudio();
});

muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? "⌁̸" : "⌁";
});

progress.addEventListener("input", () => {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 162.7;
  audio.currentTime = (Number(progress.value) / 100) * duration;
  updateLyric(audio.currentTime, true);
});

audio.addEventListener("play", updatePlayerUI);
audio.addEventListener("pause", updatePlayerUI);
audio.addEventListener("ended", () => {
  updatePlayerUI();
  document.body.classList.remove("isPlaying");
  document.body.classList.add("letterFinished");
  startBtn.innerHTML = '<span class="playIcon">↻</span><span>PLAY AGAIN</span>';
  playCaption.textContent = "the letter has finished.";
  closePhoneLyrics();
  document.getElementById("archiveEnd")?.scrollIntoView({behavior:"smooth",block:"center"});
});
audio.addEventListener("loadedmetadata", updatePlayerUI);

function sync() {
  if (!audio.paused) {
    updateLyric(audio.currentTime);
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
updatePlayerUI();
requestAnimationFrame(frame);
requestAnimationFrame(sync);
