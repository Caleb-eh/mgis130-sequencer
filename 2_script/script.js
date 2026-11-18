// 2_script/script.js
// PROCESSING & PRESENTATION: Web Audio Lookahead Scheduler, real-time noise gate, rotary knobs, and ghost oscilloscopes.

let audioCtx = null;
let noiseBuffer = null;
let reverbImpulseBuffer = null;
let isPlaying = false;

// Lookahead Web Audio Scheduler state
let currentScheduleStep = 0;
let nextNoteTime = 0.0;
let schedulerTimerId = null;
const lookaheadMs = 25.0; // How frequently to call scheduling function (ms)
const scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)
const visualStepQueue = []; // { step, time }
let lastDrawnVisualStep = -1;

// Dedicated per-channel AnalyserNodes & Canvas registry (with raw/ghost trace support)
const channelAnalysers = {};
let animLoopStarted = false;

// Master & FX Audio Nodes
let masterBusGain = null;
let fxInputBus = null;
let driveNode = null;
let compressorNode = null;
let gateAnalyserNode = null;
let gateTimeData = null;
let gateGainNode = null;
let delayNode = null;
let delayFeedbackGain = null;
let delayWetGain = null;
let reverbConvolver = null;
let reverbWetGain = null;
let dryBusGain = null;

// Sequencer & Drum Settings State
let stepCount = 16;
let swingPercent = 0;
let selectedTrackId = "kick";
let gridState = {};
let drumSettings = {};
const trackMuteSolo = {}; // { kick: { muted: false, solo: false }, ... }

// Modular Rack Parameter State & Bypass Flags
const rackState = {
  filterType: "lowpass",
  bypass: {
    adsr: false,
    filter: false,
    dynamics: false,
    space: false
  },
  params: {}
};

// QWERTY Keyboard Mappings
const DRUM_KEY_MAP = {
  "1": "kick",
  "2": "snare",
  "3": "hihat",
  "4": "clap"
};

// C-Major scale (C4 to C5) mapped to A S D F G H J K
const SYNTH_KEY_MAP = {
  a: 261.63, // C4
  s: 293.66, // D4
  d: 329.63, // E4
  f: 349.23, // F4
  g: 392.00, // G4
  h: 440.00, // A4
  j: 493.88, // B4
  k: 523.25  // C5
};

// DOM references
const playBtn = document.getElementById("play-btn");
const bpmInput = document.getElementById("bpm-input");
const presetSelect = document.getElementById("preset-select");
const stepsSelect = document.getElementById("steps-select");
const swingSlider = document.getElementById("swing-slider");
const swingVal = document.getElementById("swing-val");
const waveSelect = document.getElementById("wave-select");
const noteSelect = document.getElementById("note-select");
const testSynthBtn = document.getElementById("test-synth-btn");
const previewDrumBtn = document.getElementById("preview-drum-btn");
const inspireBtn = document.getElementById("inspire-btn");
const clearBtn = document.getElementById("clear-btn");
const filterModeBtn = document.getElementById("filter-mode-btn");
const sequencerGrid = document.getElementById("sequencer-grid");
const drumKnobsContainer = document.getElementById("drum-knobs-container");
const editorTrackBadge = document.getElementById("editor-track-badge");
const editorTrackTitle = document.getElementById("editor-track-title");
const learnText = document.getElementById("learn-text");

// Populate default rack parameter values from data.js
function initRackDefaults() {
  Object.values(WAVECRAFT_DATA.rackModules).forEach((mod) => {
    mod.knobs.forEach((k) => {
      rackState.params[k.id] = k.defaultValue;
    });
  });
}

// Build distortion curve for WaveShaperNode
function makeDistortionCurve(amount) {
  const k = amount * 2.5;
  const samples = 44100;
  const curve = new Float32Array(samples);
  if (k <= 0.01) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i * 2) / samples - 1;
    }
    return curve;
  }
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// Generate synthetic room impulse response for ConvolverNode Reverb
function createReverbImpulse(ctx, duration = 1.6, decay = 2.4) {
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

// Register dedicated AnalyserNodes (active + ghost raw reference) for an instrument channel
function ensureChannelAnalyser(channelId, color) {
  if (!channelAnalysers[channelId]) {
    channelAnalysers[channelId] = {
      analyser: null,
      rawAnalyser: null,
      color: color || "#38bdf8",
      dataArray: null,
      rawDataArray: null,
      canvas: null,
      ctx: null
    };
  }
  if (color) {
    channelAnalysers[channelId].color = color;
  }

  if (audioCtx && !channelAnalysers[channelId].analyser) {
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    const rawAnalyser = audioCtx.createAnalyser();
    rawAnalyser.fftSize = 512;
    rawAnalyser.smoothingTimeConstant = 0.8;

    channelAnalysers[channelId].analyser = analyser;
    channelAnalysers[channelId].dataArray = new Uint8Array(analyser.frequencyBinCount);
    channelAnalysers[channelId].rawAnalyser = rawAnalyser;
    channelAnalysers[channelId].rawDataArray = new Uint8Array(rawAnalyser.frequencyBinCount);

    if (fxInputBus) {
      analyser.connect(fxInputBus);
    }
  }
  return channelAnalysers[channelId];
}

// Attach a DOM <canvas> element to a channel entry
function bindCanvasToChannel(channelId, canvasEl, color) {
  if (!canvasEl) return;
  ensureChannelAnalyser(channelId, color);
  channelAnalysers[channelId].canvas = canvasEl;
  channelAnalysers[channelId].ctx = canvasEl.getContext("2d");
}

// Initialize Web Audio API, per-track analysers, real-time Noise Gate follower, and Master FX Bus
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    // Reusable 1-second white noise buffer
    const bufferSize = audioCtx.sampleRate;
    noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    reverbImpulseBuffer = createReverbImpulse(audioCtx);

    // Master Effects Bus
    fxInputBus = audioCtx.createGain();
    masterBusGain = audioCtx.createGain();
    masterBusGain.gain.value = 0.9;

    // Dynamics & Grit nodes + Real-time Gate Analyser
    driveNode = audioCtx.createWaveShaper();
    driveNode.oversample = "2x";

    compressorNode = audioCtx.createDynamicsCompressor();

    gateAnalyserNode = audioCtx.createAnalyser();
    gateAnalyserNode.fftSize = 256;
    gateTimeData = new Float32Array(gateAnalyserNode.fftSize);

    gateGainNode = audioCtx.createGain();
    gateGainNode.gain.value = 1;

    // Space & Time nodes (Echo & Reverb)
    dryBusGain = audioCtx.createGain();
    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = 0.28;
    delayFeedbackGain = audioCtx.createGain();
    delayWetGain = audioCtx.createGain();

    reverbConvolver = audioCtx.createConvolver();
    reverbConvolver.buffer = reverbImpulseBuffer;
    reverbWetGain = audioCtx.createGain();

    // Wire Master FX Graph:
    // fxInputBus -> driveNode -> compressorNode -> gateAnalyserNode -> gateGainNode -> (Dry + Delay + Reverb) -> masterBusGain -> destination
    fxInputBus.connect(driveNode);
    driveNode.connect(compressorNode);
    compressorNode.connect(gateAnalyserNode);
    gateAnalyserNode.connect(gateGainNode);

    gateGainNode.connect(dryBusGain);
    dryBusGain.connect(masterBusGain);

    gateGainNode.connect(delayNode);
    delayNode.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delayNode);
    delayNode.connect(delayWetGain);
    delayWetGain.connect(masterBusGain);

    gateGainNode.connect(reverbConvolver);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(masterBusGain);

    masterBusGain.connect(audioCtx.destination);

    // Ensure channel analysers exist for synth & all drum tracks
    ensureChannelAnalyser("synth", "#38bdf8");
    const synthCanvas = document.getElementById("scope-synth");
    if (synthCanvas) bindCanvasToChannel("synth", synthCanvas, "#38bdf8");

    WAVECRAFT_DATA.tracks.forEach((t) => {
      ensureChannelAnalyser(t.id, t.color);
    });

    document.querySelectorAll("[data-scope-track]").forEach((canvasEl) => {
      const tid = canvasEl.dataset.scopeTrack;
      const trackObj = WAVECRAFT_DATA.tracks.find((tr) => tr.id === tid);
      if (trackObj) bindCanvasToChannel(tid, canvasEl, trackObj.color);
    });

    updateMasterFxParams();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (!animLoopStarted) {
    animLoopStarted = true;
    animationFrameLoop();
  }
}

// Real-Time Noise Gate Envelope Follower (attenuates quiet audio tails below dB threshold)
function updateRealtimeNoiseGate() {
  if (!audioCtx || !gateAnalyserNode || !gateGainNode) return;
  const now = audioCtx.currentTime;

  if (rackState.bypass.dynamics) {
    gateGainNode.gain.setTargetAtTime(1.0, now, 0.015);
    return;
  }

  gateAnalyserNode.getFloatTimeDomainData(gateTimeData);
  let sumSquares = 0;
  for (let i = 0; i < gateTimeData.length; i++) {
    sumSquares += gateTimeData[i] * gateTimeData[i];
  }
  const rms = Math.sqrt(sumSquares / gateTimeData.length);
  const currentDb = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
  const thresholdDb = rackState.params.gate; // -80 dB to -10 dB

  // If threshold is at the very bottom (-80 dB), keep gate open; otherwise attenuate below threshold
  if (thresholdDb <= -79 || currentDb >= thresholdDb) {
    gateGainNode.gain.setTargetAtTime(1.0, now, 0.008); // Fast open
  } else {
    gateGainNode.gain.setTargetAtTime(0.0, now, 0.045); // Smooth close on quiet tails
  }
}

// Update Dynamics & Space audio nodes whenever knobs or bypass buttons change
function updateMasterFxParams() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Module 3: Dynamics & Grit
  if (rackState.bypass.dynamics) {
    driveNode.curve = makeDistortionCurve(0);
    compressorNode.threshold.setValueAtTime(0, now);
    compressorNode.ratio.setValueAtTime(1, now);
    gateGainNode.gain.setTargetAtTime(1, now, 0.01);
  } else {
    driveNode.curve = makeDistortionCurve(rackState.params.drive);
    const compPct = rackState.params.compression / 100;
    compressorNode.threshold.setValueAtTime(-6 - compPct * 34, now);
    compressorNode.ratio.setValueAtTime(1 + compPct * 11, now);
    compressorNode.attack.setValueAtTime(0.005, now);
    compressorNode.release.setValueAtTime(0.15, now);
  }

  // Module 4: Space & Time
  if (rackState.bypass.space) {
    delayFeedbackGain.gain.setTargetAtTime(0, now, 0.01);
    delayWetGain.gain.setTargetAtTime(0, now, 0.01);
    reverbWetGain.gain.setTargetAtTime(0, now, 0.01);
  } else {
    const echoAmt = rackState.params.echo / 100;
    const revAmt = rackState.params.reverb / 100;
    delayFeedbackGain.gain.setTargetAtTime(echoAmt * 0.65, now, 0.01);
    delayWetGain.gain.setTargetAtTime(echoAmt * 0.55, now, 0.01);
    reverbWetGain.gain.setTargetAtTime(revAmt * 0.75, now, 0.01);
  }
}

// Initialize default per-drum settings and Mute/Solo flags
function initDrumSettings() {
  WAVECRAFT_DATA.tracks.forEach((track) => {
    drumSettings[track.id] = {
      presetKey: "presetA",
      ...track.soundPresets.presetA
    };
    trackMuteSolo[track.id] = { muted: false, solo: false };
  });
}

// Check whether a drum track is audible given Mute (M) and Solo (S) states
function isTrackAudible(trackId) {
  const anySolo = Object.values(trackMuteSolo).some((state) => state.solo);
  const state = trackMuteSolo[trackId];
  if (!state) return true;
  if (anySolo) return state.solo;
  return !state.muted;
}

// Play a drum hit at a precise Web Audio timestamp (when = audioCtx.currentTime if immediate)
function playDrumSound(trackId, when = null, ignoreMuteSolo = false) {
  initAudio();
  if (!ignoreMuteSolo && !isTrackAudible(trackId)) return;

  const s = drumSettings[trackId];
  if (!s || s.volume <= 0.01) return;

  const chNodes = ensureChannelAnalyser(trackId);
  const startTime = when !== null ? when : audioCtx.currentTime;
  const attack = Math.max(0.001, s.attack);
  const totalTime = attack + s.decay;

  // 1. Tone Oscillator
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = s.wave;
  osc.frequency.setValueAtTime(s.startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.endFreq), startTime + totalTime);
  oscGain.gain.value = 1 - s.noiseMix * 0.5;
  osc.connect(oscGain);

  // 2. Noise Generator
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = s.noiseMix;
  noise.connect(noiseGain);

  // 3. Amplitude Envelope (Raw pre-EQ tap goes to rawAnalyser for Ghost Waveform)
  const envGain = audioCtx.createGain();
  envGain.gain.setValueAtTime(0.0001, startTime);
  envGain.gain.linearRampToValueAtTime(s.volume, startTime + attack);
  envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime);

  // 4. 3-Band EQ Chain
  const lowCutFilter = audioCtx.createBiquadFilter();
  lowCutFilter.type = "highpass";
  lowCutFilter.frequency.setValueAtTime(s.lowCut, startTime);

  const midCutFilter = audioCtx.createBiquadFilter();
  midCutFilter.type = "peaking";
  midCutFilter.frequency.setValueAtTime(1000, startTime);
  midCutFilter.Q.setValueAtTime(1.2, startTime);
  midCutFilter.gain.setValueAtTime(s.midCut, startTime);

  const highCutFilter = audioCtx.createBiquadFilter();
  highCutFilter.type = "lowpass";
  highCutFilter.frequency.setValueAtTime(s.highCut, startTime);

  oscGain.connect(envGain);
  noiseGain.connect(envGain);

  // Tap raw un-EQ'd signal into ghost reference analyser
  if (chNodes.rawAnalyser) {
    envGain.connect(chNodes.rawAnalyser);
  }

  // Route EQ'd signal into active track analyser
  envGain.connect(lowCutFilter);
  lowCutFilter.connect(midCutFilter);
  midCutFilter.connect(highCutFilter);
  highCutFilter.connect(chNodes.analyser);

  osc.start(startTime);
  noise.start(startTime);
  osc.stop(startTime + totalTime + 0.02);
  noise.stop(startTime + totalTime + 0.02);
}

// Play a synthesizer note shaped by ADSR Envelope, Filter & LFO Modulation, Dynamics, and Space
function playSynthNote(freq = 220) {
  initAudio();
  const now = audioCtx.currentTime;
  const chNodes = ensureChannelAnalyser("synth", "#38bdf8");

  const osc = audioCtx.createOscillator();
  osc.type = waveSelect.value;
  osc.frequency.setValueAtTime(freq, now);

  // Module 1: ADSR Envelope
  const envGain = audioCtx.createGain();
  let totalNoteDuration = 0.65;

  if (rackState.bypass.adsr) {
    envGain.gain.setValueAtTime(0.32, now);
    envGain.gain.setValueAtTime(0.32, now + 0.5);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  } else {
    const { attack, decay, sustain, release } = rackState.params;
    const holdTime = 0.25;
    const peakGain = 0.42;
    const sustainGain = Math.max(0.001, peakGain * sustain);
    totalNoteDuration = attack + decay + holdTime + release;

    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakGain, now + attack);
    envGain.gain.exponentialRampToValueAtTime(sustainGain, now + attack + decay);
    envGain.gain.setValueAtTime(sustainGain, now + attack + decay + holdTime);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + totalNoteDuration);
  }

  // Raw pre-filter ghost tap (shaped by envelope so amplitude aligns with active wave)
  const rawTapGain = audioCtx.createGain();
  rawTapGain.gain.value = 1.0;
  osc.connect(rawTapGain);
  // Route raw oscillator through a parallel envelope tap to rawAnalyser
  const rawEnv = audioCtx.createGain();
  rawEnv.gain.setValueAtTime(0.0001, now);
  rawEnv.gain.linearRampToValueAtTime(0.35, now + 0.01);
  rawEnv.gain.exponentialRampToValueAtTime(0.0001, now + totalNoteDuration);
  rawTapGain.connect(rawEnv);
  if (chNodes.rawAnalyser) {
    rawEnv.connect(chNodes.rawAnalyser);
  }

  // Module 2: Filter & LFO Modulation
  let lastNode = osc;
  let lfoOsc = null;

  if (!rackState.bypass.filter) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = rackState.filterType;
    filter.frequency.setValueAtTime(rackState.params.cutoff, now);
    filter.Q.setValueAtTime(rackState.params.resonance, now);

    const modAmt = rackState.params.modDepth;
    if (modAmt > 0) {
      lfoOsc = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfoOsc.type = "sine";
      lfoOsc.frequency.setValueAtTime(1.5 + (modAmt / 100) * 8, now);
      lfoGain.gain.setValueAtTime((modAmt / 100) * (rackState.params.cutoff * 0.65), now);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfoOsc.start(now);
      lfoOsc.stop(now + totalNoteDuration + 0.05);
    }

    lastNode.connect(filter);
    lastNode = filter;
  }

  lastNode.connect(envGain);
  envGain.connect(chNodes.analyser);

  osc.start(now);
  osc.stop(now + totalNoteDuration + 0.05);
}

// Reusable Rotary Knob Builder (mouse/touch drag, scroll wheel, and double-click reset to defaultValue)
function createKnob({ label, min, max, step, value, defaultValue, unit, tip, accentColor, onChange }) {
  const resetTarget = defaultValue !== undefined ? defaultValue : value;

  const wrapper = document.createElement("div");
  wrapper.className = "knob-unit";
  if (tip) {
    wrapper.dataset.tip = `${tip} (Double-click to reset)`;
    wrapper.addEventListener("mouseenter", () => {
      learnText.textContent = wrapper.dataset.tip;
    });
  }

  const labelEl = document.createElement("span");
  labelEl.className = "knob-label";
  labelEl.textContent = label;

  const dial = document.createElement("div");
  dial.className = "knob-dial";
  if (accentColor) dial.style.borderColor = accentColor;

  const indicator = document.createElement("div");
  indicator.className = "knob-indicator";
  if (accentColor) indicator.style.backgroundColor = accentColor;
  dial.appendChild(indicator);

  const valueEl = document.createElement("span");
  valueEl.className = "knob-value";

  let currentVal = value;

  function formatDisplay(val) {
    if (unit === "%") {
      const pct = max <= 1 ? Math.round(val * 100) : Math.round(val);
      return `${pct}%`;
    }
    if (unit === "ms") return `${Math.round(val * 1000)} ms`;
    if (unit === "Hz") return val >= 1000 ? `${(val / 1000).toFixed(1)} kHz` : `${Math.round(val)} Hz`;
    if (unit === "dB") return `${val > 0 ? "+" : ""}${Math.round(val)} dB`;
    if (unit === "Q") return `${val.toFixed(1)} Q`;
    return `${val}${unit || ""}`;
  }

  function updateVisual(val) {
    const ratio = (val - min) / (max - min);
    const angle = -135 + ratio * 270;
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

  dial.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setValue(currentVal + dir * step * 2);
  });

  // Double-click any knob to smoothly snap back to its defaultValue
  dial.addEventListener("dblclick", (e) => {
    e.preventDefault();
    setValue(resetTarget);
  });

  if (label) wrapper.appendChild(labelEl);
  wrapper.appendChild(dial);
  wrapper.appendChild(valueEl);
  return wrapper;
}

// Render the 4 Color-Coded Modular Knob Rack Cards
function renderModularRack() {
  Object.entries(WAVECRAFT_DATA.rackModules).forEach(([modKey, modData]) => {
    const container = document.getElementById(`knobs-${modKey}`);
    if (!container) return;
    container.innerHTML = "";

    modData.knobs.forEach((k) => {
      const knobEl = createKnob({
        label: k.label,
        min: k.min,
        max: k.max,
        step: k.step,
        value: rackState.params[k.id],
        defaultValue: k.defaultValue,
        unit: k.unit,
        tip: k.tip,
        accentColor: modData.accent,
        onChange: (val) => {
          rackState.params[k.id] = val;
          updateMasterFxParams();
        }
      });
      container.appendChild(knobEl);
    });
  });

  // Sync bypass button visuals with rackState.bypass
  document.querySelectorAll(".bypass-btn").forEach((btn) => {
    const modKey = btn.dataset.module;
    const isBypassed = rackState.bypass[modKey];
    const card = document.getElementById(`module-${modKey}`);
    btn.textContent = isBypassed ? "OFF" : "ON";
    btn.classList.toggle("active", !isBypassed);
    if (card) card.classList.toggle("bypassed", isBypassed);
  });

  if (filterModeBtn) {
    filterModeBtn.textContent = rackState.filterType === "highpass" ? "HP" : "LP";
  }
}

// Wire modular rack bypass and filter mode buttons once on startup
function setupModularRackControls() {
  document.querySelectorAll(".bypass-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modKey = btn.dataset.module;
      const isBypassed = !rackState.bypass[modKey];
      rackState.bypass[modKey] = isBypassed;

      const card = document.getElementById(`module-${modKey}`);
      btn.textContent = isBypassed ? "OFF" : "ON";
      btn.classList.toggle("active", !isBypassed);
      if (card) card.classList.toggle("bypassed", isBypassed);

      updateMasterFxParams();
    });
  });

  if (filterModeBtn) {
    filterModeBtn.addEventListener("click", () => {
      rackState.filterType = rackState.filterType === "lowpass" ? "highpass" : "lowpass";
      filterModeBtn.textContent = rackState.filterType === "highpass" ? "HP" : "LP";
    });
  }
}

// Render the Drum Sound Editor knobs for the currently selected instrument
function renderDrumEditor() {
  const track = WAVECRAFT_DATA.tracks.find((t) => t.id === selectedTrackId);
  const settings = drumSettings[selectedTrackId];
  if (!track || !settings) return;

  const basePreset = track.soundPresets[settings.presetKey] || track.soundPresets.presetA;

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
      defaultValue: basePreset.lowCut,
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
      defaultValue: basePreset.midCut,
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
      defaultValue: basePreset.highCut,
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
      defaultValue: basePreset.attack,
      unit: "ms",
      tip: "Attack Time: controls how fast the drum hits peak volume. Low = sharp snap; High = soft fade-in.",
      onChange: (v) => { settings.attack = v; }
    }
  ];

  knobConfigs.forEach((cfg) => {
    drumKnobsContainer.appendChild(createKnob({ ...cfg, accentColor: track.color }));
  });
}

// Update muted visual dimming across all track rows
function updateMuteSoloVisuals() {
  const anySolo = Object.values(trackMuteSolo).some((s) => s.solo);
  document.querySelectorAll(".track-row").forEach((row) => {
    const tid = row.dataset.trackId;
    const st = trackMuteSolo[tid];
    if (!st) return;

    const muteBtn = row.querySelector(".mute-btn");
    const soloBtn = row.querySelector(".solo-btn");
    if (muteBtn) muteBtn.classList.toggle("active", st.muted);
    if (soloBtn) soloBtn.classList.toggle("active", st.solo);

    const dimmed = anySolo ? !st.solo : st.muted;
    row.classList.toggle("track-dimmed", dimmed);
  });
}

// Build the sequencer rows (Track Select + M/S + Preset Dropdown + Volume Knob + Oscilloscope + Steps)
function renderGrid() {
  sequencerGrid.innerHTML = "";

  WAVECRAFT_DATA.tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.dataset.trackId = track.id;
    if (track.id === selectedTrackId) row.classList.add("selected-track");

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
      document.querySelectorAll(".track-row").forEach((r) => {
        r.classList.toggle("selected-track", r.dataset.trackId === selectedTrackId);
      });
      renderDrumEditor();
    });

    // Mute (M) & Solo (S) Toggle Buttons
    const msGroup = document.createElement("div");
    msGroup.className = "ms-btn-group";

    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "ms-btn mute-btn";
    muteBtn.textContent = "M";
    muteBtn.dataset.tip = `Mute ${track.name}: silences this track without erasing its pattern.`;
    muteBtn.addEventListener("mouseenter", () => { learnText.textContent = muteBtn.dataset.tip; });
    muteBtn.addEventListener("click", () => {
      trackMuteSolo[track.id].muted = !trackMuteSolo[track.id].muted;
      updateMuteSoloVisuals();
    });

    const soloBtn = document.createElement("button");
    soloBtn.type = "button";
    soloBtn.className = "ms-btn solo-btn";
    soloBtn.textContent = "S";
    soloBtn.dataset.tip = `Solo ${track.name}: mutes all other tracks so you can hear this instrument alone.`;
    soloBtn.addEventListener("mouseenter", () => { learnText.textContent = soloBtn.dataset.tip; });
    soloBtn.addEventListener("click", () => {
      trackMuteSolo[track.id].solo = !trackMuteSolo[track.id].solo;
      updateMuteSoloVisuals();
    });

    msGroup.appendChild(muteBtn);
    msGroup.appendChild(soloBtn);

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
      document.querySelectorAll(".track-row").forEach((r) => {
        r.classList.toggle("selected-track", r.dataset.trackId === selectedTrackId);
      });
      renderDrumEditor();
      playDrumSound(track.id, null, true);
    });

    const basePreset = track.soundPresets[drumSettings[track.id].presetKey] || track.soundPresets.presetA;
    const volKnob = createKnob({
      label: "",
      min: 0,
      max: 1,
      step: 0.02,
      value: drumSettings[track.id].volume,
      defaultValue: basePreset.volume,
      unit: "%",
      tip: `${track.name} Volume: drag up/down to balance this instrument in the mix.`,
      accentColor: track.color,
      onChange: (v) => {
        drumSettings[track.id].volume = v;
      }
    });
    volKnob.classList.add("mini-knob");

    // Dedicated Individual Oscilloscope Canvas per drum track
    const scopeCanvas = document.createElement("canvas");
    scopeCanvas.className = "track-mini-scope";
    scopeCanvas.width = 90;
    scopeCanvas.height = 38;
    scopeCanvas.dataset.scopeTrack = track.id;
    scopeCanvas.dataset.tip = `${track.name} Live Oscilloscope: bright line shows EQ'd wave; faint gray shows raw signal.`;
    scopeCanvas.addEventListener("mouseenter", () => { learnText.textContent = scopeCanvas.dataset.tip; });

    bindCanvasToChannel(track.id, scopeCanvas, track.color);

    meta.appendChild(selectBtn);
    meta.appendChild(msGroup);
    meta.appendChild(presetDropdown);
    meta.appendChild(volKnob);
    meta.appendChild(scopeCanvas);
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

      // Toggle step state and DOM button styling directly without rebuilding the grid or canvases
      btn.addEventListener("click", () => {
        const isActive = gridState[track.id][step] ? 0 : 1;
        gridState[track.id][step] = isActive;
        btn.classList.toggle("active", Boolean(isActive));
        btn.style.backgroundColor = isActive ? track.color : "";
      });

      stepsContainer.appendChild(btn);
    }

    row.appendChild(stepsContainer);
    sequencerGrid.appendChild(row);
  });

  updateMuteSoloVisuals();
  drawIdleScopes();
}

// Draw clean center reference lines when audio context hasn't started yet
function drawIdleScopes() {
  Object.values(channelAnalysers).forEach((ch) => {
    if (!ch.ctx || !ch.canvas) return;
    const { ctx, canvas, color } = ch;
    ctx.fillStyle = "#090f1d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color || "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  });
}

// Helper to draw a time-domain waveform trace on a canvas
function drawWaveformTrace(ctx, dataArray, width, height, strokeStyle, lineWidth) {
  const halfHeight = height * 0.5;
  const bufferLength = dataArray.length;
  const sliceWidth = width / bufferLength;
  let x = 0;

  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * halfHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }

  ctx.lineTo(width, halfHeight);
  ctx.stroke();
}

// Single 60fps requestAnimationFrame loop handling visual step highlights, noise gate, and ghost oscilloscopes
function animationFrameLoop() {
  requestAnimationFrame(animationFrameLoop);

  if (audioCtx) {
    // 1. Update real-time Noise Gate envelope follower
    updateRealtimeNoiseGate();

    // 2. Sync visual playhead with Web Audio clock
    if (isPlaying) {
      const now = audioCtx.currentTime;
      while (visualStepQueue.length && visualStepQueue[0].time <= now) {
        const currentEvent = visualStepQueue.shift();
        if (currentEvent.step !== lastDrawnVisualStep) {
          lastDrawnVisualStep = currentEvent.step;
          document.querySelectorAll(".step-btn").forEach((btn) => {
            btn.classList.toggle("playing", Number(btn.dataset.step) === lastDrawnVisualStep);
          });
        }
      }
    }
  }

  // 3. Render all channel oscilloscopes with Ghost Reference Trace + Active Signal Trace
  const channels = Object.values(channelAnalysers);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    if (!ch.analyser || !ch.ctx || !ch.canvas) continue;

    const { analyser, rawAnalyser, ctx, canvas, color, dataArray, rawDataArray } = ch;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#090f1d";
    ctx.fillRect(0, 0, width, height);

    // Draw translucent gray "ghost" reference trace (pre-filter / pre-EQ signal)
    if (rawAnalyser && rawDataArray) {
      rawAnalyser.getByteTimeDomainData(rawDataArray);
      drawWaveformTrace(ctx, rawDataArray, width, height, "rgba(148, 163, 184, 0.32)", 1.35);
    }

    // Draw bright active processed waveform in front
    analyser.getByteTimeDomainData(dataArray);
    drawWaveformTrace(ctx, dataArray, width, height, color || "#38bdf8", 1.85);
  }
}

// Compute duration in seconds for a given step index (with Swing % applied)
function getStepDurationSeconds(stepIndex) {
  const bpm = Math.max(40, Math.min(240, Number(bpmInput.value) || 120));
  const barSec = (60 / bpm) * 4;
  const baseStepSec = barSec / stepCount;
  const swingFactor = (swingPercent / 100) * 0.5;
  const isEvenStep = stepIndex % 2 === 0;
  return isEvenStep ? baseStepSec * (1 + swingFactor) : baseStepSec * (1 - swingFactor);
}

// Schedule a single step's audio events at exact Web Audio time and queue its visual highlight
function scheduleStepEvents(stepIndex, stepTime) {
  visualStepQueue.push({ step: stepIndex, time: stepTime });

  WAVECRAFT_DATA.tracks.forEach((track) => {
    if (gridState[track.id][stepIndex]) {
      playDrumSound(track.id, stepTime, false);
    }
  });
}

// Web Audio API Lookahead Scheduler (eliminates setTimeout jitter & tab-switch drift)
function runLookaheadScheduler() {
  if (!isPlaying || !audioCtx) return;

  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    scheduleStepEvents(currentScheduleStep, nextNoteTime);
    nextNoteTime += getStepDurationSeconds(currentScheduleStep);
    currentScheduleStep = (currentScheduleStep + 1) % stepCount;
  }

  schedulerTimerId = setTimeout(runLookaheadScheduler, lookaheadMs);
}

// Start or stop the sequencer
function togglePlay() {
  initAudio();
  isPlaying = !isPlaying;

  if (isPlaying) {
    playBtn.textContent = "⏹ Stop";
    currentScheduleStep = 0;
    lastDrawnVisualStep = -1;
    visualStepQueue.length = 0;
    nextNoteTime = audioCtx.currentTime + 0.03;
    runLookaheadScheduler();
  } else {
    playBtn.textContent = "▶ Play";
    clearTimeout(schedulerTimerId);
    visualStepQueue.length = 0;
    lastDrawnVisualStep = -1;
    document.querySelectorAll(".step-btn").forEach((b) => b.classList.remove("playing"));
  }
}

// Load a pattern preset and synchronize ALL modular rack parameters
function loadPreset(presetKey) {
  const preset = WAVECRAFT_DATA.presets[presetKey];
  if (!preset) return;

  bpmInput.value = preset.bpm;
  waveSelect.value = preset.waveform;

  swingPercent = preset.swing !== undefined ? preset.swing : 0;
  swingSlider.value = swingPercent;
  swingVal.textContent = swingPercent;

  // Reset all rack knobs to defaults first, then apply preset's rackParams so no stale values remain
  initRackDefaults();
  if (preset.rackParams) {
    Object.entries(preset.rackParams).forEach(([paramKey, paramVal]) => {
      if (paramKey in rackState.params) {
        rackState.params[paramKey] = paramVal;
      }
    });
  }

  rackState.filterType = preset.filterType || "lowpass";
  Object.keys(rackState.bypass).forEach((modKey) => {
    rackState.bypass[modKey] = false;
  });

  renderModularRack();
  updateMasterFxParams();

  gridState = JSON.parse(JSON.stringify(preset.pattern));
  renderGrid();
}

// Smart Beat Randomizer ("🎲 Inspire Me"): generates a cohesive, musical groove across 32 steps
function generateSmartGroove() {
  const kick = Array(32).fill(0);
  const snare = Array(32).fill(0);
  const hihat = Array(32).fill(0);
  const clap = Array(32).fill(0);

  const grooveStyle = Math.floor(Math.random() * 3); // 0: Four-on-floor, 1: Syncopated Funk/Boom-Bap, 2: Halftime Trap/Electro

  for (let bar = 0; bar < 2; bar++) {
    const offset = bar * 16;

    // 1. Kick: Always anchored on beat 1 (step 0), plus style-appropriate syncopations
    kick[offset + 0] = 1;
    if (grooveStyle === 0) {
      // Four-on-the-floor with occasional offbeat pickup
      kick[offset + 4] = 1;
      kick[offset + 8] = 1;
      kick[offset + 12] = 1;
      if (Math.random() > 0.5) kick[offset + 14] = 1;
    } else if (grooveStyle === 1) {
      // Syncopated groove
      if (Math.random() > 0.35) kick[offset + 3] = 1;
      kick[offset + 6] = 1;
      if (Math.random() > 0.3) kick[offset + 10] = 1;
      if (Math.random() > 0.65) kick[offset + 13] = 1;
    } else {
      // Half-time bounce
      if (Math.random() > 0.3) kick[offset + 3] = 1;
      if (Math.random() > 0.4) kick[offset + 7] = 1;
      kick[offset + 10] = 1;
    }

    // 2. Snare: Crisp backbeats on 2 & 4 (steps 4 and 12) + occasional ghost note
    if (grooveStyle === 2) {
      snare[offset + 8] = 1;
      if (Math.random() > 0.5) snare[offset + 14] = 1;
    } else {
      snare[offset + 4] = 1;
      snare[offset + 12] = 1;
      if (Math.random() > 0.6) snare[offset + 15] = 1;
    }

    // 3. Hi-Hat: Steady rhythmic pulse (8ths or 16ths) with varied accents
    const hatDensity = Math.random();
    for (let s = 0; s < 16; s++) {
      if (hatDensity < 0.35) {
        // Offbeat hats
        hihat[offset + s] = s % 4 === 2 ? 1 : 0;
      } else if (hatDensity < 0.75) {
        // Driving 8th notes + occasional 16th roll
        hihat[offset + s] = s % 2 === 0 || (s >= 12 && Math.random() > 0.45) ? 1 : 0;
      } else {
        // Busy 16th hats with occasional breath
        hihat[offset + s] = Math.random() > 0.15 ? 1 : 0;
      }
    }

    // 4. Clap: Layers on beat 4 or adds percussive fills
    if (Math.random() > 0.35) {
      clap[offset + 12] = 1;
    }
    if (Math.random() > 0.55) {
      clap[offset + 4] = 1;
    }
    if (Math.random() > 0.65) {
      clap[offset + 14] = 1;
    }
  }

  gridState = { kick, snare, hihat, clap };
  renderGrid();
  learnText.textContent = "🎲 Generated a fresh groove! Try adjusting Swing %, Mute/Solo, or the Modular FX rack to make it yours.";
}

// Setup QWERTY Keyboard Playability (Spacebar, 1-4 Drums, A-K C-Major Synth Scale)
function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    // Spacebar: Play / Stop sequencer
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
      return;
    }

    // Keys 1, 2, 3, 4: Trigger Kick, Snare, Closed Hat, Clap live
    if (DRUM_KEY_MAP[key]) {
      e.preventDefault();
      const trackId = DRUM_KEY_MAP[key];
      playDrumSound(trackId, null, true);
      return;
    }

    // Keys A, S, D, F, G, H, J, K: Play C-Major scale on Wave Synthesizer
    if (SYNTH_KEY_MAP[key]) {
      e.preventDefault();
      const freq = SYNTH_KEY_MAP[key];
      playSynthNote(freq);
    }
  });
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
  initRackDefaults();
  initDrumSettings();

  const synthCanvas = document.getElementById("scope-synth");
  if (synthCanvas) bindCanvasToChannel("synth", synthCanvas, "#38bdf8");

  Object.entries(WAVECRAFT_DATA.presets).forEach(([key, preset]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = preset.name;
    presetSelect.appendChild(opt);
  });

  playBtn.addEventListener("click", togglePlay);
  testSynthBtn.addEventListener("click", () => {
    const noteFreq = parseFloat(noteSelect.value) || 220;
    playSynthNote(noteFreq);
  });
  previewDrumBtn.addEventListener("click", () => playDrumSound(selectedTrackId, null, true));
  presetSelect.addEventListener("change", (e) => loadPreset(e.target.value));
  inspireBtn.addEventListener("click", generateSmartGroove);

  stepsSelect.addEventListener("change", (e) => {
    stepCount = Number(e.target.value);
    if (currentScheduleStep >= stepCount) currentScheduleStep = 0;
    renderGrid();
  });

  swingSlider.addEventListener("input", () => {
    swingPercent = Number(swingSlider.value);
    swingVal.textContent = swingPercent;
  });

  clearBtn.addEventListener("click", () => {
    WAVECRAFT_DATA.tracks.forEach((t) => {
      gridState[t.id] = Array(32).fill(0);
    });
    renderGrid();
  });

  setupTooltips();
  setupModularRackControls();
  setupKeyboardShortcuts();
  renderModularRack();
  renderDrumEditor();
  loadPreset("basicRock");
}

startApp();