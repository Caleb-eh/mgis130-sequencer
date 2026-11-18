// 2_script/script.js
// PROCESSING & PRESENTATION: Web Audio API modular effects rack, rotary knobs, and per-track oscilloscopes.

let audioCtx = null;
let noiseBuffer = null;
let reverbImpulseBuffer = null;
let isPlaying = false;
let currentStep = 0;
let stepTimeoutId = null;

// Dedicated per-channel AnalyserNodes & Canvas registry
const channelAnalysers = {}; // { synth: { analyser, canvas, ctx, color, dataArray }, kick: ..., ... }
let scopeLoopStarted = false;

// Master & FX Audio Nodes
let masterBusGain = null;
let fxInputBus = null;
let driveNode = null;
let compressorNode = null;
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

// Modular Rack Parameter State & Bypass Flags
const rackState = {
  filterType: "lowpass", // "lowpass" or "highpass"
  bypass: {
    adsr: false,
    filter: false,
    dynamics: false,
    space: false
  },
  params: {}
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

// Register a dedicated AnalyserNode for an individual instrument channel
function ensureChannelAnalyser(channelId, color) {
  if (!audioCtx) return null;
  if (!channelAnalysers[channelId]) {
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    channelAnalysers[channelId] = {
      analyser,
      color,
      dataArray: new Uint8Array(analyser.frequencyBinCount),
      canvas: null,
      ctx: null
    };
  }
  return channelAnalysers[channelId].analyser;
}

// Attach a DOM <canvas> element to an existing channel analyser
function bindCanvasToChannel(channelId, canvasEl, color) {
  if (!canvasEl) return;
  if (audioCtx) ensureChannelAnalyser(channelId, color);
  if (!channelAnalysers[channelId]) {
    channelAnalysers[channelId] = {
      analyser: null,
      color,
      dataArray: null,
      canvas: canvasEl,
      ctx: canvasEl.getContext("2d")
    };
  } else {
    channelAnalysers[channelId].canvas = canvasEl;
    channelAnalysers[channelId].ctx = canvasEl.getContext("2d");
    channelAnalysers[channelId].color = color;
  }
}

// Initialize Web Audio API, per-track analysers, and the Master Effects Bus
function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    // Reusable 1-second noise buffer
    const bufferSize = audioCtx.sampleRate;
    noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    reverbImpulseBuffer = createReverbImpulse(audioCtx);

    // Build Master Effects Bus (Dynamics & Grit + Space & Time)
    fxInputBus = audioCtx.createGain();
    masterBusGain = audioCtx.createGain();
    masterBusGain.gain.value = 0.9;

    // Dynamics & Grit nodes
    driveNode = audioCtx.createWaveShaper();
    driveNode.oversample = "2x";

    compressorNode = audioCtx.createDynamicsCompressor();
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
    // fxInputBus -> driveNode -> compressorNode -> gateGainNode -> (Dry + Delay + Reverb) -> masterBusGain -> destination
    fxInputBus.connect(driveNode);
    driveNode.connect(compressorNode);
    compressorNode.connect(gateGainNode);

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

    // Create dedicated channel analysers for synth and every drum track
    ensureChannelAnalyser("synth", "#38bdf8");
    const synthCanvas = document.getElementById("scope-synth");
    if (synthCanvas) bindCanvasToChannel("synth", synthCanvas, "#38bdf8");
    channelAnalysers.synth.analyser.connect(fxInputBus);

    WAVECRAFT_DATA.tracks.forEach((t) => {
      const an = ensureChannelAnalyser(t.id, t.color);
      an.connect(fxInputBus);
    });

    // Re-bind any already-rendered drum canvases
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

  if (!scopeLoopStarted) {
    scopeLoopStarted = true;
    renderAllOscilloscopes();
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
    compressorNode.threshold.setValueAtTime(-6 - compPct * 34, now); // -6 dB to -40 dB
    compressorNode.ratio.setValueAtTime(1 + compPct * 11, now); // 1:1 to 12:1
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

// Initialize default per-drum settings from presetA
function initDrumSettings() {
  WAVECRAFT_DATA.tracks.forEach((track) => {
    drumSettings[track.id] = {
      presetKey: "presetA",
      ...track.soundPresets.presetA
    };
  });
}

// Play a drum hit routed through its own dedicated AnalyserNode before hitting the master bus
function playDrumSound(trackId) {
  initAudio();
  const s = drumSettings[trackId];
  if (!s || s.volume <= 0.01) return;

  const trackAnalyser = ensureChannelAnalyser(trackId, "#38bdf8");
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

  // 2. Noise Generator
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = s.noiseMix;
  noise.connect(noiseGain);

  // 3. Amplitude Envelope
  const envGain = audioCtx.createGain();
  envGain.gain.setValueAtTime(0.0001, now);
  envGain.gain.linearRampToValueAtTime(s.volume, now + attack);
  envGain.gain.exponentialRampToValueAtTime(0.0001, now + totalTime);

  // 4. 3-Band EQ Chain
  const lowCutFilter = audioCtx.createBiquadFilter();
  lowCutFilter.type = "highpass";
  lowCutFilter.frequency.setValueAtTime(s.lowCut, now);

  const midCutFilter = audioCtx.createBiquadFilter();
  midCutFilter.type = "peaking";
  midCutFilter.frequency.setValueAtTime(1000, now);
  midCutFilter.Q.setValueAtTime(1.2, now);
  midCutFilter.gain.setValueAtTime(s.midCut, now);

  const highCutFilter = audioCtx.createBiquadFilter();
  highCutFilter.type = "lowpass";
  highCutFilter.frequency.setValueAtTime(s.highCut, now);

  // Route into this drum track's individual AnalyserNode
  oscGain.connect(envGain);
  noiseGain.connect(envGain);
  envGain.connect(lowCutFilter);
  lowCutFilter.connect(midCutFilter);
  midCutFilter.connect(highCutFilter);
  highCutFilter.connect(trackAnalyser);

  osc.start(now);
  noise.start(now);
  osc.stop(now + totalTime + 0.02);
  noise.stop(now + totalTime + 0.02);
}

// Play a synthesizer note shaped by ADSR Envelope, Filter & LFO Modulation, Dynamics, and Space
function playSynthNote(freq = 220) {
  initAudio();
  const now = audioCtx.currentTime;
  const synthAnalyser = ensureChannelAnalyser("synth", "#38bdf8");

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

  // Module 2: Filter & LFO Modulation
  let lastNode = osc;
  let lfoOsc = null;

  if (!rackState.bypass.filter) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = rackState.filterType;
    filter.frequency.setValueAtTime(rackState.params.cutoff, now);
    filter.Q.setValueAtTime(rackState.params.resonance, now);

    // LFO modulating Filter Cutoff
    const modAmt = rackState.params.modDepth;
    if (modAmt > 0) {
      lfoOsc = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfoOsc.type = "sine";
      lfoOsc.frequency.setValueAtTime(1.5 + (modAmt / 100) * 8, now); // 1.5 Hz to 9.5 Hz
      lfoGain.gain.setValueAtTime((modAmt / 100) * (rackState.params.cutoff * 0.65), now);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfoOsc.start(now);
      lfoOsc.stop(now + totalNoteDuration + 0.05);
    }

    lastNode.connect(filter);
    lastNode = filter;
  }

  // Module 3: Noise Gate threshold tail trim on synth voice
  if (!rackState.bypass.dynamics) {
    const gateDb = rackState.params.gate;
    if (gateDb > -65) {
      const gateFactor = Math.max(0.15, 1 - (gateDb + 65) / 65);
      totalNoteDuration *= gateFactor;
    }
  }

  lastNode.connect(envGain);
  envGain.connect(synthAnalyser);

  osc.start(now);
  osc.stop(now + totalNoteDuration + 0.05);
}

// Reusable Rotary Knob Builder (supports mouse/touch drag up/down and scroll wheel)
function createKnob({ label, min, max, step, value, unit, tip, accentColor, onChange }) {
  const wrapper = document.createElement("div");
  wrapper.className = "knob-unit";
  if (tip) {
    wrapper.dataset.tip = tip;
    wrapper.addEventListener("mouseenter", () => {
      learnText.textContent = tip;
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

  // Label above knob, dial in middle, live numeric value below
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

  // Setup Bypass buttons on each module card
  document.querySelectorAll(".bypass-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modKey = btn.dataset.module;
      const isBypassed = !rackState.bypass[modKey];
      rackState.bypass[modKey] = isBypassed;

      const card = document.getElementById(`module-${modKey}`);
      if (isBypassed) {
        btn.textContent = "OFF";
        btn.classList.remove("active");
        if (card) card.classList.add("bypassed");
      } else {
        btn.textContent = "ON";
        btn.classList.add("active");
        if (card) card.classList.remove("bypassed");
      }
      updateMasterFxParams();
    });
  });

  // Setup Low-Pass / High-Pass filter mode toggle
  if (filterModeBtn) {
    filterModeBtn.addEventListener("click", () => {
      if (rackState.filterType === "lowpass") {
        rackState.filterType = "highpass";
        filterModeBtn.textContent = "HP";
        filterModeBtn.title = "High-Pass Filter Mode";
      } else {
        rackState.filterType = "lowpass";
        filterModeBtn.textContent = "LP";
        filterModeBtn.title = "Low-Pass Filter Mode";
      }
    });
  }
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

// Build the sequencer rows (Track Select + Preset Dropdown + Volume Knob + Individual Live Oscilloscope + Steps)
function renderGrid() {
  sequencerGrid.innerHTML = "";

  WAVECRAFT_DATA.tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row";
    if (track.id === selectedTrackId) row.classList.add("selected-track");

    // Left track info, controls, and individual live oscilloscope
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

    // Dedicated Individual Oscilloscope Canvas per drum track
    const scopeCanvas = document.createElement("canvas");
    scopeCanvas.className = "track-mini-scope";
    scopeCanvas.width = 96;
    scopeCanvas.height = 38;
    scopeCanvas.dataset.scopeTrack = track.id;
    scopeCanvas.dataset.tip = `${track.name} Live Oscilloscope: visualizes this individual track's waveform in real time.`;
    scopeCanvas.addEventListener("mouseenter", () => { learnText.textContent = scopeCanvas.dataset.tip; });

    bindCanvasToChannel(track.id, scopeCanvas, track.color);

    meta.appendChild(selectBtn);
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

      btn.addEventListener("click", () => {
        gridState[track.id][step] = gridState[track.id][step] ? 0 : 1;
        renderGrid();
      });

      stepsContainer.appendChild(btn);
    }

    row.appendChild(stepsContainer);
    sequencerGrid.appendChild(row);
  });

  // Draw initial flat centerlines on canvases before audio starts
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

// Optimized single 60fps requestAnimationFrame loop for all individual channel oscilloscopes
function renderAllOscilloscopes() {
  requestAnimationFrame(renderAllOscilloscopes);

  const channels = Object.values(channelAnalysers);
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    if (!ch.analyser || !ch.ctx || !ch.canvas) continue;

    const { analyser, ctx, canvas, color, dataArray } = ch;
    const width = canvas.width;
    const height = canvas.height;
    const halfHeight = height * 0.5;

    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = "#090f1d";
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1.75;
    ctx.strokeStyle = color || "#38bdf8";
    ctx.beginPath();

    const bufferLength = dataArray.length;
    const sliceWidth = width / bufferLength;
    let x = 0;

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

  const barMs = (60 / Number(bpmInput.value)) * 4 * 1000;
  const baseStepMs = barMs / stepCount;

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
  rackState.params.cutoff = preset.cutoff;
  rackState.params.release = preset.release;
  renderModularRack();
  updateMasterFxParams();

  gridState = JSON.parse(JSON.stringify(preset.pattern));
  renderGrid();
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

  // Bind top synth canvas before audio starts so idle line draws cleanly
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

  clearBtn.addEventListener("click", () => {
    WAVECRAFT_DATA.tracks.forEach((t) => {
      gridState[t.id] = Array(32).fill(0);
    });
    renderGrid();
  });

  setupTooltips();
  renderModularRack();
  renderDrumEditor();
  loadPreset("basicRock");
}

startApp();