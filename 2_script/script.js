// 2_script/script.js
// PROCESSING & PRESENTATION: Web Audio API engine, sequencer clock, and UI controls.

let audioCtx = null;
let analyser = null;
let isPlaying = false;
let currentStep = 0;
let timerId = null;

// Current pattern state (object of arrays of 16 booleans/numbers)
let gridState = {};

// DOM references
const playBtn = document.getElementById("play-btn");
const bpmInput = document.getElementById("bpm-input");
const presetSelect = document.getElementById("preset-select");
const waveSelect = document.getElementById("wave-select");
const cutoffSlider = document.getElementById("cutoff-slider");
const cutoffVal = document.getElementById("cutoff-val");
const releaseSlider = document.getElementById("release-slider");
const releaseVal = document.getElementById("release-val");
const testSynthBtn = document.getElementById("test-synth-btn");
const clearBtn = document.getElementById("clear-btn");
const sequencerGrid = document.getElementById("sequencer-grid");
const learnText = document.getElementById("learn-text");
const canvas = document.getElementById("oscilloscope");
const canvasCtx = canvas.getContext("2d");

// Initialize Web Audio API on first user click (browser requirement)
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.connect(audioCtx.destination);
    drawOscilloscope();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// Synthesize a drum hit (fallback until .wav files are added)
function playDrumFallback(track) {
  initAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = track.id === "hihat" ? "square" : "triangle";
  osc.frequency.setValueAtTime(track.fallbackFreq, now);
  osc.frequency.exponentialRampToValueAtTime(20, now + 0.15);

  gain.gain.setValueAtTime(0.4, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(gain);
  gain.connect(analyser);

  osc.start(now);
  osc.stop(now + 0.16);
}

// Play a synth note using current UI controls
function playSynthNote(freq = 220) {
  initAudio();
  const now = audioCtx.currentTime;
  const release = parseFloat(releaseSlider.value);

  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc.type = waveSelect.value;
  osc.frequency.setValueAtTime(freq, now);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(parseFloat(cutoffSlider.value), now);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + release);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(analyser);

  osc.start(now);
  osc.stop(now + release + 0.02);
}

// Build the 16-step sequencer rows in the DOM
function renderGrid() {
  sequencerGrid.innerHTML = "";

  WAVECRAFT_DATA.tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row";

    const label = document.createElement("div");
    label.className = "track-label";
    label.style.borderLeft = `4px solid ${track.color}`;
    label.textContent = track.name;
    row.appendChild(label);

    const stepsContainer = document.createElement("div");
    stepsContainer.className = "steps-container";

    for (let step = 0; step < 16; step++) {
      const btn = document.createElement("button");
      btn.className = "step-btn";
      if (step % 4 === 0) btn.classList.add("beat-start");
      if (gridState[track.id][step]) {
        btn.classList.add("active");
        btn.style.backgroundColor = track.color;
      }
      btn.dataset.track = track.id;
      btn.dataset.step = step;

      btn.addEventListener("click", () => {
        gridState[track.id][step] = gridState[track.id][step] ? 0 : 1;
        renderGrid();
      });

      stepsContainer.appendChild(btn);
    }

    row.appendChild(stepsContainer);
    sequencerGrid.appendChild(row);
  });
}

// Highlight current playing column and trigger active sounds
function tick() {
  const allButtons = document.querySelectorAll(".step-btn");
  allButtons.forEach((btn) => {
    btn.classList.toggle("playing", Number(btn.dataset.step) === currentStep);
  });

  WAVECRAFT_DATA.tracks.forEach((track) => {
    if (gridState[track.id][currentStep]) {
      playDrumFallback(track);
    }
  });

  currentStep = (currentStep + 1) % 16;
}

// Start or stop the sequencer timer
function togglePlay() {
  initAudio();
  isPlaying = !isPlaying;

  if (isPlaying) {
    playBtn.textContent = "⏹ Stop";
    currentStep = 0;
    const stepMs = (60 / Number(bpmInput.value) / 4) * 1000;
    tick();
    timerId = setInterval(tick, stepMs);
  } else {
    playBtn.textContent = "▶ Play";
    clearInterval(timerId);
    document.querySelectorAll(".step-btn").forEach((b) => b.classList.remove("playing"));
  }
}

// Load a preset from WAVECRAFT_DATA
function loadPreset(presetKey) {
  const preset = WAVECRAFT_DATA.presets[presetKey];
  if (!preset) return;

  bpmInput.value = preset.bpm;
  waveSelect.value = preset.waveform;
  cutoffSlider.value = preset.cutoff;
  cutoffVal.textContent = preset.cutoff;
  releaseSlider.value = preset.release;
  releaseVal.textContent = preset.release;

  // Deep copy pattern so edits don't overwrite the preset
  gridState = JSON.parse(JSON.stringify(preset.pattern));
  renderGrid();
}

// Draw real-time audio wave on the canvas
function drawOscilloscope() {
  requestAnimationFrame(drawOscilloscope);
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  canvasCtx.fillStyle = "#0f172a";
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = "#38bdf8";
  canvasCtx.beginPath();

  const sliceWidth = canvas.width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;
    if (i === 0) canvasCtx.moveTo(x, y);
    else canvasCtx.lineTo(x, y);
    x += sliceWidth;
  }

  canvasCtx.lineTo(canvas.width, canvas.height / 2);
  canvasCtx.stroke();
}

// Setup Learn Mode hover tooltips
function setupTooltips() {
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      learnText.textContent = el.dataset.tip;
    });
  });
}

// Initialize the app when page loads
function startApp() {
  // Populate preset dropdown
  Object.entries(WAVECRAFT_DATA.presets).forEach(([key, preset]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.name;
    presetSelect.appendChild(opt);
  });

  // Event listeners
  playBtn.addEventListener("click", togglePlay);
  testSynthBtn.addEventListener("click", () => playSynthNote(220));
  presetSelect.addEventListener("change", (e) => loadPreset(e.target.value));

  cutoffSlider.addEventListener("input", () => {
    cutoffVal.textContent = cutoffSlider.value;
  });

  releaseSlider.addEventListener("input", () => {
    releaseVal.textContent = releaseSlider.value;
  });

  clearBtn.addEventListener("click", () => {
    WAVECRAFT_DATA.tracks.forEach((t) => {
      gridState[t.id] = Array(16).fill(0);
    });
    renderGrid();
  });

  bpmInput.addEventListener("change", () => {
    if (isPlaying) {
      togglePlay();
      togglePlay();
    }
  });

  setupTooltips();
  loadPreset("basicRock");
}

startApp();