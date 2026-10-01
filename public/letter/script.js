const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d", { alpha: false });

const audio = document.getElementById("audio");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const timeEl = document.getElementById("time");
const statusEl = document.getElementById("status");

/*
 * Lyrics/timeline:
 * Keep this array as the single source of truth for the dot-matrix text.
 * Replace the placeholder entries with the real timestamps/lyrics when ready.
 */
const timeline = [
  { start: 0, end: 5.2, text: "MERRY CHRISTMAS\nI MISS YOU" },
  { start: 5.2, end: 10.8, text: "SO, WHAT IF\nI CALL" },
  { start: 10.8, end: 16, text: "YOU PICK\nUP THE PHONE?" },
  { start: 16, end: 21.5, text: "TO MAKE MY\nWAY" },
  { start: 21.5, end: 27, text: "AND YOU KNOW\nI AM TOO?" },
  { start: 27, end: 34, text: "AND I GET THE\nCHANCE TO SAY" },
  { start: 34, end: 40, text: "I MISS YOU..." }
];

let W = 0;
let H = 0;
let dpr = 1;

let audioCtx = null;
let analyser = null;
let source = null;
let freqData = new Uint8Array(512);
let timeData = new Uint8Array(1024);

let particles = [];
let dust = [];
let stars = [];

const textCanvas = document.createElement("canvas");
const textCtx = textCanvas.getContext("2d");

const glowCanvas = document.createElement("canvas");
const glowCtx = glowCanvas.getContext("2d");

let lastLine = "";
let lineChangedAt = 0;

let smoothBass = 0;
let smoothMid = 0;
let smoothHigh = 0;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);

  canvas.width = W * dpr;
  canvas.height = H * dpr;

  glowCanvas.width = W * dpr;
  glowCanvas.height = H * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  createParticles();
}

window.addEventListener("resize", resize);
resize();

function createParticles() {
  const count = Math.max(170, Math.floor((W * H) / 4200));

  particles = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    z: 0.15 + Math.random() * 0.95,
    size: 0.35 + Math.random() * 1.5,
    speed: 0.015 + Math.random() * 0.12,
    twinkle: Math.random() * Math.PI * 2,
    alpha: 0.08 + Math.random() * 0.52
  }));

  dust = Array.from(
    { length: Math.max(70, Math.floor((W * H) / 11000)) },
    () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.4 + Math.random() * 1.3,
      vx: (Math.random() - 0.5) * 0.035,
      vy: (Math.random() - 0.5) * 0.035,
      a: 0.025 + Math.random() * 0.1
    })
  );

  stars = Array.from(
    { length: Math.max(35, Math.floor((W * H) / 30000)) },
    () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.7 + Math.random() * 1.5,
      a: 0.25 + Math.random() * 0.7
    })
  );
}

function setupAudio() {
  if (audioCtx) return;

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API is not supported.");
  }

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

startBtn.addEventListener("click", async () => {
  try {
    setupAudio();

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    await audio.play();

    startScreen.style.display = "none";
    statusEl.textContent = "PLAYING";
  } catch (error) {
    console.error("[LETTER] Audio start failed:", error);
    statusEl.textContent = "CHECK AUDIO FILE";
  }
});

audio.addEventListener("loadedmetadata", () => {
  if (Number.isFinite(audio.duration)) {
    statusEl.textContent = "READY";
  }
});

audio.addEventListener("ended", () => {
  statusEl.textContent = "ENDED";
});

audio.addEventListener("error", () => {
  console.error("[LETTER] Audio/video asset failed to load:", audio.error);
  statusEl.textContent = "AUDIO ERROR";
});

function currentLine(t) {
  return timeline.find((entry) => t >= entry.start && t < entry.end) || null;
}

function ease(t) {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function smooth(oldValue, value, amount = 0.08) {
  return oldValue + (value - oldValue) * amount;
}

function getBands() {
  if (!analyser || !freqData || !timeData) {
    return {
      bass: 0.06,
      mid: 0.05,
      high: 0.04,
      energy: 0.05
    };
  }

  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  function avg(start, end) {
    let sum = 0;
    let count = 0;

    for (
      let i = start;
      i < end && i < freqData.length;
      i++
    ) {
      sum += freqData[i];
      count++;
    }

    return count ? sum / count / 255 : 0;
  }

  const bass = avg(1, 13);
  const mid = avg(13, 80);
  const high = avg(80, 240);

  smoothBass = smooth(smoothBass, bass, 0.11);
  smoothMid = smooth(smoothMid, mid, 0.08);
  smoothHigh = smooth(smoothHigh, high, 0.09);

  return {
    bass: smoothBass,
    mid: smoothMid,
    high: smoothHigh,
    energy:
      smoothBass * 0.55 +
      smoothMid * 0.3 +
      smoothHigh * 0.15
  };
}

function drawBackground(t, b) {
  ctx.fillStyle = "#010101";
  ctx.fillRect(0, 0, W, H);

  const breathe = 0.7 + 0.3 * Math.sin(t * 0.18);

  const g = ctx.createRadialGradient(
    W * 0.5,
    H * 0.49,
    0,
    W * 0.5,
    H * 0.49,
    H * 0.62
  );

  g.addColorStop(
    0,
    `rgba(210,204,130,${0.035 * breathe + b.energy * 0.035})`
  );
  g.addColorStop(0.34, "rgba(120,116,80,.012)");
  g.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const h = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.78);
  h.addColorStop(0, "rgba(0,0,0,0)");
  h.addColorStop(
    0.5,
    `rgba(215,210,145,${0.008 + b.mid * 0.014})`
  );
  h.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = h;
  ctx.fillRect(0, 0, W, H);
}

function drawStars(t, b) {
  ctx.save();

  for (const s of stars) {
    const tw = 0.55 + 0.45 * Math.sin(t * 0.7 + s.x * 0.01);

    ctx.globalAlpha = s.a * tw * (0.55 + b.high * 0.7);
    ctx.fillStyle = "#eee9bd";

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of particles) {
    p.y += p.speed * (0.55 + b.bass * 3.2) * p.z;
    p.x += Math.sin(t * 0.08 + p.twinkle) * 0.025 * p.z;

    if (p.y > H + 5) {
      p.y = -5;
      p.x = Math.random() * W;
    }

    if (p.x > W + 5) p.x = -5;

    const tw =
      0.5 + 0.5 * Math.sin(t * (1.2 + p.z) + p.twinkle);

    ctx.globalAlpha =
      p.alpha * tw * (0.45 + p.z * 0.55);

    ctx.fillStyle = "#dcd8a6";

    const size = p.size * (0.55 + p.z * 0.7);
    ctx.fillRect(p.x, p.y, size, size);
  }

  for (const d of dust) {
    d.x += d.vx * (1 + b.mid * 3);
    d.y += d.vy * (1 + b.mid * 3);

    if (d.x < 0) d.x = W;
    if (d.x > W) d.x = 0;
    if (d.y < 0) d.y = H;
    if (d.y > H) d.y = 0;

    ctx.globalAlpha = d.a * (0.5 + b.energy * 1.8);
    ctx.fillStyle = "#eee8b0";

    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWave(t, b) {
  if (!timeData || !freqData || !timeData.length || !freqData.length) {
    return;
  }

  const cx = W * 0.5;
  const cy = H * 0.685;
  const width = W * 0.86;
  const samples = 260;
  const baseAmp = H * (0.012 + b.bass * 0.065);
  const wave = [];

  for (let i = 0; i <= samples; i++) {
    const n = i / samples;
    const x = cx - width / 2 + n * width;
    const index = Math.floor(n * (timeData.length - 1));
    const raw = (timeData[index] - 128) / 128;
    const envelope = Math.pow(Math.sin(Math.PI * n), 0.55);
    const y =
      cy + raw * baseAmp * 2.2 * envelope;

    wave.push([x, y]);
  }

  glowCtx.clearRect(0, 0, W, H);
  glowCtx.save();
  glowCtx.filter = `blur(${7 + Math.round(b.bass * 7)}px)`;
  glowCtx.globalAlpha = 0.12 + b.bass * 0.24;
  glowCtx.strokeStyle = "#e7df9b";
  glowCtx.lineWidth = 2.5;
  glowCtx.beginPath();

  wave.forEach(([x, y], i) => {
    if (i) glowCtx.lineTo(x, y);
    else glowCtx.moveTo(x, y);
  });

  glowCtx.stroke();
  glowCtx.restore();

  ctx.drawImage(glowCanvas, 0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  ctx.strokeStyle =
    `rgba(239,233,177,${0.48 + b.mid * 0.25})`;
  ctx.lineWidth = 1;
  ctx.beginPath();

  wave.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });

  ctx.stroke();

  ctx.strokeStyle =
    `rgba(213,207,140,${0.16 + b.high * 0.18})`;
  ctx.lineWidth = 0.7;
  ctx.beginPath();

  for (let i = 0; i <= samples; i += 2) {
    const n = i / samples;
    const x = cx - width / 2 + n * width;
    const index = Math.floor(n * (freqData.length - 1));
    const value = freqData[index] / 255;
    const y =
      cy -
      value * H * (0.035 + b.high * 0.025) -
      Math.sin(n * 20 + t * 0.8) * H * 0.002;

    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }

  ctx.stroke();

  for (let i = 0; i <= samples; i += 7) {
    const [x, y] = wave[i];
    const n = i / samples;
    const index = Math.floor(n * (freqData.length - 1));
    const value = freqData[index] / 255;
    const r = 0.35 + value * 1.35;

    ctx.globalAlpha = 0.15 + value * 0.55;
    ctx.fillStyle = "#f0e9ad";

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawDotText(text, t, b) {
  if (!text) return;

  if (text !== lastLine) {
    lastLine = text;
    lineChangedAt = t;
  }

  const enter = ease(clamp((t - lineChangedAt) / 0.65));
  const lines = text.split("\n");

  const fontSize = Math.max(
    24,
    Math.min(70, W * 0.095)
  );

  const maxWidth = Math.floor(W * 0.96);

  if (
    textCanvas.width !== maxWidth ||
    textCanvas.height !== Math.ceil(fontSize * 2.8)
  ) {
    textCanvas.width = maxWidth;
    textCanvas.height = Math.ceil(fontSize * 2.8);
  }

  textCtx.clearRect(
    0,
    0,
    textCanvas.width,
    textCanvas.height
  );

  textCtx.fillStyle = "#fff";
  textCtx.textAlign = "center";
  textCtx.textBaseline = "middle";
  textCtx.font =
    `700 ${fontSize}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;

  const gap = fontSize * 0.86;
  const startY =
    textCanvas.height / 2 -
    ((lines.length - 1) * gap) / 2;

  lines.forEach((line, i) => {
    textCtx.fillText(
      line,
      textCanvas.width / 2,
      startY + i * gap
    );
  });

  const image = textCtx.getImageData(
    0,
    0,
    textCanvas.width,
    textCanvas.height
  ).data;

  const step = Math.max(
    3,
    Math.round(fontSize / 15)
  );

  const x0 = (W - textCanvas.width) / 2;
  const y0 =
    H * 0.43 -
    textCanvas.height / 2 -
    (1 - enter) * 18;

  glowCtx.clearRect(0, 0, W, H);
  glowCtx.save();
  glowCtx.filter = "blur(7px)";

  for (
    let y = 0;
    y < textCanvas.height;
    y += step
  ) {
    for (
      let x = 0;
      x < textCanvas.width;
      x += step
    ) {
      const alpha =
        image[
          (y * textCanvas.width + x) * 4 + 3
        ] / 255;

      if (alpha < 0.18) continue;

      glowCtx.globalAlpha =
        alpha * enter * (0.12 + b.energy * 0.18);
      glowCtx.fillStyle = "#d9d176";
      glowCtx.fillRect(
        x0 + x,
        y0 + y,
        step * 0.72,
        step * 0.72
      );
    }
  }

  glowCtx.restore();
  ctx.drawImage(glowCanvas, 0, 0, W, H);

  ctx.save();

  for (
    let y = 0;
    y < textCanvas.height;
    y += step
  ) {
    for (
      let x = 0;
      x < textCanvas.width;
      x += step
    ) {
      const alpha =
        image[
          (y * textCanvas.width + x) * 4 + 3
        ] / 255;

      if (alpha < 0.18) continue;

      const pulse =
        0.88 +
        0.12 * Math.sin(
          t * 3.4 + x * 0.018 + y * 0.011
        );

      ctx.globalAlpha = alpha * enter * pulse;
      ctx.fillStyle = "#e6df91";

      const size = Math.max(1, step * 0.68);
      ctx.fillRect(
        x0 + x,
        y0 + y,
        size,
        size
      );
    }
  }

  ctx.restore();
}

function drawOrb(t, b) {
  const x = W * 0.89;
  const y = H * 0.78;
  const r = 7 + b.bass * 15;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.42);

  const g = ctx.createRadialGradient(
    0,
    0,
    0,
    0,
    0,
    r * 3.2
  );

  g.addColorStop(
    0,
    `rgba(236,230,164,${0.12 + b.bass * 0.18})`
  );
  g.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle =
    `rgba(239,234,187,${0.28 + b.high * 0.4})`;
  ctx.lineWidth = 0.8;

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.56, -1, 1.55);
  ctx.stroke();

  ctx.fillStyle = "#eee7ac";
  ctx.globalAlpha = 0.35 + b.high * 0.45;
  ctx.fillRect(-0.7, -0.7, 1.4, 1.4);

  ctx.restore();
}

function drawVignette() {
  const g = ctx.createRadialGradient(
    W * 0.5,
    H * 0.48,
    H * 0.16,
    W * 0.5,
    H * 0.48,
    H * 0.78
  );

  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.62, "rgba(0,0,0,.04)");
  g.addColorStop(1, "rgba(0,0,0,.68)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(0, 0, W, H * 0.018);
  ctx.fillRect(0, H * 0.982, W, H * 0.018);
}

function drawCRT(t, b) {
  ctx.save();

  ctx.globalAlpha = 0.025 + b.high * 0.012;
  ctx.fillStyle = "#fff";

  for (let y = 0; y < H; y += 4) {
    ctx.fillRect(0, y, W, 1);
  }

  ctx.globalAlpha = 0.012;

  for (let i = 0; i < 110; i++) {
    ctx.fillRect(
      Math.random() * W,
      Math.random() * H,
      1,
      1
    );
  }

  ctx.globalAlpha = 0.035;

  const edge =
    (Math.sin(t * 0.23) * 0.5 + 0.5) *
    W *
    0.0015;

  ctx.fillRect(edge, 0, 1, H);
  ctx.restore();
}

function frame() {
  const t = audio.currentTime || 0;
  const bands = getBands();

  drawBackground(t, bands);
  drawStars(t, bands);
  drawWave(t, bands);

  const line = currentLine(t);

  if (line) {
    drawDotText(line.text, t, bands);
  }

  drawOrb(t, bands);
  drawVignette();
  drawCRT(t, bands);

  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);

  timeEl.textContent =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
