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

  if (playerStatus) playerStatus.textContent = state;
  if (stickyStatus) stickyStatus.textContent = state;
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
