// 2_script/script.js
// PROCESSING & PRESENTATION: Lookahead scheduler, dry metronome, Pitch/Detune twin oscillator,
// 3-Band EQ BiquadFilterNode chain, Live EQ Frequency Response + Spectrum Visualizer, and static wave previews.

let audioCtx = null;
let noiseBuffer = null;
let reverbImpulseBuffer = null;
let isPlaying = false;
let metronomeEnabled = false;

// Lookahead Web Audio Scheduler state
let currentScheduleStep = 0;
let nextNoteTime = 0.0;
let schedulerTimerId = null;
const lookaheadMs = 25.0;
const scheduleAheadTime = 0.1;
const visualStepQueue = [];
let lastDrawnVisualStep = -1;

// Master, 3-Band EQ & FX Audio Nodes
let masterBusGain = null;
let eqBassFilter = null;
let eqMidFilter = null;
let eqTrebleFilter = null;
let eqSpectrumAnalyser = null;
let eqSpectrumData = null;

let sharedFxInputBus = null; // 3-Band EQ -> Drive -> Compressor -> Noise Gate -> Master
let driveNode = null;
let compressorNode = null;
let gateAnalyserNode = null;
let gateTimeData = null;
let gateGainNode = null;

// Synth-Isolated Space & Time Nodes (Echo & Reverb affect ONLY the Wave Synthesizer)
let synthSpaceInputBus = null;
let synthDryGain = null;
let delayNode = null;
let delayFeedbackGain = null;
let delayWetGain = null;
let reverbConvolver = null;
let reverbWetGain = null;

// Static Waveform Canvas & Scrubbing Playhead Registry
const channelVisuals = {}; // { synth: { canvas, ctx, color, wavePoints, playhead }, kick: {...}, ... }
let eqCanvas = null;
let eqCtx = null;
let animLoopStarted = false;

// Precomputed Logarithmic Frequency Array (20 Hz to 20,000 Hz) for EQ Response Curve
const EQ_GRAPH_POINTS = 160;
const eqFreqArray = new Float32Array(EQ_GRAPH_POINTS);
for (let i = 0; i < EQ_GRAPH_POINTS; i++) {
  const norm = i / (EQ_GRAPH_POINTS - 1);
  eqFreqArray[i] = 20 * Math.pow(1000, norm); // 20 Hz -> 20,000 Hz
}

// Sequencer & Drum Settings State
let stepCount = 16;
let swingPercent = 0;
let selectedTrackId = "kick";
let gridState = {};
let drumSettings = {};
const trackMuteSolo = {};

// Modular Rack Parameter State & Bypass Flags
const rackState = {
  filterType: "lowpass",
  bypass: {
    tuning: false,
    adsr: false,
    filter: false,
    eq: false,
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

// DOM References
const playBtn = document.getElementById("play-btn");
const metroBtn = document.getElementById("metro-btn");
const bpmInput = document.getElementById("bpm-input");
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

// Interactive Sound Design Guide DOM elements
const learnTitle = document.getElementById("learn-title");
const learnWhat = document.getElementById("learn-what");
const learnListen = document.getElementById("learn-listen");
const learnWatch = document.getElementById("learn-watch");

// Update the 3-part Interactive Sound Design Guide
function updateSoundDesignGuide({ title, what, listen, watch }) {
  if (learnTitle && title) learnTitle.textContent = title;
  if (learnWhat && what) learnWhat.textContent = what;
  if (learnListen && listen) learnListen.textContent = listen;
  if (learnWatch && watch) watch.textContent = watch;
}

// Populate default rack parameter values from data.js
function initRackDefaults() {
  Object.values(WAVECRAFT_DATA.rackModules).forEach((mod) => {
    mod.knobs.forEach((k) => {
      rackState.params[k.id] = k.defaultValue;
    });
  });
}

// Exaggerated Hard-Knee / Soft-Clip Distortion Curve for unmistakable grit & wave squaring
function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  if (amount <= 0.5) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i * 2) / samples - 1;
    }
    return curve;
  }
  const driveGain = 1 + (amount / 100) * 18;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * driveGain) / Math.tanh(driveGain * 0.85);
    curve[i] = Math.max(-1, Math.min(1, curve[i]));
  }
  return curve;
}

// Generate synthetic hall impulse response for ConvolverNode Reverb
function createReverbImpulse(ctx, duration = 2.1, decay = 2.0) {
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

// Initialize Web Audio API with 3-Band EQ BiquadFilterNode stages, Spectrum Analyser & Isolated Space Bus
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

    masterBusGain = audioCtx.createGain();
    masterBusGain.gain.value = 0.9;
    masterBusGain.connect(audioCtx.destination);

    // 1. SYNTH-ONLY SPACE & TIME BUS (Echo + Reverb affect ONLY the synthesizer)
    synthSpaceInputBus = audioCtx.createGain();
    synthDryGain = audioCtx.createGain();
    synthDryGain.gain.value = 1.0;

    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = 0.28;
    delayFeedbackGain = audioCtx.createGain();
    delayWetGain = audioCtx.createGain();

    reverbConvolver = audioCtx.createConvolver();
    reverbConvolver.buffer = reverbImpulseBuffer;
    reverbWetGain = audioCtx.createGain();

    // 2. SHARED 3-BAND EQUALIZER + DYNAMICS & GRIT BUS
    sharedFxInputBus = audioCtx.createGain();

    eqBassFilter = audioCtx.createBiquadFilter();
    eqBassFilter.type = "lowshelf";
    eqBassFilter.frequency.value = 120;

    eqMidFilter = audioCtx.createBiquadFilter();
    eqMidFilter.type = "peaking";
    eqMidFilter.frequency.value = 1000;
    eqMidFilter.Q.value = 1.1;

    eqTrebleFilter = audioCtx.createBiquadFilter();
    eqTrebleFilter.type = "highshelf";
    eqTrebleFilter.frequency.value = 4500;

    driveNode = audioCtx.createWaveShaper();
    driveNode.oversample = "2x";

    compressorNode = audioCtx.createDynamicsCompressor();

    gateAnalyserNode = audioCtx.createAnalyser();
    gateAnalyserNode.fftSize = 256;
    gateTimeData = new Float32Array(gateAnalyserNode.fftSize);

    gateGainNode = audioCtx.createGain();
    gateGainNode.gain.value = 1.0;

    // Post-EQ Spectrum Analyser for the Live EQ Visualizer
    eqSpectrumAnalyser = audioCtx.createAnalyser();
    eqSpectrumAnalyser.fftSize = 512;
    eqSpectrumAnalyser.smoothingTimeConstant = 0.82;
    eqSpectrumData = new Uint8Array(eqSpectrumAnalyser.frequencyBinCount);

    // Wire Synth Space Bus -> Shared EQ/Dynamics Bus
    synthSpaceInputBus.connect(synthDryGain);
    synthDryGain.connect(sharedFxInputBus);

    synthSpaceInputBus.connect(delayNode);
    delayNode.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delayNode);
    delayNode.connect(delayWetGain);
    delayWetGain.connect(sharedFxInputBus);

    synthSpaceInputBus.connect(reverbConvolver);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(sharedFxInputBus);

    // Wire Shared Bus -> 3-Band EQ (Bass -> Mid -> Treble) -> Drive -> Compressor -> Gate -> Spectrum -> Master
    sharedFxInputBus.connect(eqBassFilter);
    eqBassFilter.connect(eqMidFilter);
    eqMidFilter.connect(eqTrebleFilter);
    eqTrebleFilter.connect(driveNode);
    driveNode.connect(compressorNode);
    compressorNode.connect(gateAnalyserNode);
    gateAnalyserNode.connect(gateGainNode);
    gateGainNode.connect(eqSpectrumAnalyser);
    eqSpectrumAnalyser.connect(masterBusGain);

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

// Real-Time Noise Gate Envelope Follower
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
  const thresholdDb = rackState.params.gate;

  if (thresholdDb <= -79 || currentDb >= thresholdDb) {
    gateGainNode.gain.setTargetAtTime(1.0, now, 0.006);
  } else {
    gateGainNode.gain.setTargetAtTime(0.0, now, 0.025);
  }
}

// Update 3-Band EQ, Dynamics & Synth-Only Space audio nodes whenever knobs or bypass buttons change
function updateMasterFxParams() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Module 4: 3-Band Equalizer (Bass 120Hz, Mid 1000Hz, Treble 4500Hz)
  if (eqBassFilter && eqMidFilter && eqTrebleFilter) {
    if (rackState.bypass.eq) {
      eqBassFilter.gain.setTargetAtTime(0, now, 0.015);
      eqMidFilter.gain.setTargetAtTime(0, now, 0.015);
      eqTrebleFilter.gain.setTargetAtTime(0, now, 0.015);
    } else {
      eqBassFilter.gain.setTargetAtTime(rackState.params.eqBass, now, 0.015);
      eqMidFilter.gain.setTargetAtTime(rackState.params.eqMid, now, 0.015);
      eqTrebleFilter.gain.setTargetAtTime(rackState.params.eqTreble, now, 0.015);
    }
  }

  // Module 5: Dynamics & Grit
  if (rackState.bypass.dynamics) {
    driveNode.curve = makeDistortionCurve(0);
    compressorNode.threshold.setValueAtTime(0, now);
    compressorNode.ratio.setValueAtTime(1, now);
    gateGainNode.gain.setTargetAtTime(1, now, 0.01);
  } else {
    driveNode.curve = makeDistortionCurve(rackState.params.drive);
    const compPct = rackState.params.compression / 100;
    compressorNode.threshold.setValueAtTime(-4 - compPct * 42, now);
    compressorNode.ratio.setValueAtTime(1 + compPct * 15, now);
    compressorNode.attack.setValueAtTime(0.004, now);
    compressorNode.release.setValueAtTime(0.14, now);
  }

  // Module 6: Space & Time (Synth Only)
  if (rackState.bypass.space) {
    delayFeedbackGain.gain.setTargetAtTime(0, now, 0.01);
    delayWetGain.gain.setTargetAtTime(0, now, 0.01);
    reverbWetGain.gain.setTargetAtTime(0, now, 0.01);
  } else {
    const echoAmt = rackState.params.echo / 100;
    const revAmt = rackState.params.reverb / 100;
    delayFeedbackGain.gain.setTargetAtTime(echoAmt * 0.68, now, 0.01);
    delayWetGain.gain.setTargetAtTime(echoAmt * 0.65, now, 0.01);
    reverbWetGain.gain.setTargetAtTime(revAmt * 0.85, now, 0.01);
  }
}

// Synthesize crisp dry woodblock metronome click routed directly to masterBusGain (unaffected by FX)
function playMetronomeClick(when, isBeatOne) {
  if (!audioCtx || !metronomeEnabled) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  const startFreq = isBeatOne ? 1320 : 880;
  osc.frequency.setValueAtTime(startFreq, when);
  osc.frequency.exponentialRampToValueAtTime(startFreq * 0.55, when + 0.035);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(isBeatOne ? 0.34 : 0.22, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);

  osc.connect(gain);
  gain.connect(masterBusGain);

  osc.start(when);
  osc.stop(when + 0.05);
}

// ============================================================================
// LIVE EQ FREQUENCY RESPONSE + SPECTRUM VISUALIZER
// ============================================================================

// Compute accurate biquad dB response (uses Web Audio getFrequencyResponse when initialized, or exact biquad math before audio starts)
function computeCombinedEqResponseDb() {
  const totalDb = new Float32Array(EQ_GRAPH_POINTS);

  // If Web Audio nodes exist, use native Web Audio API getFrequencyResponse()!
  if (audioCtx && eqBassFilter && eqMidFilter && eqTrebleFilter) {
    const magBass = new Float32Array(EQ_GRAPH_POINTS);
    const magMid = new Float32Array(EQ_GRAPH_POINTS);
    const magTreble = new Float32Array(EQ_GRAPH_POINTS);
    const phaseDummy = new Float32Array(EQ_GRAPH_POINTS);

    eqBassFilter.getFrequencyResponse(eqFreqArray, magBass, phaseDummy);
    eqMidFilter.getFrequencyResponse(eqFreqArray, magMid, phaseDummy);
    eqTrebleFilter.getFrequencyResponse(eqFreqArray, magTreble, phaseDummy);

    // Also include synth Filter Cutoff & Resonance preview if Filter module is active
    let magSynthFilter = null;
    if (!rackState.bypass.filter) {
      const tempFilter = audioCtx.createBiquadFilter();
      tempFilter.type = rackState.filterType;
      tempFilter.frequency.value = rackState.params.cutoff;
      tempFilter.Q.value = rackState.params.resonance;
      magSynthFilter = new Float32Array(EQ_GRAPH_POINTS);
      tempFilter.getFrequencyResponse(eqFreqArray, magSynthFilter, phaseDummy);
    }

    for (let i = 0; i < EQ_GRAPH_POINTS; i++) {
      let combinedMag = magBass[i] * magMid[i] * magTreble[i];
      if (magSynthFilter) {
        // Blend synth filter response gently so EQ curve remains clear while showing resonant peak
        combinedMag *= Math.pow(magSynthFilter[i], 0.45);
      }
      const db = 20 * Math.log10(Math.max(0.0001, combinedMag));
      totalDb[i] = Math.max(-22, Math.min(22, db));
    }
    return totalDb;
  }

  // Fallback analytical biquad curve before first audio click so turning knobs updates graph immediately
  const bassGain = rackState.bypass.eq ? 0 : rackState.params.eqBass;
  const midGain = rackState.bypass.eq ? 0 : rackState.params.eqMid;
  const trebleGain = rackState.bypass.eq ? 0 : rackState.params.eqTreble;

  for (let i = 0; i < EQ_GRAPH_POINTS; i++) {
    const f = eqFreqArray[i];
    // Low shelf ~120 Hz
    const bassShelf = bassGain / (1 + Math.pow(f / 120, 2));
    // Peaking bell ~1000 Hz
    const logDist = Math.log2(f / 1000);
    const midBell = midGain * Math.exp(-0.5 * Math.pow(logDist / 0.65, 2));
    // High shelf ~4500 Hz
    const trebleShelf = trebleGain / (1 + Math.pow(4500 / f, 2));

    let db = bassShelf + midBell + trebleShelf;

    // Optional filter curve preview
    if (!rackState.bypass.filter) {
      const fc = rackState.params.cutoff;
      const qBoost = Math.min(10, (rackState.params.resonance - 0.5) * 0.35);
      const resPeak = qBoost * Math.exp(-0.5 * Math.pow(Math.log2(f / fc) / 0.22, 2));
      if (rackState.filterType === "lowpass" && f > fc) {
        db -= Math.min(16, 12 * Math.log2(f / fc));
      } else if (rackState.filterType === "highpass" && f < fc) {
        db -= Math.min(16, 12 * Math.log2(fc / f));
      }
      db += resPeak * 0.55;
    }

    totalDb[i] = Math.max(-22, Math.min(22, db));
  }
  return totalDb;
}

function drawEqVisualizer() {
  if (!eqCtx || !eqCanvas) return;
  const w = eqCanvas.width;
  const h = eqCanvas.height;
  const midY = h * 0.5;

  // Phosphor screen background
  eqCtx.fillStyle = "#06110e";
  eqCtx.fillRect(0, 0, w, h);

  // Subtle horizontal & vertical frequency grid lines
  eqCtx.strokeStyle = "rgba(45, 212, 191, 0.14)";
  eqCtx.lineWidth = 1;

  // 0 dB center line
  eqCtx.beginPath();
  eqCtx.moveTo(0, midY);
  eqCtx.lineTo(w, midY);
  eqCtx.stroke();

  // +12 dB and -12 dB guide lines
  const topGuide = midY - (12 / 22) * (midY - 6);
  const botGuide = midY + (12 / 22) * (midY - 6);
  eqCtx.setLineDash([2, 3]);
  eqCtx.beginPath();
  eqCtx.moveTo(0, topGuide);
  eqCtx.lineTo(w, topGuide);
  eqCtx.moveTo(0, botGuide);
  eqCtx.lineTo(w, botGuide);
  eqCtx.stroke();
  eqCtx.setLineDash([]);

  // Logarithmic frequency vertical markers: 100 Hz, 1 kHz, 10 kHz
  const markers = [
    { freq: 100, label: "100" },
    { freq: 1000, label: "1k" },
    { freq: 10000, label: "10k" }
  ];

  eqCtx.font = "9px monospace";
  eqCtx.fillStyle = "rgba(153, 246, 228, 0.55)";

  markers.forEach((m) => {
    const xPos = (Math.log10(m.freq / 20) / 3) * w;
    eqCtx.strokeStyle = "rgba(45, 212, 191, 0.14)";
    eqCtx.beginPath();
    eqCtx.moveTo(xPos, 0);
    eqCtx.lineTo(xPos, h);
    eqCtx.stroke();
    eqCtx.fillText(m.label, Math.min(w - 20, xPos + 2), h - 3);
  });

  // 1. Live Frequency Spectrum Bars behind the EQ curve when audio is playing
  if (audioCtx && eqSpectrumAnalyser && eqSpectrumData) {
    eqSpectrumAnalyser.getByteFrequencyData(eqSpectrumData);
    const nyquist = audioCtx.sampleRate / 2;
    const binCount = eqSpectrumData.length;
    const barCount = 44;

    for (let b = 0; b < barCount; b++) {
      const fLow = 20 * Math.pow(1000, b / barCount);
      const fHigh = 20 * Math.pow(1000, (b + 1) / barCount);
      const idxLow = Math.max(1, Math.floor((fLow / nyquist) * binCount));
      const idxHigh = Math.min(binCount - 1, Math.max(idxLow, Math.floor((fHigh / nyquist) * binCount)));

      let peakVal = 0;
      for (let k = idxLow; k <= idxHigh; k++) {
        if (eqSpectrumData[k] > peakVal) peakVal = eqSpectrumData[k];
      }

      if (peakVal > 2) {
        const barH = (peakVal / 255) * (h - 6);
        const bx = (b / barCount) * w;
        const bw = Math.max(2, w / barCount - 1.5);
        eqCtx.fillStyle = "rgba(45, 212, 191, 0.24)";
        eqCtx.fillRect(bx, h - barH, bw, barH);
      }
    }
  }

  // 2. Glowing Amber/Phosphor EQ Response Curve
  const dbPoints = computeCombinedEqResponseDb();

  eqCtx.save();
  eqCtx.strokeStyle = "#f59e0b";
  eqCtx.shadowColor = "#ea580c";
  eqCtx.shadowBlur = 7;
  eqCtx.lineWidth = 2;
  eqCtx.beginPath();

  for (let i = 0; i < EQ_GRAPH_POINTS; i++) {
    const x = (i / (EQ_GRAPH_POINTS - 1)) * w;
    const y = midY - (dbPoints[i] / 22) * (midY - 6);
    if (i === 0) eqCtx.moveTo(x, y);
    else eqCtx.lineTo(x, y);
  }
  eqCtx.stroke();

  // Subtle translucent fill between EQ curve and 0 dB center line
  eqCtx.lineTo(w, midY);
  eqCtx.lineTo(0, midY);
  eqCtx.closePath();
  eqCtx.fillStyle = "rgba(245, 158, 11, 0.14)";
  eqCtx.fill();
  eqCtx.restore();
}

// ============================================================================
// STATIC WAVEFORM PREVIEW GENERATOR + LIVE SCRUBBING PLAYHEAD ENGINE
// ============================================================================

function registerChannelCanvas(channelId, canvasEl, color) {
  if (!canvasEl) return;
  if (!channelVisuals[channelId]) {
    channelVisuals[channelId] = {
      canvas: canvasEl,
      ctx: canvasEl.getContext("2d"),
      color: color || "#2dd4bf",
      wavePoints: [],
      playhead: null
    };
  } else {
    channelVisuals[channelId].canvas = canvasEl;
    channelVisuals[channelId].ctx = canvasEl.getContext("2d");
    if (color) channelVisuals[channelId].color = color;
  }
  recalculateStaticWaveform(channelId);
}

function triggerWaveformPlayhead(channelId, startTime, durationSec) {
  const vis = channelVisuals[channelId];
  if (!vis) return;
  vis.playhead = {
    startTime: startTime,
    duration: Math.max(0.08, durationSec)
  };
}

function sampleOscillator(type, phase) {
  const p = ((phase % 1) + 1) % 1;
  if (type === "sine") return Math.sin(p * Math.PI * 2);
  if (type === "triangle") return 1 - 4 * Math.abs(Math.round(p - 0.25) - (p - 0.25));
  if (type === "sawtooth") return 2 * p - 1;
  if (type === "square") return p < 0.5 ? 1 : -1;
  return Math.sin(p * Math.PI * 2);
}

// Recalculate high-resolution static waveform array whenever any knob or preset changes
function recalculateStaticWaveform(channelId) {
  const vis = channelVisuals[channelId];
  if (!vis || !vis.canvas) return;

  const numSamples = vis.canvas.width * 2;
  const points = new Float32Array(numSamples);

  if (channelId === "synth") {
    const waveType = waveSelect ? waveSelect.value : "sawtooth";
    const {
      pitch,
      detune,
      attack,
      decay,
      sustain,
      release,
      cutoff,
      resonance,
      modDepth,
      drive,
      compression,
      gate,
      echo,
      reverb
    } = rackState.params;

    const tuningBypass = rackState.bypass.tuning;
    const adsrBypass = rackState.bypass.adsr;
    const filterBypass = rackState.bypass.filter;
    const dynBypass = rackState.bypass.dynamics;
    const spaceBypass = rackState.bypass.space;

    const holdTime = 0.25;
    const totalDur = adsrBypass ? 0.65 : Math.max(0.25, attack + decay + holdTime + release);

    // Visual cycle density responds to Pitch (-24..+24 st) and Detune (-100..+100 ct)
    const pitchMult = tuningBypass ? 1.0 : Math.pow(2, pitch / 12);
    const baseCycles = Math.max(4, Math.min(38, 14 * Math.pow(pitchMult, 0.55)));
    const detuneRatio = tuningBypass ? 1.0 : Math.pow(2, detune / 1200);
    const hasDetuneTwin = !tuningBypass && Math.abs(detune) > 0.5;

    let lpState = 0;
    let bpState = 0;

    for (let i = 0; i < numSamples; i++) {
      const tNorm = i / (numSamples - 1);
      const tSec = tNorm * totalDur;

      // 1. ADSR Amplitude Envelope
      let env = 1.0;
      if (adsrBypass) {
        env = tNorm < 0.85 ? 0.78 : Math.max(0, 0.78 * (1 - (tNorm - 0.85) / 0.15));
      } else if (tSec < attack) {
        env = tSec / Math.max(0.001, attack);
      } else if (tSec < attack + decay) {
        const dRatio = (tSec - attack) / Math.max(0.001, decay);
        env = 1 - dRatio * (1 - sustain);
      } else if (tSec < attack + decay + holdTime) {
        env = sustain;
      } else {
        const rRatio = (tSec - (attack + decay + holdTime)) / Math.max(0.001, release);
        env = sustain * Math.pow(Math.max(0, 1 - rRatio), 1.6);
      }

      // 2. Oscillator (+ Detuned Twin Oscillator when Detune != 0) + Filter
      const lfoWave = Math.sin(tNorm * Math.PI * 2 * (1.5 + (modDepth / 100) * 6));
      const effectiveCutoff = filterBypass
        ? 8500
        : Math.max(60, Math.min(8500, cutoff + (modDepth / 100) * cutoff * 0.75 * lfoWave));

      let rawSample = sampleOscillator(waveType, tNorm * baseCycles);
      if (hasDetuneTwin) {
        const twinSample = sampleOscillator(waveType, tNorm * baseCycles * detuneRatio + 0.17);
        rawSample = (rawSample + twinSample) * 0.62;
      }

      if (!filterBypass) {
        const normCut = Math.min(0.95, Math.max(0.03, effectiveCutoff / 6500));
        const qFactor = Math.min(0.92, (resonance / 30) * 0.88);
        if (rackState.filterType === "lowpass") {
          lpState += normCut * (rawSample - lpState + qFactor * bpState);
          bpState = (1 - normCut * 0.5) * bpState + normCut * (rawSample - lpState);
          rawSample = lpState;
        } else {
          lpState += normCut * (rawSample - lpState);
          rawSample = (rawSample - lpState) * (1 + qFactor * 1.4);
        }
      }

      let sample = rawSample * env;

      // 3. Space & Time visual tail (Synth only)
      if (!spaceBypass && (echo > 2 || reverb > 2)) {
        if (echo > 2 && i > Math.floor(numSamples * 0.28)) {
          const echoIdx = i - Math.floor(numSamples * 0.28);
          sample += points[echoIdx] * (echo / 100) * 0.55;
        }
        if (reverb > 2 && tNorm > 0.25) {
          const revWash = Math.sin(i * 0.47) * Math.cos(i * 0.23) * (reverb / 100) * 0.28 * (1 - tNorm * 0.6);
          sample += revWash;
        }
      }

      // 4. Dynamics & Grit
      if (!dynBypass) {
        if (compression > 0) {
          const compBoost = 1 + (compression / 100) * 0.85;
          sample = Math.sign(sample) * Math.pow(Math.abs(sample), 1 / compBoost);
        }
        if (drive > 0) {
          const dGain = 1 + (drive / 100) * 14;
          sample = Math.tanh(sample * dGain) / Math.tanh(dGain * 0.82);
        }
        if (gate > -79) {
          const gateLinear = Math.pow(10, gate / 32);
          if (Math.abs(sample) < gateLinear) {
            sample = 0;
          }
        }
      }

      points[i] = Math.max(-1, Math.min(1, sample));
    }
  } else {
    // Drum Track Static Waveform Preview
    const s = drumSettings[channelId];
    if (!s) return;

    const totalDur = Math.max(0.06, s.attack + s.decay);
    const attackRatio = Math.min(0.65, s.attack / totalDur);
    let lpState = 0;

    for (let i = 0; i < numSamples; i++) {
      const tNorm = i / (numSamples - 1);

      let env = 0;
      if (tNorm < attackRatio) {
        env = tNorm / Math.max(0.001, attackRatio);
      } else {
        const decRatio = (tNorm - attackRatio) / Math.max(0.001, 1 - attackRatio);
        env = Math.pow(Math.max(0, 1 - decRatio), 2.4);
      }

      const freqCurve = s.startFreq * Math.pow(Math.max(20, s.endFreq) / s.startFreq, tNorm);
      const phase = (freqCurve / 55) * tNorm * 4.5;
      const tone = sampleOscillator(s.wave, phase);

      const pseudoNoise = Math.sin(i * 12.9898) * Math.cos(i * 78.233);
      let raw = tone * (1 - s.noiseMix * 0.5) + pseudoNoise * s.noiseMix;

      const highSmooth = Math.min(0.96, Math.max(0.08, s.highCut / 14000));
      lpState += highSmooth * (raw - lpState);
      raw = lpState;

      const lowThin = Math.max(0.45, 1 - (s.lowCut - 20) / 2200);
      const midFactor = Math.pow(10, s.midCut / 36);

      const shaped = raw * env * lowThin * midFactor * Math.max(0.2, s.volume);
      points[i] = Math.max(-1, Math.min(1, shaped));
    }
  }

  vis.wavePoints = points;
}

// Render static waveform + glowing scrubbing playhead on a single channel canvas
function drawChannelCanvas(vis, nowTime) {
  if (!vis || !vis.ctx || !vis.canvas) return;
  const { ctx, canvas, color, wavePoints, playhead } = vis;
  const width = canvas.width;
  const height = canvas.height;
  const halfH = height * 0.5;

  ctx.fillStyle = "#06110e";
  ctx.fillRect(0, 0, width, height);

  // Subtle phosphor grid lines
  ctx.strokeStyle = "rgba(45, 212, 191, 0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, halfH);
  ctx.lineTo(width, halfH);
  ctx.moveTo(width * 0.25, 0);
  ctx.lineTo(width * 0.25, height);
  ctx.moveTo(width * 0.5, 0);
  ctx.lineTo(width * 0.5, height);
  ctx.moveTo(width * 0.75, 0);
  ctx.lineTo(width * 0.75, height);
  ctx.stroke();

  // Draw Static Waveform Preview
  if (wavePoints && wavePoints.length > 0) {
    ctx.strokeStyle = color || "#2dd4bf";
    ctx.lineWidth = 1.75;
    ctx.beginPath();

    const len = wavePoints.length;
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * width;
      const y = halfH - wavePoints[i] * (halfH - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.lineTo(width, halfH);
    ctx.lineTo(0, halfH);
    ctx.closePath();
    ctx.fillStyle = `${color || "#2dd4bf"}20`;
    ctx.fill();
  }

  // Draw Animated Glowing Playhead Line when triggered
  if (playhead && nowTime !== null) {
    const elapsed = nowTime - playhead.startTime;
    if (elapsed >= 0 && elapsed <= playhead.duration) {
      const progress = elapsed / playhead.duration;
      const playX = progress * width;

      ctx.save();
      ctx.strokeStyle = "#fffbeb";
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
      ctx.restore();
    } else if (elapsed > playhead.duration) {
      vis.playhead = null;
    }
  }
}

// ============================================================================
// DRUM & SYNTH AUDIO ENGINES
// ============================================================================

function initDrumSettings() {
  WAVECRAFT_DATA.tracks.forEach((track) => {
    drumSettings[track.id] = {
      presetKey: "presetA",
      ...track.soundPresets.presetA
    };
    trackMuteSolo[track.id] = { muted: false, solo: false };
  });
}

function isTrackAudible(trackId) {
  const anySolo = Object.values(trackMuteSolo).some((state) => state.solo);
  const state = trackMuteSolo[trackId];
  if (!state) return true;
  if (anySolo) return state.solo;
  return !state.muted;
}

// Play a drum hit routed to sharedFxInputBus (passing through 3-Band EQ & Dynamics, bypassing Synth Space)
function playDrumSound(trackId, when = null, ignoreMuteSolo = false) {
  initAudio();
  if (!ignoreMuteSolo && !isTrackAudible(trackId)) return;

  const s = drumSettings[trackId];
  if (!s || s.volume <= 0.01) return;

  const startTime = when !== null ? when : audioCtx.currentTime;
  const attack = Math.max(0.001, s.attack);
  const totalTime = attack + s.decay;

  triggerWaveformPlayhead(trackId, startTime, Math.max(0.12, totalTime));

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

  // 3. Amplitude Envelope
  const envGain = audioCtx.createGain();
  envGain.gain.setValueAtTime(0.0001, startTime);
  envGain.gain.linearRampToValueAtTime(s.volume, startTime + attack);
  envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime);

  // 4. Per-Voice 3-Band EQ Chain
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

  envGain.connect(lowCutFilter);
  lowCutFilter.connect(midCutFilter);
  midCutFilter.connect(highCutFilter);
  highCutFilter.connect(sharedFxInputBus);

  osc.start(startTime);
  noise.start(startTime);
  osc.stop(startTime + totalTime + 0.02);
  noise.stop(startTime + totalTime + 0.02);
}

// Play a synthesizer note with Pitch shift, Detune twin-oscillator chorus, ADSR, Filter, Synth Space, and Master 3-Band EQ
function playSynthNote(baseFreq = 220) {
  initAudio();
  const now = audioCtx.currentTime;

  // Apply Pitch shift (-24..+24 semitones) & Detune (-100..+100 cents)
  const pitchSemis = rackState.bypass.tuning ? 0 : rackState.params.pitch;
  const detuneCents = rackState.bypass.tuning ? 0 : rackState.params.detune;
  const shiftedFreq = baseFreq * Math.pow(2, pitchSemis / 12);

  const oscPrimary = audioCtx.createOscillator();
  oscPrimary.type = waveSelect.value;
  oscPrimary.frequency.setValueAtTime(shiftedFreq, now);
  oscPrimary.detune.setValueAtTime(-detuneCents * 0.5, now);

  const oscMixer = audioCtx.createGain();
  oscMixer.gain.value = 1.0;
  oscPrimary.connect(oscMixer);

  // Layer a twin detuned oscillator when Detune is active for classic analog chorus thickening
  let oscTwin = null;
  if (!rackState.bypass.tuning && Math.abs(detuneCents) > 0.5) {
    oscTwin = audioCtx.createOscillator();
    oscTwin.type = waveSelect.value;
    oscTwin.frequency.setValueAtTime(shiftedFreq, now);
    oscTwin.detune.setValueAtTime(detuneCents * 0.5, now);

    const twinGain = audioCtx.createGain();
    twinGain.gain.value = 0.72;
    oscTwin.connect(twinGain);
    twinGain.connect(oscMixer);
    oscMixer.gain.value = 0.68;
  }

  // ADSR Envelope
  const envGain = audioCtx.createGain();
  let totalNoteDuration = 0.65;

  if (rackState.bypass.adsr) {
    envGain.gain.setValueAtTime(0.32, now);
    envGain.gain.setValueAtTime(0.32, now + 0.5);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  } else {
    const { attack, decay, sustain, release } = rackState.params;
    const holdTime = 0.25;
    const peakGain = 0.44;
    const sustainGain = Math.max(0.001, peakGain * sustain);
    totalNoteDuration = attack + decay + holdTime + release;

    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakGain, now + attack);
    envGain.gain.exponentialRampToValueAtTime(sustainGain, now + attack + decay);
    envGain.gain.setValueAtTime(sustainGain, now + attack + decay + holdTime);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + totalNoteDuration);
  }

  triggerWaveformPlayhead("synth", now, totalNoteDuration);

  // Filter & LFO Modulation
  let lastNode = oscMixer;
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
      lfoOsc.frequency.setValueAtTime(1.5 + (modAmt / 100) * 9, now);
      lfoGain.gain.setValueAtTime((modAmt / 100) * (rackState.params.cutoff * 0.85), now);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfoOsc.start(now);
      lfoOsc.stop(now + totalNoteDuration + 0.05);
    }

    lastNode.connect(filter);
    lastNode = filter;
  }

  lastNode.connect(envGain);
  envGain.connect(synthSpaceInputBus);

  oscPrimary.start(now);
  oscPrimary.stop(now + totalNoteDuration + 0.05);
  if (oscTwin) {
    oscTwin.start(now);
    oscTwin.stop(now + totalNoteDuration + 0.05);
  }
}

// ============================================================================
// FLUTED ROTARY POTENTIOMETER KNOBS & INTERACTIVE UI BUILDERS
// ============================================================================

function createKnob({ label, min, max, step, value, defaultValue, unit, guideData, tip, accentColor, onChange }) {
  const resetTarget = defaultValue !== undefined ? defaultValue : value;

  const wrapper = document.createElement("div");
  wrapper.className = "knob-unit";

  function showGuide() {
    if (guideData) {
      updateSoundDesignGuide(guideData);
    } else if (tip) {
      updateSoundDesignGuide({
        title: label || "Parameter Control",
        what: tip,
        listen: "Listen for tonal balance, punch, or volume shifts as you adjust this control.",
        watch: "Watch the waveform preview and Live EQ curve update live."
      });
    }
  }

  wrapper.addEventListener("mouseenter", showGuide);

  const labelEl = document.createElement("span");
  labelEl.className = "knob-label";
  labelEl.textContent = label;

  const dial = document.createElement("div");
  dial.className = "knob-dial";
  if (accentColor) {
    dial.style.setProperty("--knob-accent", accentColor);
  }

  const cap = document.createElement("div");
  cap.className = "knob-cap";

  const indicator = document.createElement("div");
  indicator.className = "knob-indicator";
  if (accentColor) indicator.style.backgroundColor = accentColor;

  cap.appendChild(indicator);
  dial.appendChild(cap);

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
    if (unit === "dB") return `${val > 0 ? "+" : ""}${Number(val.toFixed(1))} dB`;
    if (unit === "st") return `${val > 0 ? "+" : ""}${Math.round(val)} st`;
    if (unit === "ct") return `${val > 0 ? "+" : ""}${Math.round(val)} ct`;
    if (unit === "Q") return `${val.toFixed(1)} Q`;
    return `${val}${unit || ""}`;
  }

  function updateVisual(val) {
    const ratio = (val - min) / (max - min);
    const angle = -135 + ratio * 270;
    cap.style.transform = `rotate(${angle}deg)`;
    valueEl.textContent = formatDisplay(val);
  }

  function setValue(rawVal) {
    const clamped = Math.min(max, Math.max(min, rawVal));
    const stepped = Math.round(clamped / step) * step;
    currentVal = Number(stepped.toFixed(4));
    updateVisual(currentVal);
    showGuide();
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
    showGuide();
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  });

  dial.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    startVal = currentVal;
    showGuide();
    window.addEventListener("touchmove", onPointerMove);
    window.addEventListener("touchend", onPointerUp);
  }, { passive: true });

  dial.addEventListener("wheel", (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setValue(currentVal + dir * step * 2);
  });

  dial.addEventListener("dblclick", (e) => {
    e.preventDefault();
    setValue(resetTarget);
  });

  if (label) wrapper.appendChild(labelEl);
  wrapper.appendChild(dial);
  wrapper.appendChild(valueEl);
  return wrapper;
}

// Render all 6 Modular Analog Rack Cards
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
        guideData: {
          title: k.guideTitle,
          what: k.what,
          listen: k.listen,
          watch: k.watch
        },
        accentColor: modData.accent,
        onChange: (val) => {
          rackState.params[k.id] = val;
          updateMasterFxParams();
          recalculateStaticWaveform("synth");
          drawEqVisualizer();
        }
      });
      container.appendChild(knobEl);
    });
  });

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

  recalculateStaticWaveform("synth");
  drawEqVisualizer();
}

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
      recalculateStaticWaveform("synth");
      drawEqVisualizer();
    });
  });

  if (filterModeBtn) {
    filterModeBtn.addEventListener("click", () => {
      rackState.filterType = rackState.filterType === "lowpass" ? "highpass" : "lowpass";
      filterModeBtn.textContent = rackState.filterType === "highpass" ? "HP" : "LP";
      recalculateStaticWaveform("synth");
      drawEqVisualizer();
      updateSoundDesignGuide({
        title: `Filter Mode • ${rackState.filterType === "highpass" ? "High-Pass (HP)" : "Low-Pass (LP)"}`,
        what: rackState.filterType === "highpass"
          ? "High-Pass allows bright treble frequencies through while cutting deep sub-bass frequencies."
          : "Low-Pass allows warm bass frequencies through while cutting sharp treble frequencies.",
        listen: rackState.filterType === "highpass"
          ? "Listen for the sound becoming thinner, lighter, and more airy."
          : "Listen for the sound becoming warmer, darker, and rounder.",
        watch: "Watch the EQ curve slope shift from cutting high frequencies (LP) to cutting low frequencies (HP)."
      });
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
  editorTrackTitle.textContent = `${track.name} Voice Shaping (${settings.label})`;

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
      guideData: {
        title: `${track.name} EQ • Low-Cut (High-Pass)`,
        what: "Removes muddy low-end frequencies below the selected Hz point so drums don't clash with bass.",
        listen: "Listen for the heavy low-end thump thinning out into a tighter, punchier tap.",
        watch: `Watch the overall vertical body height of the ${track.name} wave slim down as sub-bass is trimmed.`
      },
      onChange: (v) => {
        settings.lowCut = v;
        recalculateStaticWaveform(track.id);
      }
    },
    {
      label: "Mid-Cut",
      min: -18,
      max: 6,
      step: 1,
      value: settings.midCut,
      defaultValue: basePreset.midCut,
      unit: "dB",
      guideData: {
        title: `${track.name} EQ • Mid-Cut Scoop`,
        what: "Scoops out boxy midrange frequencies around 1 kHz to make drums sound cleaner and more modern.",
        listen: "Listen for cardboard-like midrange honk disappearing, leaving crisp snap and deep punch.",
        watch: `Watch the mid-body amplitude of the ${track.name} waveform tighten or expand.`
      },
      onChange: (v) => {
        settings.midCut = v;
        recalculateStaticWaveform(track.id);
      }
    },
    {
      label: "High-Cut",
      min: 800,
      max: 16000,
      step: 200,
      value: settings.highCut,
      defaultValue: basePreset.highCut,
      unit: "Hz",
      guideData: {
        title: `${track.name} EQ • High-Cut (Low-Pass)`,
        what: "Rolls off bright treble frequencies above the cutoff point for a warmer, vintage lo-fi drum tone.",
        listen: "Listen for sharp sizzle and metallic click softening into a warm, muted thud.",
        watch: `Watch the fine, spiky noise oscillations on the ${track.name} wave smooth out into soft curves.`
      },
      onChange: (v) => {
        settings.highCut = v;
        recalculateStaticWaveform(track.id);
      }
    },
    {
      label: "Attack",
      min: 0.001,
      max: 0.12,
      step: 0.002,
      value: settings.attack,
      defaultValue: basePreset.attack,
      unit: "ms",
      guideData: {
        title: `${track.name} Envelope • Attack Snap`,
        what: "Controls how many milliseconds it takes for the drum transient to reach maximum volume.",
        listen: "Low values give an instant, hard transient hit; higher values soften the front click into a reverse-like swell.",
        watch: `Watch the peak point of the ${track.name} wave shift to the right as Attack increases.`
      },
      onChange: (v) => {
        settings.attack = v;
        recalculateStaticWaveform(track.id);
      }
    }
  ];

  knobConfigs.forEach((cfg) => {
    drumKnobsContainer.appendChild(createKnob({ ...cfg, accentColor: track.color }));
  });
}

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

// Helper to assign classic TR-808 style color-coded step cap banks (groups of 4)
function getStepBankClass(stepIndex) {
  const bank = Math.floor(stepIndex / 4) % 4;
  if (bank === 0) return "bank-red";
  if (bank === 1) return "bank-orange";
  if (bank === 2) return "bank-amber";
  return "bank-cream";
}

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
    selectBtn.addEventListener("mouseenter", () => {
      updateSoundDesignGuide({
        title: `Voice Select • ${track.name}`,
        what: `Selects ${track.name} in the Voice Shaping strip above so you can sculpt its EQ and Attack.`,
        listen: `Click ${track.name} and press 'AUDITION VOICE' (or key '${Object.keys(DRUM_KEY_MAP).find((k) => DRUM_KEY_MAP[k] === track.id)}') to hear it.`,
        watch: `Watch the ${track.name} static waveform preview reshape as you turn its editor knobs.`
      });
    });
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
    muteBtn.addEventListener("click", () => {
      trackMuteSolo[track.id].muted = !trackMuteSolo[track.id].muted;
      updateMuteSoloVisuals();
    });

    const soloBtn = document.createElement("button");
    soloBtn.type = "button";
    soloBtn.className = "ms-btn solo-btn";
    soloBtn.textContent = "S";
    soloBtn.addEventListener("click", () => {
      trackMuteSolo[track.id].solo = !trackMuteSolo[track.id].solo;
      updateMuteSoloVisuals();
    });

    msGroup.appendChild(muteBtn);
    msGroup.appendChild(soloBtn);

    const presetDropdown = document.createElement("select");
    presetDropdown.className = "track-preset-select";

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
      recalculateStaticWaveform(track.id);
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
      guideData: {
        title: `${track.name} Level • Voice Volume`,
        what: `Sets the output level of ${track.name} in the rhythm mix.`,
        listen: `Balance ${track.name} against the other drums so every beat hits clearly.`,
        watch: `Watch the vertical amplitude of the ${track.name} static waveform scale with volume.`
      },
      accentColor: track.color,
      onChange: (v) => {
        drumSettings[track.id].volume = v;
        recalculateStaticWaveform(track.id);
      }
    });
    volKnob.classList.add("mini-knob");

    const scopeCanvas = document.createElement("canvas");
    scopeCanvas.className = "track-mini-scope";
    scopeCanvas.width = 96;
    scopeCanvas.height = 38;
    scopeCanvas.dataset.scopeTrack = track.id;

    registerChannelCanvas(track.id, scopeCanvas, track.color);

    meta.appendChild(selectBtn);
    meta.appendChild(msGroup);
    meta.appendChild(presetDropdown);
    meta.appendChild(volKnob);
    meta.appendChild(scopeCanvas);
    row.appendChild(meta);

    // Classic Backlit Rubber Drum Machine Step Pads (grouped in sets of 4)
    const stepsContainer = document.createElement("div");
    stepsContainer.className = "steps-container";
    stepsContainer.style.gridTemplateColumns = `repeat(${stepCount}, minmax(20px, 1fr))`;

    const beatGroup = stepCount === 8 ? 2 : stepCount === 32 ? 8 : 4;

    for (let step = 0; step < stepCount; step++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `step-btn ${getStepBankClass(step)}`;
      if (step % beatGroup === 0) btn.classList.add("beat-start");

      const led = document.createElement("span");
      led.className = "step-led";
      btn.appendChild(led);

      if (gridState[track.id][step]) {
        btn.classList.add("active");
      }
      btn.dataset.track = track.id;
      btn.dataset.step = step;

      btn.addEventListener("click", () => {
        const isActive = gridState[track.id][step] ? 0 : 1;
        gridState[track.id][step] = isActive;
        btn.classList.toggle("active", Boolean(isActive));
      });

      stepsContainer.appendChild(btn);
    }

    row.appendChild(stepsContainer);
    sequencerGrid.appendChild(row);
  });

  updateMuteSoloVisuals();
}

// ============================================================================
// 60FPS ANIMATION LOOP & LOOKAHEAD SCHEDULER
// ============================================================================

function animationFrameLoop() {
  requestAnimationFrame(animationFrameLoop);
  const now = audioCtx ? audioCtx.currentTime : null;

  if (audioCtx) {
    updateRealtimeNoiseGate();

    if (isPlaying) {
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

  // Render static waveform previews + glowing scrubbing playheads for Synth & all Drums
  const visuals = Object.values(channelVisuals);
  for (let i = 0; i < visuals.length; i++) {
    drawChannelCanvas(visuals[i], now);
  }

  // Render Live 3-Band EQ Curve + Real-Time Audio Spectrum
  drawEqVisualizer();
}

function getStepDurationSeconds(stepIndex) {
  const bpm = Math.max(40, Math.min(240, Number(bpmInput.value) || 120));
  const barSec = (60 / bpm) * 4;
  const baseStepSec = barSec / stepCount;
  const swingFactor = (swingPercent / 100) * 0.5;
  const isEvenStep = stepIndex % 2 === 0;
  return isEvenStep ? baseStepSec * (1 + swingFactor) : baseStepSec * (1 - swingFactor);
}

function scheduleStepEvents(stepIndex, stepTime) {
  visualStepQueue.push({ step: stepIndex, time: stepTime });

  const stepsPerQuarter = stepCount / 4;
  if (metronomeEnabled && stepIndex % stepsPerQuarter === 0) {
    const isBeatOne = stepIndex === 0;
    playMetronomeClick(stepTime, isBeatOne);
  }

  WAVECRAFT_DATA.tracks.forEach((track) => {
    if (gridState[track.id][stepIndex]) {
      playDrumSound(track.id, stepTime, false);
    }
  });
}

function runLookaheadScheduler() {
  if (!isPlaying || !audioCtx) return;

  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    scheduleStepEvents(currentScheduleStep, nextNoteTime);
    nextNoteTime += getStepDurationSeconds(currentScheduleStep);
    currentScheduleStep = (currentScheduleStep + 1) % stepCount;
  }

  schedulerTimerId = setTimeout(runLookaheadScheduler, lookaheadMs);
}

function togglePlay() {
  initAudio();
  isPlaying = !isPlaying;

  if (isPlaying) {
    playBtn.classList.add("is-playing");
    currentScheduleStep = 0;
    lastDrawnVisualStep = -1;
    visualStepQueue.length = 0;
    nextNoteTime = audioCtx.currentTime + 0.03;
    runLookaheadScheduler();
  } else {
    playBtn.classList.remove("is-playing");
    clearTimeout(schedulerTimerId);
    visualStepQueue.length = 0;
    lastDrawnVisualStep = -1;
    document.querySelectorAll(".step-btn").forEach((b) => b.classList.remove("playing"));
  }
}

function toggleMetronome() {
  initAudio();
  metronomeEnabled = !metronomeEnabled;
  metroBtn.classList.toggle("active", metronomeEnabled);
  metroBtn.setAttribute("aria-pressed", String(metronomeEnabled));
  metroBtn.textContent = metronomeEnabled ? "CLICK: ON" : "CLICK: OFF";
}

function loadDefaultPreset(presetKey = "basicRock") {
  const preset = WAVECRAFT_DATA.presets[presetKey];
  if (!preset) return;

  bpmInput.value = preset.bpm;
  waveSelect.value = preset.waveform;

  swingPercent = preset.swing !== undefined ? preset.swing : 0;
  swingSlider.value = swingPercent;
  swingVal.textContent = swingPercent;

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

function generateSmartGroove() {
  const kick = Array(32).fill(0);
  const snare = Array(32).fill(0);
  const hihat = Array(32).fill(0);
  const clap = Array(32).fill(0);

  const grooveStyle = Math.floor(Math.random() * 3);

  for (let bar = 0; bar < 2; bar++) {
    const offset = bar * 16;
    kick[offset + 0] = 1;
    if (grooveStyle === 0) {
      kick[offset + 4] = 1;
      kick[offset + 8] = 1;
      kick[offset + 12] = 1;
      if (Math.random() > 0.5) kick[offset + 14] = 1;
    } else if (grooveStyle === 1) {
      if (Math.random() > 0.35) kick[offset + 3] = 1;
      kick[offset + 6] = 1;
      if (Math.random() > 0.3) kick[offset + 10] = 1;
      if (Math.random() > 0.65) kick[offset + 13] = 1;
    } else {
      if (Math.random() > 0.3) kick[offset + 3] = 1;
      if (Math.random() > 0.4) kick[offset + 7] = 1;
      kick[offset + 10] = 1;
    }

    if (grooveStyle === 2) {
      snare[offset + 8] = 1;
      if (Math.random() > 0.5) snare[offset + 14] = 1;
    } else {
      snare[offset + 4] = 1;
      snare[offset + 12] = 1;
      if (Math.random() > 0.6) snare[offset + 15] = 1;
    }

    const hatDensity = Math.random();
    for (let s = 0; s < 16; s++) {
      if (hatDensity < 0.35) {
        hihat[offset + s] = s % 4 === 2 ? 1 : 0;
      } else if (hatDensity < 0.75) {
        hihat[offset + s] = s % 2 === 0 || (s >= 12 && Math.random() > 0.45) ? 1 : 0;
      } else {
        hihat[offset + s] = Math.random() > 0.15 ? 1 : 0;
      }
    }

    if (Math.random() > 0.35) clap[offset + 12] = 1;
    if (Math.random() > 0.55) clap[offset + 4] = 1;
    if (Math.random() > 0.65) clap[offset + 14] = 1;
  }

  gridState = { kick, snare, hihat, clap };
  renderGrid();
  updateSoundDesignGuide({
    title: "Pattern Generator • Fresh Groove Loaded",
    what: "Programmed a balanced 32-step rhythm pattern with anchored kicks and crisp backbeats.",
    listen: "Toggle CLICK ON to hear how syncopated hits bounce around the quarter-note pulse.",
    watch: "Watch the backlit step pads and glowing playheads sweep across each voice's waveform."
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
      return;
    }

    if (DRUM_KEY_MAP[key]) {
      e.preventDefault();
      playDrumSound(DRUM_KEY_MAP[key], null, true);
      return;
    }

    if (SYNTH_KEY_MAP[key]) {
      e.preventDefault();
      playSynthNote(SYNTH_KEY_MAP[key]);
    }
  });
}

function setupTooltips() {
  document.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      updateSoundDesignGuide({
        title: "Hardware Control Overview",
        what: el.dataset.tip,
        listen: "Press START / STOP or trigger a synth/drum voice to hear how this control shapes the audio.",
        watch: "Watch the dual phosphor screens respond immediately."
      });
    });
  });
}

function startApp() {
  initRackDefaults();
  initDrumSettings();

  const synthCanvas = document.getElementById("scope-synth");
  if (synthCanvas) registerChannelCanvas("synth", synthCanvas, "#2dd4bf");

  eqCanvas = document.getElementById("eq-visualizer");
  if (eqCanvas) eqCtx = eqCanvas.getContext("2d");

  playBtn.addEventListener("click", togglePlay);
  metroBtn.addEventListener("click", toggleMetronome);

  waveSelect.addEventListener("change", () => {
    recalculateStaticWaveform("synth");
    const waveName = waveSelect.options[waveSelect.selectedIndex].text;
    updateSoundDesignGuide({
      title: `Oscillator Waveform • ${waveName}`,
      what: "Chooses the foundational geometric shape of the vibrating sound wave before filtering or effects.",
      listen: "Sine is pure and subby; Triangle is warm; Sawtooth is rich and buzzy; Square is hollow and retro.",
      watch: "Watch the fundamental cycle shape on the OSC Waveform screen switch immediately."
    });
  });

  testSynthBtn.addEventListener("click", () => {
    const noteFreq = parseFloat(noteSelect.value) || 220;
    playSynthNote(noteFreq);
  });

  previewDrumBtn.addEventListener("click", () => playDrumSound(selectedTrackId, null, true));
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
  loadDefaultPreset("basicRock");

  if (!animLoopStarted) {
    animLoopStarted = true;
    animationFrameLoop();
  }
}

startApp();