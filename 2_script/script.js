// 2_script/script.js
// PROCESSING & PRESENTATION: Web Audio API engine, rotary knobs, drum EQ/attack, and sequencer.

let audioCtx = null;
let analyser = null;
let noiseBuffer = null;
let isPlaying = false;
let currentStep = 0;
let stepTimeoutId = null;

// Sequencer & Drum Settings State
let stepCount = 16; // 8, 16, or 32
let swingPercent = 0; // 0 to 60
let selectedTrackId = "kick";
let gridState = {};
let drumSettings = {};

// DOM references
const playBtn = document.getElementById("play-btn");
const bpmInput = document.getElementById("bpm-input");
const presetSelect = document.getElementById("preset-select");
const stepsSelect = document.getElementById("steps-select");
const swingSlider = document.getElementById("swing-slider");
const swingVal = document.getElementById("swing-val");
const waveSelect = document.getElementById("wave-select");
const cutoffSlider = document.getElementById("cutoff-slider");
const cutoffVal = document.getElementById("cutoff-val");
const releaseSlider = document.getElementById("release-slider");
const releaseVal = document.getElementById("release-val");
const testSynthBtn = document.getElementById("test-synth-btn");
const previewDrumBtn = document.getElementById("preview-drum-btn");
const clearBtn = document.getElementById("clear-btn");
const sequencerGrid = document.getElementById("sequencer-grid");
const drumKnobsContainer = document.getElementById("drum-knobs-container");
const editorTrackBadge = document.getElementById("editor-track-badge");
const editorTrackTitle = document.getElementById("editor-track-title");
const learnText = document.getElementById("learn-text");
const canvas = document.getElementById("oscilloscope");
const canvasCtx = canvas.getContext("2d");

// Initialize Web Audio API and reusable white-noise buffer for snares/hats/claps
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.connect(audioCtx.destination);

    // Create 1-second noise buffer for percussion crispness
    const bufferSize = audioCtx.sampleRate;
    noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    drawOscilloscope();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// Initialize default per-drum settings from presetA
function initDrumSettings() {
  WAVECRAFT_DATA.tracks.forEach((track) => {
    drumSettings[track.id] = {
      presetKey: "presetA",
      ...track.soundPresets.presetA
    };
  });
}

// Play a drum hit shaped by its preset, EQ filters (Low/Mid/High cut), Attack, and Volume
function playDrumSound(trackId) {
  initAudio();
  const s = drumSettings[trackId];
  if (!s || s.volume <= 0.01) return;

  const now = audioCtx.currentTime;
  const attack = Math.max(0.001, s.attack);
  const totalTime = attack + s.decay;

  // 1. Tone Oscillator
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = s.wave;
  osc.frequency.setValueAtTime(s.startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.endFreq), now + totalTime);
  oscGain.gain.value = 1 - s.noiseMix * 0.5;
  osc.connect(oscGain);

  // 2. Noise Generator (for snare snap, hats, claps)
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = s.noiseMix;
  noise.connect(noiseGain);

  // 3. Amplitude Envelope (Attack -> Decay)
  const envGain = audioCtx.createGain();
  envGain.gain.setValueAtTime(0.0001, now);
  envGain.gain.linearRampToValueAtTime(s.volume, now + attack);
  envGain.gain.exponentialRampToValueAtTime(0.0001, now + totalTime);

  // 4. 3-Band EQ Chain: Low-Cut (Highpass) -> Mid-Cut (Peaking) -> High-Cut (Lowpass)
  const lowCutFilter = audioCtx.createBiquadFilter();
  lowCutFilter.type = "highpass";
  lowCutFilter.frequency.setValueAtTime(s.lowCut, now);

  const midCutFilter = audioCtx.createBiquadFilter();
  midCutFilter.type = "peaking";
  midCutFilter.frequency.setValueAtTime(1000, now);
  midCutFilter.Q.setValueAtTime(1.2, now);
  midCutFilter.gain.setValueAtTime(s.midCut, now); // negative dB cuts boxy mids

  const highCutFilter = audioCtx.createBiquadFilter();
  highCutFilter.type = "lowpass";
  highCutFilter.frequency.setValueAtTime(s.highCut, now);

  // Connect Audio Graph
  oscGain.connect(envGain);
  noiseGain.connect(envGain);
  envGain.connect(lowCutFilter);
  lowCutFilter.connect(midCutFilter);
  midCutFilter.connect(highCutFilter);
  highCutFilter.connect(analyser);

  osc.start(now);
  noise.start(now);
  osc.stop(now + totalTime + 0.02);
  noise.stop(now + totalTime + 0.02);
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

// Reusable Rotary Knob Builder (supports mouse/touch drag and scroll wheel)
function createKnob({ label, min, max, step, value, unit, tip, accentColor, onChange }) {
  const wrapper = document.createElement("div");
  wrapper.className = "knob-unit";
  if (tip) {
    wrapper.dataset.tip = tip;
    wrapper.addEventListener("mouseenter", () => {
      learnText.textContent = tip;
    });
  }

  const dial = document.createElement("div");
  dial.className = "knob-dial";
  if (accentColor) dial.style.borderColor = accentColor;

  const indicator = document.createElement("div");
  indicator.className = "knob-indicator";
  if (accentColor) indicator.style.backgroundColor = accentColor;
  dial.appendChild(indicator);

  const labelEl = document.createElement("span");
  labelEl.className = "knob-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "knob-value";

  let currentVal = value;

  function formatDisplay(val) {
    if (unit === "%") return `${Math.round(val * 100)}%`;
    if (unit === "ms") return `${Math.round(val * 1000)} ms`;
    if (unit === "Hz") return val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${Math.round(val)} Hz`;
    if (unit === "dB") return `${val > 0 ? "+" : ""}${Math.round(val)} dB`;
    return `${val}${unit || ""}`;
  }

  function updateVisual(val) {
    const ratio = (val - min) / (max - min);
    const angle = -135 + ratio * 270; // -135 deg to +135 deg
    indicator.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    valueEl.textContent = formatDisplay(val);
  }

  function setValue(rawVal) {
    const clamped = Math.min(max, Math.max(min, rawVal));
    const stepped = Math.round(clamped / step) * step;
    currentVal = Number(stepped.toFixed(4));
    updateVisual(currentVal);
    onChange(currentVal);
  }

  updateVisual(currentVal);

  // Drag up/down support (mouse & touch)
  let startY = 0;
  let startVal = 0;

  function onPointerMove(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = startY - clientY;
    const range = max - min;
    setValue(startVal + (deltaY / 120) * range);
  }

  function onPointerUp() {
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);
    window.removeEventListener("touchmove", onPointerMove);
    window.removeEventListener("touchend", onPointerUp);
  }

  dial.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startY = e.clientY;
    startVal = currentVal;
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  });

  dial.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    startVal = currentVal;
    window.addEventListener("touchmove", onPointerMove);
    window.addEventListener("touchend", onPointerUp);
  }, { passive: true });

  // Scroll wheel support
  dial.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setValue(currentVal + dir * step * 2);
  });

  wrapper.appendChild(dial);
  if (label) wrapper.appendChild(labelEl);
  wrapper.appendChild(valueEl);
  return wrapper;
}

// Render the Drum Sound Editor knobs for the currently selected instrument
function renderDrumEditor() {
  const track = WAVECRAFT_DATA.tracks.find((t) => t.id === selectedTrackId);
  const settings = drumSettings[selectedTrackId];
  if (!track || !settings) return;

  editorTrackBadge.textContent = track.name.toUpperCase();
  editorTrackBadge.style.backgroundColor = track.color;
  editorTrackTitle.textContent = `${track.name} Sound Editor (${settings.label})`;

  drumKnobsContainer.innerHTML = "";

  const knobConfigs = [
    {
      label: "Low-Cut",
      min: 20,
      max: 1200,
      step: 10,
      value: settings.lowCut,
      unit: "Hz",
      tip: "Low-Cut (High-Pass Filter): removes muddy sub-bass frequencies below this point.",
      onChange: (v) => { settings.lowCut = v; }
    },
    {
      label: "Mid-Cut",
      min: -18,
      max: 6,
      step: 1,
      value: settings.midCut,
      unit: "dB",
      tip: "Mid-Cut EQ: scoops out boxy midrange frequencies around 1 kHz to make drums cleaner.",
      onChange: (v) => { settings.midCut = v; }
    },
    {
      label: "High-Cut",
      min: 800,
      max: 16000,
      step: 200,
      value: settings.highCut,
      unit: "Hz",
      tip: "High-Cut (Low-Pass Filter): softens harsh treble frequencies above this point.",
      onChange: (v) => { settings.highCut = v; }
    },
    {
      label: "Attack",
      min: 0.001,
      max: 0.12,
      step: 0.002,
      value: settings.attack,
      unit: "ms",
      tip: "Attack Time: controls how fast the drum hits peak volume. Low = sharp snap; High = soft fade-in.",
      onChange: (v) => { settings.attack = v; }
    }
  ];

  knobConfigs.forEach((cfg) => {
    drumKnobsContainer.appendChild(createKnob({ ...cfg, accentColor: track.color }));
  });
}

// Build the sequencer rows (Track Select + Preset Dropdown + Volume Knob + Steps)
function renderGrid() {
  sequencerGrid.innerHTML = "";

  WAVECRAFT_DATA.tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row";
    if (track.id === selectedTrackId) row.classList.add("selected-track");

    // Left track info & controls column
    const meta = document.createElement("div");
    meta.className = "track-meta";

    const selectBtn = document.createElement("button");
    selectBtn.className = "track-select-btn";
    selectBtn.style.borderLeft = `4px solid ${track.color}`;
    selectBtn.textContent = track.name;
    selectBtn.dataset.tip = `Select ${track.name} to edit its Low-Cut, Mid-Cut, High-Cut, and Attack knobs above.`;
    selectBtn.addEventListener("mouseenter", () => { learnText.textContent = selectBtn.dataset.tip; });
    selectBtn.addEventListener("click", () => {
      selectedTrackId = track.id;
      renderDrumEditor();
      renderGrid();
    });

    // Two-preset selector per instrument
    const presetDropdown = document.createElement("select");
    presetDropdown.className = "track-preset-select";
    presetDropdown.dataset.tip = `Switch between two built-in sound presets for ${track.name}.`;
    presetDropdown.addEventListener("mouseenter", () => { learnText.textContent = presetDropdown.dataset.tip; });

    Object.entries(track.soundPresets).forEach(([pKey, pData]) => {
      const opt = document.createElement("option");
      opt.value = pKey;
      opt.textContent = pData.label;
      if (drumSettings[track.id].presetKey === pKey) opt.selected = true;
      presetDropdown.appendChild(opt);
    });

    presetDropdown.addEventListener("change", (e) => {
      const chosenKey = e.target.value;
      const currentVol = drumSettings[track.id].volume;
      drumSettings[track.id] = {
        presetKey: chosenKey,
        ...track.soundPresets[chosenKey],
        volume: currentVol
      };
      selectedTrackId = track.id;
      renderDrumEditor();
      renderGrid();
      playDrumSound(track.id);
    });

    // Per-instrument Volume Knob on the drum rack
    const volKnob = createKnob({
      label: "",
      min: 0,
      max: 1,
      step: 0.02,
      value: drumSettings[track.id].volume,
      unit: "%",
      tip: `${track.name} Volume: drag up or down to balance this instrument in the mix.`,
      accentColor: track.color,
      onChange: (v) => {
        drumSettings[track.id].volume = v;
      }
    });
    volKnob.classList.add("mini-knob");

    meta.appendChild(selectBtn);
    meta.appendChild(presetDropdown);
    meta.appendChild(volKnob);
    row.appendChild(meta);

    // Step buttons (8, 16, or 32 depending on quantization)
    const stepsContainer = document.createElement("div");
    stepsContainer.className = "steps-container";
    stepsContainer.style.gridTemplateColumns = `repeat(${stepCount}, minmax(18px, 1fr))`;

    const beatGroup = stepCount === 8 ? 2 : stepCount === 32 ? 8 : 4;

    for (let step = 0; step < stepCount; step++) {
      const btn = document.createElement("button");
      btn.className = "step-btn";
      if (step % beatGroup === 0) btn.classList.add("beat-start");
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

// Schedule next step with dynamic BPM, Quantize Step Resolution, and Swing %
function scheduleNextTick() {
  if (!isPlaying) return;

  const allButtons = document.querySelectorAll(".step-btn");
  allButtons.forEach((btn) => {
    btn.classList.toggle("playing", Number(btn.dataset.step) === currentStep);
  });

  WAVECRAFT_DATA.tracks.forEach((track) => {
    if (gridState[track.id][currentStep]) {
      playDrumSound(track.id);
    }
  });

  // Calculate base step duration in ms (4 beats per bar)
  const barMs = (60 / Number(bpmInput.value)) * 4 * 1000;
  const baseStepMs = barMs / stepCount;

  // Apply swing: even steps are slightly longer, odd steps are slightly shorter
  const swingFactor = (swingPercent / 100) * 0.5;
  const isEvenStep = currentStep % 2 === 0;
  const delayMs = isEvenStep
    ? baseStepMs * (1 + swingFactor)
    : baseStepMs * (1 - swingFactor);

  currentStep = (currentStep + 1) % stepCount;
  stepTimeoutId = setTimeout(scheduleNextTick, delayMs);
}

// Start or stop the sequencer
function togglePlay() {
  initAudio();
  isPlaying = !isPlaying;

  if (isPlaying) {
    playBtn.textContent = "⏹ Stop";
    currentStep = 0;
    scheduleNextTick();
  } else {
    playBtn.textContent = "▶ Play";
    clearTimeout(stepTimeoutId);
    document.querySelectorAll(".step-btn").forEach((b) => b.classList.remove("playing"));
  }
}

// Load a pattern preset from WAVECRAFT_DATA
function loadPreset(presetKey) {
  const preset = WAVECRAFT_DATA.presets[presetKey];
  if (!preset) return;

  bpmInput.value = preset.bpm;
  waveSelect.value = preset.waveform;
  cutoffSlider.value = preset.cutoff;
  cutoffVal.textContent = preset.cutoff;
  releaseSlider.value = preset.release;
  releaseVal.textContent = preset.release;

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
  initDrumSettings();

  Object.entries(WAVECRAFT_DATA.presets).forEach(([key, preset]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.name;
    presetSelect.appendChild(opt);
  });

  playBtn.addEventListener("click", togglePlay);
  testSynthBtn.addEventListener("click", () => playSynthNote(220));
  previewDrumBtn.addEventListener("click", () => playDrumSound(selectedTrackId));
  presetSelect.addEventListener("change", (e) => loadPreset(e.target.value));

  stepsSelect.addEventListener("change", (e) => {
    stepCount = Number(e.target.value);
    if (currentStep >= stepCount) currentStep = 0;
    renderGrid();
  });

  swingSlider.addEventListener("input", () => {
    swingPercent = Number(swingSlider.value);
    swingVal.textContent = swingPercent;
  });

  cutoffSlider.addEventListener("input", () => {
    cutoffVal.textContent = cutoffSlider.value;
  });

  releaseSlider.addEventListener("input", () => {
    releaseVal.textContent = releaseSlider.value;
  });

  clearBtn.addEventListener("click", () => {
    WAVECRAFT_DATA.tracks.forEach((t) => {
      gridState[t.id] = Array(32).fill(0);
    });
    renderGrid();
  });

  setupTooltips();
  renderDrumEditor();
  loadPreset("basicRock");
}

startApp();