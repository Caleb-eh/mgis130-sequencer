// 2_script/script.js
// PROCESSING & PRESENTATION: Studio-grade gain-staged Web Audio engine (isolated Drum Bus Limiter
// vs. Synth Dynamics/Gate), multi-stage analog drum synthesis (6-oscillator metallic hats/cymbals,
// multi-burst claps, Open Hat choke), stereo-widened 4x-oversampled polyphonic synthesizer,
// Mic Sampler & Chopper, Multi-Section Arranger with seamless live chaining, and animated "Cal" mascot.

let audioCtx = null;
let noiseBuffer = null;
let reverbImpulseBuffer = null;
let isPlaying = false;
let metronomeEnabled = false;
let learnModeEnabled = true;

// Lookahead Web Audio Scheduler state
let currentScheduleStep = 0;
let nextNoteTime = 0.0;
let schedulerTimerId = null;
const lookaheadMs = 25.0;
const scheduleAheadTime = 0.1;
const visualStepQueue = [];
let lastDrawnVisualStep = -1;

// Cached Sequencer Step Button DOM Elements (avoids 60fps querySelectorAll)
let stepElementsByStep = [];

// Master, 3-Band EQ & Bus Routing Nodes
let masterBusGain = null;
let eqBassFilter = null;
let eqMidFilter = null;
let eqTrebleFilter = null;
let previewFilterNode = null; // Reusable filter node for 60fps EQ curve calculation
let eqSpectrumAnalyser = null;
let eqSpectrumData = null;

// Synth-Isolated Dynamics & Space Bus (Drive, Compression, Noise Gate, Echo & Reverb affect Synth only)
let synthSpaceInputBus = null;
let synthDryGain = null;
let delayNode = null;
let delayFeedbackGain = null;
let delayWetGain = null;
let reverbConvolver = null;
let reverbWetGain = null;

let synthDynamicsInputBus = null;
let driveNode = null;
let driveSmoothingFilter = null; // Gentle 9 kHz LPF to remove distortion fizz
let compressorNode = null;
let gateAnalyserNode = null;
let gateTimeData = null;
let gateGainNode = null;

// Dedicated Drum Bus with Transparent Peak Limiter (prevents Kicks from ducking Hats/Snares)
let drumBusInput = null;
let drumBusLimiter = null;
let drumDelayInputBus = null;
let drumDelayNode = null;
let drumDelayFeedbackGain = null;
let drumGlobalDelayWetGain = null;

let drumReverbInputBus = null;
let drumReverbConvolver = null;
let drumGlobalReverbWetGain = null;

// Track active Open Hat voice so Closed Hat chokes it naturally
let activeOpenHatVoice = null;

// Active Polyphonic Synth Voices Map: { [noteKey]: { stopRelease: Function } }
const activePolyVoices = new Map();

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

// ============================================================================
// MIC SAMPLER, SAMPLE CHOPPER & LOCALSTORAGE LIBRARY STATE
// ============================================================================

const SAMPLE_STORAGE_KEY = "wavecraft_wc808_sample_library_v1";
const SAMPLE_EXPORT_RATE = 22050; // Compact mono 22.05 kHz 16-bit WAV (~88 KB per 2s) for fast localStorage saves

// Sound design modules saved with a sample (Space / Echo & Reverb intentionally excluded)
const SAMPLE_SOUND_DESIGN_MODULES = ["tuning", "adsr", "filter", "eq", "dynamics"];

let savedSamples = []; // Array of { id, name, duration, wavDataUrl, peaks, soundDesign? }
const decodedSampleBuffers = {}; // Cache: { [sampleId]: AudioBuffer }
const pitchShiftedBufferCache = {}; // Cache: { [cacheKey]: AudioBuffer }
let pendingRecording = null; // Unsaved recording: { floatData, sampleRate, duration, peaks, tempBuffer }
let isRecordingMic = false;
let activeMicStream = null;
let activeMicSource = null;
let activeMicProcessor = null;
let recCountdownTimer = null;

// Sample Chopper Trim State (0.0 to 1.0 normalized start/end)
let chopStartRatio = 0.0;
let chopEndRatio = 1.0;
let isDraggingChopCanvas = false;
let chopDragAnchorRatio = 0.0;

// Sequencer & Drum Settings State
let stepCount = 16;
let swingPercent = 0;
let selectedTrackId = "kick";
let gridState = {};
let drumSettings = {};
const trackMuteSolo = {};
const drumGlobalSpace = {
  echo: 100,   // Global drum echo master level (0-100%)
  reverb: 100  // Global drum reverb master level (0-100%)
};

// Multi-Section Arranger State (Sections A, B, ... up to H)
const SECTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
let sections = []; // Array of { id, name, stepCount, grid }
let activeSectionIndex = 0;
let schedulingSectionIndex = 0; // Tracks which section the Web Audio lookahead is currently scheduling
let chainSectionsEnabled = false;

// Modular Rack State
const rackState = {
  filterType: "lowpass",
  delaySync: "1/8",
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

// QWERTY Keyboard Mappings for all 8 Drum Voices (Keys 1–8)
const DRUM_KEY_MAP = {
  "1": "kick",
  "2": "snare",
  "3": "hihat",
  "4": "openhat",
  "5": "clap",
  "6": "lowtom",
  "7": "midtom",
  "8": "crash"
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
const delaySyncSelect = document.getElementById("delay-sync-select");
const factoryPresetSelect = document.getElementById("factory-preset-select");
const sequencerGrid = document.getElementById("sequencer-grid");
const drumKnobsContainer = document.getElementById("drum-knobs-container");
const drumGlobalSpaceKnobs = document.getElementById("drum-global-space-knobs");
const editorTrackBadge = document.getElementById("editor-track-badge");
const editorTrackTitle = document.getElementById("editor-track-title");

// Multi-Section Arranger DOM References
const sectionTabsContainer = document.getElementById("section-tabs");
const addSectionBtn = document.getElementById("add-section-btn");
const copySectionBtn = document.getElementById("copy-section-btn");
const chainSectionsBtn = document.getElementById("chain-sections-btn");

// Mic Sampler & Library DOM References
const recLengthSelect = document.getElementById("rec-length-select");
const recMicBtn = document.getElementById("rec-mic-btn");
const previewRecBtn = document.getElementById("preview-rec-btn");
const recStatusText = document.getElementById("rec-status-text");
const sampleNameInput = document.getElementById("sample-name-input");
const saveSampleBtn = document.getElementById("save-sample-btn");
const saveSampleFxBtn = document.getElementById("save-sample-fx-btn");
const libraryCountEl = document.getElementById("library-count");
const sampleLibrarySelect = document.getElementById("sample-library-select");
const deleteSampleBtn = document.getElementById("delete-sample-btn");

const sampleChopCanvas = document.getElementById("sample-chop-canvas");
const sampleChopCtx = sampleChopCanvas ? sampleChopCanvas.getContext("2d") : null;
const chopRangeReadout = document.getElementById("chop-range-readout");
const chopStartSlider = document.getElementById("chop-start-slider");
const chopEndSlider = document.getElementById("chop-end-slider");
const chopStartVal = document.getElementById("chop-start-val");
const chopEndVal = document.getElementById("chop-end-val");
const resetChopBtn = document.getElementById("reset-chop-btn");
const applyChopBtn = document.getElementById("apply-chop-btn");

// Cal Mascot & Speech Bubble DOM Elements
const learnToggleBtn = document.getElementById("learn-toggle-btn");
const learnToggleText = document.getElementById("learn-toggle-text");
const calCompanion = document.getElementById("cal-companion");
const calAvatarStage = document.getElementById("cal-avatar-stage");
const learnTitle = document.getElementById("learn-title");
const learnWhat = document.getElementById("learn-what");
const learnListen = document.getElementById("learn-listen");
const learnWatch = document.getElementById("learn-watch");

// ============================================================================
// CAL MASCOT ANIMATION & LEARN MODE SPEECH BUBBLE CONTROLLER
// ============================================================================

function syncCalBeatTempo() {
  if (!calAvatarStage) return;
  const bpm = Math.max(60, Math.min(200, Number(bpmInput ? bpmInput.value : 120) || 120));
  const beatDurationSec = 60 / bpm;
  calAvatarStage.style.setProperty("--cal-beat-duration", `${beatDurationSec.toFixed(3)}s`);
}

function updateCalAnimationState() {
  if (!calAvatarStage) return;
  const isSynthActive = activePolyVoices.size > 0;
  calAvatarStage.classList.toggle("is-synth-playing", isSynthActive);
  calAvatarStage.classList.toggle("is-drum-grooving", isPlaying);
  if (isPlaying) {
    syncCalBeatTempo();
  }
}

function setLearnModeEnabled(enabled) {
  learnModeEnabled = Boolean(enabled);
  if (learnToggleBtn) {
    learnToggleBtn.classList.toggle("active", learnModeEnabled);
    learnToggleBtn.setAttribute("aria-pressed", String(learnModeEnabled));
  }
  if (learnToggleText) {
    learnToggleText.textContent = learnModeEnabled ? "LEARN MODE: ON" : "LEARN MODE: OFF";
  }
  if (calCompanion) {
    calCompanion.classList.toggle("is-visible", learnModeEnabled);
    calCompanion.classList.toggle("is-hidden", !learnModeEnabled);
  }
}

function updateSoundDesignGuide({ title, what, listen, watch }) {
  if (learnTitle && title) learnTitle.textContent = title;
  if (learnWhat && what) learnWhat.textContent = what;
  if (learnListen && listen) learnListen.textContent = listen;
  if (learnWatch && watch) learnWatch.textContent = watch;
}

function attachLearnHoverHandlers(element, getGuidePayload) {
  if (!element) return;
  element.addEventListener("mouseenter", () => {
    const payload = typeof getGuidePayload === "function" ? getGuidePayload() : getGuidePayload;
    if (payload) updateSoundDesignGuide(payload);
  });
}

// ============================================================================
// SOUND DESIGN SNAPSHOT CAPTURE, RESTORE & RESET (EXCLUDING SPACE)
// ============================================================================

function captureCurrentSampleSoundDesign() {
  const paramsSnapshot = {};
  SAMPLE_SOUND_DESIGN_MODULES.forEach((modKey) => {
    const modDef = WAVECRAFT_DATA.rackModules[modKey];
    if (!modDef) return;
    modDef.knobs.forEach((k) => {
      paramsSnapshot[k.id] = rackState.params[k.id];
    });
  });

  const bypassSnapshot = {};
  SAMPLE_SOUND_DESIGN_MODULES.forEach((modKey) => {
    bypassSnapshot[modKey] = Boolean(rackState.bypass[modKey]);
  });

  return {
    filterType: rackState.filterType || "lowpass",
    bypass: bypassSnapshot,
    params: paramsSnapshot
  };
}

function resetSampleSoundDesignToDefaults(shouldRender = true) {
  SAMPLE_SOUND_DESIGN_MODULES.forEach((modKey) => {
    const modDef = WAVECRAFT_DATA.rackModules[modKey];
    if (modDef) {
      modDef.knobs.forEach((k) => {
        rackState.params[k.id] = k.defaultValue;
      });
    }
    rackState.bypass[modKey] = false;
  });
  rackState.filterType = "lowpass";

  if (shouldRender) {
    renderModularRack();
    updateMasterFxParams();
  }
}

function applySavedSampleSoundDesign(sampleObj, shouldRender = true) {
  resetSampleSoundDesignToDefaults(false);

  if (sampleObj && sampleObj.soundDesign) {
    const sd = sampleObj.soundDesign;
    if (sd.filterType) {
      rackState.filterType = sd.filterType;
    }
    if (sd.params) {
      Object.entries(sd.params).forEach(([k, v]) => {
        if (k in rackState.params && k !== "echo" && k !== "reverb") {
          rackState.params[k] = v;
        }
      });
    }
    if (sd.bypass) {
      SAMPLE_SOUND_DESIGN_MODULES.forEach((modKey) => {
        if (modKey in sd.bypass) {
          rackState.bypass[modKey] = Boolean(sd.bypass[modKey]);
        }
      });
    }
  }

  if (shouldRender) {
    renderModularRack();
    updateMasterFxParams();
  }
}

function updateSaveButtonsEnabledState() {
  const activeSample = getActiveChopperSample();
  const canSave = Boolean(pendingRecording) || Boolean(activeSample && activeSample.id !== "unsaved");
  if (saveSampleBtn) saveSampleBtn.disabled = !canSave;
  if (saveSampleFxBtn) saveSampleFxBtn.disabled = !canSave;
}

// ============================================================================
// WAV ENCODING, DECODING & LOCALSTORAGE PERSISTENCE
// ============================================================================

function computeNormalizedPeaks(floatData, bucketCount = 180) {
  const peaks = new Array(bucketCount).fill(0);
  if (!floatData || floatData.length === 0) return peaks;

  let maxAbs = 0.01;
  for (let i = 0; i < floatData.length; i++) {
    const a = Math.abs(floatData[i]);
    if (a > maxAbs) maxAbs = a;
  }

  const blockSize = Math.max(1, Math.floor(floatData.length / bucketCount));
  for (let b = 0; b < bucketCount; b++) {
    const start = b * blockSize;
    const end = Math.min(floatData.length, start + blockSize);
    let signedPeak = 0;
    let bestMag = 0;
    for (let i = start; i < end; i++) {
      const val = floatData[i] / maxAbs;
      const mag = Math.abs(val);
      if (mag > bestMag) {
        bestMag = mag;
        signedPeak = val;
      }
    }
    peaks[b] = Number(signedPeak.toFixed(3));
  }
  return peaks;
}

function downsampleMonoFloat32(floatData, inputRate, targetRate) {
  if (inputRate <= targetRate) return floatData;
  const ratio = inputRate / targetRate;
  const newLength = Math.max(1, Math.round(floatData.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const idx = Math.min(floatData.length - 1, Math.floor(i * ratio));
    result[i] = floatData[idx];
  }
  return result;
}

function encodeMonoWavDataUrl(floatData, sampleRate) {
  const numSamples = floatData.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  function writeAscii(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, floatData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return "data:audio/wav;base64," + btoa(binary);
}

function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function decodeSampleToAudioBuffer(sampleObj) {
  if (!sampleObj) return null;
  if (sampleObj.audioBuffer) return sampleObj.audioBuffer;
  if (decodedSampleBuffers[sampleObj.id]) {
    return decodedSampleBuffers[sampleObj.id];
  }
  await ensureAudioReady();
  try {
    const arrayBuf = dataUrlToArrayBuffer(sampleObj.wavDataUrl);
    const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
    decodedSampleBuffers[sampleObj.id] = audioBuf;
    return audioBuf;
  } catch (err) {
    console.error("Failed to decode saved sample:", err);
    return null;
  }
}

function clearPitchCacheForSample(sampleId) {
  const prefix = `${sampleId}|`;
  Object.keys(pitchShiftedBufferCache).forEach((k) => {
    if (k.startsWith(prefix)) {
      delete pitchShiftedBufferCache[k];
    }
  });
}

function loadSavedSamplesFromStorage() {
  try {
    const raw = localStorage.getItem(SAMPLE_STORAGE_KEY);
    if (!raw) {
      savedSamples = [];
      return;
    }
    const parsed = JSON.parse(raw);
    savedSamples = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Could not read saved samples from localStorage:", err);
    savedSamples = [];
  }
}

function persistSavedSamplesToStorage() {
  try {
    localStorage.setItem(SAMPLE_STORAGE_KEY, JSON.stringify(savedSamples));
    return true;
  } catch (err) {
    console.error("localStorage quota exceeded:", err);
    if (recStatusText) {
      recStatusText.textContent = "Storage full! Delete an older sample first.";
    }
    return false;
  }
}

function getSampleById(sampleId) {
  if (!sampleId) return null;
  if (sampleId === "unsaved" || sampleId === "sample:unsaved") {
    if (!pendingRecording) return null;
    return {
      id: "unsaved",
      name: "Unsaved Mic Take",
      duration: pendingRecording.duration,
      peaks: pendingRecording.peaks,
      audioBuffer: pendingRecording.tempBuffer,
      soundDesign: null
    };
  }
  const cleanId = sampleId.startsWith("sample:") ? sampleId.slice(7) : sampleId;
  return savedSamples.find((s) => s.id === cleanId) || null;
}

// ============================================================================
// SAMPLE CHOPPER & CONSTANT-LENGTH GRANULAR PITCH-SHIFTER
// ============================================================================

function getActiveChopperSample() {
  if (waveSelect && waveSelect.value.startsWith("sample:")) {
    return getSampleById(waveSelect.value);
  }
  if (pendingRecording) {
    return getSampleById("unsaved");
  }
  if (sampleLibrarySelect && sampleLibrarySelect.value) {
    return getSampleById(sampleLibrarySelect.value);
  }
  return null;
}

function getChoppedPeaksSlice(peaks, startRatio, endRatio) {
  if (!peaks || peaks.length === 0) return [];
  const startIdx = Math.max(0, Math.min(peaks.length - 1, Math.floor(startRatio * peaks.length)));
  const endIdx = Math.max(startIdx + 1, Math.min(peaks.length, Math.ceil(endRatio * peaks.length)));
  return peaks.slice(startIdx, endIdx);
}

function extractChoppedFloatSlice(floatData, sampleRate, startRatio, endRatio) {
  const startSample = Math.max(0, Math.min(floatData.length - 1, Math.floor(startRatio * floatData.length)));
  const endSample = Math.max(startSample + 32, Math.min(floatData.length, Math.floor(endRatio * floatData.length)));
  const sliced = floatData.slice(startSample, endSample);

  const fadeSamples = Math.min(Math.floor(sampleRate * 0.006), Math.floor(sliced.length / 4));
  for (let i = 0; i < fadeSamples; i++) {
    const fadeFactor = i / Math.max(1, fadeSamples);
    sliced[i] *= fadeFactor;
    sliced[sliced.length - 1 - i] *= fadeFactor;
  }
  return sliced;
}

function buildConstantLengthPitchBuffer(sourceBuffer, startRatio, endRatio, pitchRatio) {
  initAudio();
  const sampleRate = sourceBuffer.sampleRate;
  const fullData = sourceBuffer.getChannelData(0);
  const slicedData = extractChoppedFloatSlice(fullData, sampleRate, startRatio, endRatio);
  const outLen = slicedData.length;

  const outBuffer = audioCtx.createBuffer(1, outLen, sampleRate);
  const outData = outBuffer.getChannelData(0);

  if (Math.abs(pitchRatio - 1.0) < 0.005 || outLen < 512) {
    outData.set(slicedData);
    return outBuffer;
  }

  const grainSize = Math.min(outLen, Math.max(512, Math.round(sampleRate * 0.048)));
  const hopOut = Math.max(64, Math.floor(grainSize / 4));

  const hann = new Float32Array(grainSize);
  for (let i = 0; i < grainSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (grainSize - 1)));
  }

  const weightSum = new Float32Array(outLen);

  for (let outPos = 0; outPos < outLen; outPos += hopOut) {
    const grainStartIn = outPos;
    for (let i = 0; i < grainSize; i++) {
      const targetIdx = outPos + i;
      if (targetIdx >= outLen) break;

      const readFloatIdx = grainStartIn + i * pitchRatio;
      const idx0 = Math.floor(readFloatIdx);
      let sampleVal = 0;

      if (idx0 >= 0 && idx0 < outLen - 1) {
        const frac = readFloatIdx - idx0;
        sampleVal = slicedData[idx0] * (1 - frac) + slicedData[idx0 + 1] * frac;
      } else if (idx0 >= 0 && idx0 < outLen) {
        sampleVal = slicedData[idx0];
      }

      const w = hann[i];
      outData[targetIdx] += sampleVal * w;
      weightSum[targetIdx] += w;
    }
  }

  for (let i = 0; i < outLen; i++) {
    if (weightSum[i] > 0.0001) {
      outData[i] = Math.max(-1, Math.min(1, outData[i] / weightSum[i]));
    }
  }

  return outBuffer;
}

function getProcessedSampleBuffer(sampleObj, sourceBuffer, useChopMarkers, pitchRatio) {
  const startR = useChopMarkers ? chopStartRatio : 0.0;
  const endR = useChopMarkers ? chopEndRatio : 1.0;
  const quantizedPitch = Number(pitchRatio.toFixed(4));
  const cacheKey = `${sampleObj.id}|${startR.toFixed(3)}|${endR.toFixed(3)}|${quantizedPitch}`;

  if (pitchShiftedBufferCache[cacheKey]) {
    return pitchShiftedBufferCache[cacheKey];
  }

  const processed = buildConstantLengthPitchBuffer(sourceBuffer, startR, endR, quantizedPitch);
  pitchShiftedBufferCache[cacheKey] = processed;
  return processed;
}

function resetChopMarkers(redraw = true) {
  chopStartRatio = 0.0;
  chopEndRatio = 1.0;
  if (chopStartSlider) chopStartSlider.value = "0";
  if (chopEndSlider) chopEndSlider.value = "100";
  if (chopStartVal) chopStartVal.textContent = "0";
  if (chopEndVal) chopEndVal.textContent = "100";
  if (redraw) {
    updateSampleChopperUI();
    recalculateStaticWaveform("synth");
  }
}

function updateSampleChopperUI() {
  const activeSample = getActiveChopperSample();
  const hasSample = Boolean(activeSample);

  if (chopStartSlider) chopStartSlider.disabled = !hasSample;
  if (chopEndSlider) chopEndSlider.disabled = !hasSample;
  if (resetChopBtn) resetChopBtn.disabled = !hasSample || (chopStartRatio <= 0.001 && chopEndRatio >= 0.999);
  if (applyChopBtn) applyChopBtn.disabled = !hasSample || (chopStartRatio <= 0.001 && chopEndRatio >= 0.999);

  updateSaveButtonsEnabledState();

  if (!hasSample) {
    if (chopRangeReadout) chopRangeReadout.textContent = "0.00s – 0.00s (0.00s)";
    drawSampleChopperCanvas(null);
    return;
  }

  const startSec = activeSample.duration * chopStartRatio;
  const endSec = activeSample.duration * chopEndRatio;
  const sliceSec = Math.max(0.01, endSec - startSec);

  if (chopStartVal) chopStartVal.textContent = String(Math.round(chopStartRatio * 100));
  if (chopEndVal) chopEndVal.textContent = String(Math.round(chopEndRatio * 100));
  if (chopRangeReadout) {
    chopRangeReadout.textContent = `${startSec.toFixed(2)}s – ${endSec.toFixed(2)}s (${sliceSec.toFixed(2)}s)`;
  }

  drawSampleChopperCanvas(activeSample);
}

function drawSampleChopperCanvas(sampleObj) {
  if (!sampleChopCtx || !sampleChopCanvas) return;
  const w = sampleChopCanvas.width;
  const h = sampleChopCanvas.height;
  const halfH = h * 0.5;

  sampleChopCtx.fillStyle = "#06110e";
  sampleChopCtx.fillRect(0, 0, w, h);

  sampleChopCtx.strokeStyle = "rgba(45, 212, 191, 0.16)";
  sampleChopCtx.lineWidth = 1;
  sampleChopCtx.beginPath();
  sampleChopCtx.moveTo(0, halfH);
  sampleChopCtx.lineTo(w, halfH);
  sampleChopCtx.stroke();

  if (!sampleObj || !sampleObj.peaks || sampleObj.peaks.length === 0) {
    sampleChopCtx.font = "11px monospace";
    sampleChopCtx.fillStyle = "rgba(148, 163, 184, 0.65)";
    sampleChopCtx.textAlign = "center";
    sampleChopCtx.fillText("Record or select a sample to chop its start & end points", w * 0.5, halfH + 4);
    sampleChopCtx.textAlign = "left";
    return;
  }

  const startX = chopStartRatio * w;
  const endX = chopEndRatio * w;

  sampleChopCtx.fillStyle = "rgba(45, 212, 191, 0.12)";
  sampleChopCtx.fillRect(startX, 0, Math.max(2, endX - startX), h);

  const peaks = sampleObj.peaks;
  for (let i = 0; i < peaks.length; i++) {
    const ratio = i / Math.max(1, peaks.length - 1);
    const x = ratio * w;
    const amp = Math.abs(peaks[i]) * (halfH - 5);
    const insideSlice = ratio >= chopStartRatio && ratio <= chopEndRatio;

    sampleChopCtx.strokeStyle = insideSlice ? "#2dd4bf" : "rgba(100, 116, 139, 0.35)";
    sampleChopCtx.lineWidth = 2;
    sampleChopCtx.beginPath();
    sampleChopCtx.moveTo(x, halfH - Math.max(1, amp));
    sampleChopCtx.lineTo(x, halfH + Math.max(1, amp));
    sampleChopCtx.stroke();
  }

  sampleChopCtx.fillStyle = "rgba(6, 10, 14, 0.52)";
  if (startX > 0) sampleChopCtx.fillRect(0, 0, startX, h);
  if (endX < w) sampleChopCtx.fillRect(endX, 0, w - endX, h);

  sampleChopCtx.strokeStyle = "#f59e0b";
  sampleChopCtx.lineWidth = 2;
  sampleChopCtx.beginPath();
  sampleChopCtx.moveTo(startX, 0);
  sampleChopCtx.lineTo(startX, h);
  sampleChopCtx.stroke();

  sampleChopCtx.fillStyle = "#f59e0b";
  sampleChopCtx.fillRect(startX, 0, 14, 12);
  sampleChopCtx.fillStyle = "#140d04";
  sampleChopCtx.font = "bold 9px monospace";
  sampleChopCtx.fillText("S", startX + 4, 9);

  sampleChopCtx.strokeStyle = "#ea580c";
  sampleChopCtx.lineWidth = 2;
  sampleChopCtx.beginPath();
  sampleChopCtx.moveTo(endX, 0);
  sampleChopCtx.lineTo(endX, h);
  sampleChopCtx.stroke();

  sampleChopCtx.fillStyle = "#ea580c";
  sampleChopCtx.fillRect(Math.max(0, endX - 14), h - 12, 14, 12);
  sampleChopCtx.fillStyle = "#fffbeb";
  sampleChopCtx.fillText("E", Math.max(4, endX - 10), h - 3);
}

async function applyPermanentChopToActiveSample() {
  const activeSample = getActiveChopperSample();
  if (!activeSample) return;
  if (chopStartRatio <= 0.001 && chopEndRatio >= 0.999) return;

  await ensureAudioReady();

  if (activeSample.id === "unsaved" && pendingRecording) {
    const slicedFloat = extractChoppedFloatSlice(
      pendingRecording.floatData,
      pendingRecording.sampleRate,
      chopStartRatio,
      chopEndRatio
    );
    const newBuffer = audioCtx.createBuffer(1, slicedFloat.length, pendingRecording.sampleRate);
    newBuffer.getChannelData(0).set(slicedFloat);

    pendingRecording = {
      floatData: slicedFloat,
      sampleRate: pendingRecording.sampleRate,
      duration: slicedFloat.length / pendingRecording.sampleRate,
      peaks: computeNormalizedPeaks(slicedFloat, 180),
      tempBuffer: newBuffer
    };

    clearPitchCacheForSample("unsaved");
    resetChopMarkers(false);
    syncSampleDropdowns();
    if (waveSelect) waveSelect.value = "sample:unsaved";
    updateSampleChopperUI();
    recalculateStaticWaveform("synth");

    if (recStatusText) {
      recStatusText.textContent = `Chopped take to ${pendingRecording.duration.toFixed(2)}s! Save or play now.`;
    }
    triggerOneShotSynthNote(parseFloat(noteSelect.value) || 220);
    return;
  }

  const savedItem = savedSamples.find((s) => s.id === activeSample.id);
  if (!savedItem) return;

  const sourceBuf = await decodeSampleToAudioBuffer(savedItem);
  if (!sourceBuf) return;

  const fullFloat = sourceBuf.getChannelData(0);
  const slicedFloat = extractChoppedFloatSlice(fullFloat, sourceBuf.sampleRate, chopStartRatio, chopEndRatio);
  const compactFloat = downsampleMonoFloat32(slicedFloat, sourceBuf.sampleRate, SAMPLE_EXPORT_RATE);

  savedItem.wavDataUrl = encodeMonoWavDataUrl(compactFloat, SAMPLE_EXPORT_RATE);
  savedItem.duration = Number((slicedFloat.length / sourceBuf.sampleRate).toFixed(2));
  savedItem.peaks = computeNormalizedPeaks(slicedFloat, 180);

  delete decodedSampleBuffers[savedItem.id];
  clearPitchCacheForSample(savedItem.id);

  if (!persistSavedSamplesToStorage()) return;
  await decodeSampleToAudioBuffer(savedItem);

  resetChopMarkers(false);
  syncSampleDropdowns();
  if (sampleLibrarySelect) sampleLibrarySelect.value = savedItem.id;
  if (waveSelect) waveSelect.value = `sample:${savedItem.id}`;
  updateSampleChopperUI();
  recalculateStaticWaveform("synth");

  WAVECRAFT_DATA.tracks.forEach((t) => {
    if (drumSettings[t.id] && drumSettings[t.id].presetKey === `sample:${savedItem.id}`) {
      recalculateStaticWaveform(t.id);
    }
  });

  if (recStatusText) {
    recStatusText.textContent = `Applied chop to "${savedItem.name}" (${savedItem.duration.toFixed(2)}s).`;
  }
  triggerOneShotSynthNote(parseFloat(noteSelect.value) || 220);
}

// ============================================================================
// SAMPLE LIBRARY DROPDOWNS, RECORDING & SAVING (CLEAN OR WITH SOUND DESIGN)
// ============================================================================

function syncSampleDropdowns() {
  if (sampleLibrarySelect) {
    const prevLibVal = sampleLibrarySelect.value;
    sampleLibrarySelect.innerHTML = "";

    if (savedSamples.length === 0) {
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "-- No Saved Samples --";
      sampleLibrarySelect.appendChild(emptyOpt);
    } else {
      const promptOpt = document.createElement("option");
      promptOpt.value = "";
      promptOpt.textContent = "-- Select Saved Sample --";
      sampleLibrarySelect.appendChild(promptOpt);

      savedSamples.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        const fxTag = s.soundDesign ? " [FX]" : "";
        opt.textContent = `${s.name}${fxTag} (${s.duration.toFixed(2)}s)`;
        sampleLibrarySelect.appendChild(opt);
      });
    }

    if (prevLibVal && savedSamples.some((s) => s.id === prevLibVal)) {
      sampleLibrarySelect.value = prevLibVal;
    }
  }

  if (libraryCountEl) {
    libraryCountEl.textContent = String(savedSamples.length);
  }
  if (deleteSampleBtn && sampleLibrarySelect) {
    deleteSampleBtn.disabled = !sampleLibrarySelect.value;
  }

  if (waveSelect) {
    const prevWaveVal = waveSelect.value;
    waveSelect.innerHTML = `
      <optgroup label="ANALOG OSCILLATORS">
        <option value="sine">Sine (Smooth)</option>
        <option value="triangle">Triangle (Warm)</option>
        <option value="sawtooth">Sawtooth (Bright)</option>
        <option value="square">Square (Hollow)</option>
      </optgroup>
    `;

    if (pendingRecording || savedSamples.length > 0) {
      const sampleGroup = document.createElement("optgroup");
      sampleGroup.label = "MIC SAMPLES";

      if (pendingRecording) {
        const unsavedOpt = document.createElement("option");
        unsavedOpt.value = "sample:unsaved";
        unsavedOpt.textContent = `● Unsaved Take (${pendingRecording.duration.toFixed(2)}s)`;
        sampleGroup.appendChild(unsavedOpt);
      }

      savedSamples.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = `sample:${s.id}`;
        const fxTag = s.soundDesign ? " [FX]" : "";
        opt.textContent = `🎤 ${s.name}${fxTag} (${s.duration.toFixed(2)}s)`;
        sampleGroup.appendChild(opt);
      });

      waveSelect.appendChild(sampleGroup);
    }

    const stillExists = Array.from(waveSelect.options).some((o) => o.value === prevWaveVal);
    waveSelect.value = stillExists ? prevWaveVal : "sawtooth";
  }

  if (sequencerGrid && Object.keys(gridState).length > 0) {
    renderGrid();
  }
}

async function startMicRecording() {
  if (isRecordingMic) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (recStatusText) {
      recStatusText.textContent = "Mic unavailable (requires HTTPS or localhost).";
    }
    return;
  }

  await ensureAudioReady();
  const durationSec = Math.max(1, Math.min(5, Number(recLengthSelect ? recLengthSelect.value : 2) || 2));

  try {
    activeMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  } catch (err) {
    if (recStatusText) {
      recStatusText.textContent = "Mic permission denied or no microphone found.";
    }
    return;
  }

  isRecordingMic = true;
  if (recMicBtn) {
    recMicBtn.classList.add("is-recording");
    recMicBtn.textContent = "■ RECORDING...";
  }
  if (previewRecBtn) previewRecBtn.disabled = true;
  if (saveSampleBtn) saveSampleBtn.disabled = true;
  if (saveSampleFxBtn) saveSampleFxBtn.disabled = true;

  const sampleRate = audioCtx.sampleRate;
  const maxSamples = Math.floor(sampleRate * durationSec);
  const recordedChunks = [];
  let collectedSamples = 0;

  activeMicSource = audioCtx.createMediaStreamSource(activeMicStream);
  activeMicProcessor = audioCtx.createScriptProcessor(4096, 1, 1);

  // Keep a sub-audible (non-zero) gain path to destination so browsers never suspend or zero out the processor
  const silentSink = audioCtx.createGain();
  silentSink.gain.value = 0.00001;

  function finishRecording() {
    if (!isRecordingMic) return;
    isRecordingMic = false;
    clearInterval(recCountdownTimer);

    if (activeMicProcessor) {
      activeMicProcessor.disconnect();
      activeMicProcessor.onaudioprocess = null;
      activeMicProcessor = null;
    }
    if (activeMicSource) {
      activeMicSource.disconnect();
      activeMicSource = null;
    }
    silentSink.disconnect();
    if (activeMicStream) {
      activeMicStream.getTracks().forEach((t) => t.stop());
      activeMicStream = null;
    }

    if (recMicBtn) {
      recMicBtn.classList.remove("is-recording");
      recMicBtn.textContent = "● REC MIC";
    }

    const totalLen = Math.min(maxSamples, collectedSamples);
    if (totalLen < 256) {
      if (recStatusText) recStatusText.textContent = "No audio captured. Try again.";
      return;
    }

    const merged = new Float32Array(totalLen);
    let writePos = 0;
    for (let c = 0; c < recordedChunks.length && writePos < totalLen; c++) {
      const chunk = recordedChunks[c];
      const copyLen = Math.min(chunk.length, totalLen - writePos);
      merged.set(chunk.subarray(0, copyLen), writePos);
      writePos += copyLen;
    }

    // Remove any DC offset before normalizing so quiet mic signals aren't skewed
    let mean = 0;
    for (let i = 0; i < merged.length; i++) {
      mean += merged[i];
    }
    mean /= merged.length;

    let peak = 0.001;
    for (let i = 0; i < merged.length; i++) {
      merged[i] -= mean;
      const a = Math.abs(merged[i]);
      if (a > peak) peak = a;
    }

    if (peak < 0.002) {
      if (recStatusText) {
        recStatusText.textContent = "Mic signal was completely silent. Check OS input level.";
      }
      return;
    }

    const normGain = Math.min(18.0, 0.92 / peak);
    for (let i = 0; i < merged.length; i++) {
      merged[i] = Math.max(-1, Math.min(1, merged[i] * normGain));
    }

    const tempBuffer = audioCtx.createBuffer(1, merged.length, sampleRate);
    tempBuffer.getChannelData(0).set(merged);

    const peaks = computeNormalizedPeaks(merged, 180);
    pendingRecording = {
      floatData: merged,
      sampleRate: sampleRate,
      duration: merged.length / sampleRate,
      peaks: peaks,
      tempBuffer: tempBuffer
    };

    resetSampleSoundDesignToDefaults(true);

    clearPitchCacheForSample("unsaved");
    resetChopMarkers(false);
    syncSampleDropdowns();
    if (waveSelect) {
      waveSelect.value = "sample:unsaved";
    }
    updateSampleChopperUI();
    recalculateStaticWaveform("synth");

    if (previewRecBtn) previewRecBtn.disabled = false;
    updateSaveButtonsEnabledState();
    if (sampleNameInput && !sampleNameInput.value.trim()) {
      sampleNameInput.value = `Sample ${savedSamples.length + 1}`;
    }
    if (recStatusText) {
      recStatusText.textContent = `Captured ${pendingRecording.duration.toFixed(1)}s! Settings reset to default.`;
    }

    updateSoundDesignGuide({
      title: "Mic Sampler • New Recording (Settings Reset)",
      what: "Your new recording is loaded and all sound design knobs have been reset to clean defaults.",
      listen: "Chop your slice, sculpt with the knobs, and click SAVE CHOP + SOUND to keep your sound design with the sample!",
      watch: "Watch the highlighted region on the Sample Chopper screen and the reshaped wave on OSC Waveform."
    });

    triggerOneShotSynthNote(parseFloat(noteSelect.value) || 220, Math.min(1200, Math.round(pendingRecording.duration * 1000)));
  }

  activeMicProcessor.onaudioprocess = (e) => {
    if (!isRecordingMic) return;
    const input = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    recordedChunks.push(copy);
    collectedSamples += copy.length;
    if (collectedSamples >= maxSamples) {
      finishRecording();
    }
  };

  activeMicSource.connect(activeMicProcessor);
  activeMicProcessor.connect(silentSink);
  silentSink.connect(audioCtx.destination);

  let remaining = durationSec;
  if (recStatusText) {
    recStatusText.textContent = `Recording... ${remaining.toFixed(1)}s left`;
  }
  recCountdownTimer = setInterval(() => {
    remaining = Math.max(0, remaining - 0.1);
    if (isRecordingMic && recStatusText) {
      recStatusText.textContent = `Recording... ${remaining.toFixed(1)}s left`;
    }
  }, 100);
}

async function saveActiveSampleToLibrary(includeSoundDesign = true) {
  const soundDesignPayload = includeSoundDesign ? captureCurrentSampleSoundDesign() : null;

  if (pendingRecording) {
    const rawName = sampleNameInput ? sampleNameInput.value.trim() : "";
    const cleanName = (rawName || `Sample ${savedSamples.length + 1}`).slice(0, 24);

    const slicedFloat = extractChoppedFloatSlice(
      pendingRecording.floatData,
      pendingRecording.sampleRate,
      chopStartRatio,
      chopEndRatio
    );

    const compactFloat = downsampleMonoFloat32(
      slicedFloat,
      pendingRecording.sampleRate,
      SAMPLE_EXPORT_RATE
    );
    const wavDataUrl = encodeMonoWavDataUrl(compactFloat, SAMPLE_EXPORT_RATE);

    const newEntry = {
      id: `smp_${Date.now()}`,
      name: cleanName,
      duration: Number((slicedFloat.length / pendingRecording.sampleRate).toFixed(2)),
      wavDataUrl: wavDataUrl,
      peaks: computeNormalizedPeaks(slicedFloat, 180),
      soundDesign: soundDesignPayload
    };

    savedSamples.unshift(newEntry);
    if (!persistSavedSamplesToStorage()) {
      savedSamples.shift();
      return;
    }

    await decodeSampleToAudioBuffer(newEntry);
    pendingRecording = null;
    clearPitchCacheForSample("unsaved");
    resetChopMarkers(false);

    syncSampleDropdowns();
    if (sampleLibrarySelect) sampleLibrarySelect.value = newEntry.id;
    if (waveSelect) waveSelect.value = `sample:${newEntry.id}`;
    if (deleteSampleBtn) deleteSampleBtn.disabled = false;
    if (previewRecBtn) previewRecBtn.disabled = false;
    if (sampleNameInput) sampleNameInput.value = "";
    if (recStatusText) {
      recStatusText.textContent = includeSoundDesign
        ? `Saved "${newEntry.name}" + sound design to library!`
        : `Saved clean chop "${newEntry.name}" to library!`;
    }

    updateSampleChopperUI();
    recalculateStaticWaveform("synth");
    return;
  }

  const activeSample = getActiveChopperSample();
  if (!activeSample || activeSample.id === "unsaved") return;

  const savedItem = savedSamples.find((s) => s.id === activeSample.id);
  if (!savedItem) return;

  const hasTrimChange = chopStartRatio > 0.001 || chopEndRatio < 0.999;
  if (hasTrimChange) {
    const sourceBuf = await decodeSampleToAudioBuffer(savedItem);
    if (sourceBuf) {
      const fullFloat = sourceBuf.getChannelData(0);
      const slicedFloat = extractChoppedFloatSlice(fullFloat, sourceBuf.sampleRate, chopStartRatio, chopEndRatio);
      const compactFloat = downsampleMonoFloat32(slicedFloat, sourceBuf.sampleRate, SAMPLE_EXPORT_RATE);
      savedItem.wavDataUrl = encodeMonoWavDataUrl(compactFloat, SAMPLE_EXPORT_RATE);
      savedItem.duration = Number((slicedFloat.length / sourceBuf.sampleRate).toFixed(2));
      savedItem.peaks = computeNormalizedPeaks(slicedFloat, 180);
      delete decodedSampleBuffers[savedItem.id];
      clearPitchCacheForSample(savedItem.id);
      await decodeSampleToAudioBuffer(savedItem);
    }
  }

  savedItem.soundDesign = soundDesignPayload;
  if (!persistSavedSamplesToStorage()) return;

  resetChopMarkers(false);
  syncSampleDropdowns();
  if (sampleLibrarySelect) sampleLibrarySelect.value = savedItem.id;
  if (waveSelect) waveSelect.value = `sample:${savedItem.id}`;

  WAVECRAFT_DATA.tracks.forEach((t) => {
    if (drumSettings[t.id] && drumSettings[t.id].presetKey === `sample:${savedItem.id}`) {
      recalculateStaticWaveform(t.id);
    }
  });

  updateSampleChopperUI();
  recalculateStaticWaveform("synth");

  if (recStatusText) {
    recStatusText.textContent = includeSoundDesign
      ? `Updated "${savedItem.name}" with chop & sound design!`
      : `Saved "${savedItem.name}" with clean default settings!`;
  }
}

function deleteSelectedLibrarySample() {
  if (!sampleLibrarySelect || !sampleLibrarySelect.value) return;
  const targetId = sampleLibrarySelect.value;
  const idx = savedSamples.findIndex((s) => s.id === targetId);
  if (idx === -1) return;

  const removedName = savedSamples[idx].name;
  savedSamples.splice(idx, 1);
  delete decodedSampleBuffers[targetId];
  clearPitchCacheForSample(targetId);
  persistSavedSamplesToStorage();

  WAVECRAFT_DATA.tracks.forEach((track) => {
    if (drumSettings[track.id] && drumSettings[track.id].presetKey === `sample:${targetId}`) {
      const currentVol = drumSettings[track.id].volume;
      const currentEcho = drumSettings[track.id].echo || 0;
      const currentReverb = drumSettings[track.id].reverb || 0;
      drumSettings[track.id] = {
        presetKey: "presetA",
        ...track.soundPresets.presetA,
        volume: currentVol,
        echo: currentEcho,
        reverb: currentReverb
      };
      recalculateStaticWaveform(track.id);
    }
  });

  resetSampleSoundDesignToDefaults(true);
  resetChopMarkers(false);
  syncSampleDropdowns();
  updateSampleChopperUI();
  recalculateStaticWaveform("synth");
  renderDrumEditor();

  if (previewRecBtn) {
    previewRecBtn.disabled = !pendingRecording && !sampleLibrarySelect.value;
  }
  if (recStatusText) {
    recStatusText.textContent = `Deleted "${removedName}" from library.`;
  }
}

// ============================================================================
// RACK DEFAULTS, TEMPO SYNC & GAIN-STAGED WEB AUDIO BUS INITIALIZATION
// ============================================================================

function initRackDefaults() {
  Object.values(WAVECRAFT_DATA.rackModules).forEach((mod) => {
    mod.knobs.forEach((k) => {
      rackState.params[k.id] = k.defaultValue;
    });
  });
}

function getSyncedDelayTimeSeconds() {
  const mode = rackState.delaySync || "free";
  if (mode === "free") return 0.28;

  const bpm = Math.max(40, Math.min(240, Number(bpmInput.value) || 120));
  const quarterSec = 60 / bpm;

  if (mode === "1/8") return Math.min(0.95, quarterSec * 0.5);
  if (mode === "1/8d") return Math.min(0.95, quarterSec * 0.75);
  if (mode === "1/4") return Math.min(0.95, quarterSec);
  return 0.28;
}

function makeDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  if (amount <= 0.5) {
    for (let i = 0; i < samples; i++) {
      curve[i] = (i * 2) / samples - 1;
    }
    return curve;
  }
  const driveGain = 1 + (amount / 100) * 16;
  const norm = Math.tanh(driveGain * 0.85);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.max(-1, Math.min(1, Math.tanh(x * driveGain) / norm));
  }
  return curve;
}

function createReverbImpulse(ctx, duration = 2.2, decay = 2.2) {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  const earlyTapsL = [0.011, 0.023, 0.037, 0.053, 0.071];
  const earlyTapsR = [0.014, 0.027, 0.041, 0.059, 0.079];

  for (let ch = 0; ch < 2; ch++) {
    const channelData = impulse.getChannelData(ch);
    const taps = ch === 0 ? earlyTapsL : earlyTapsR;

    taps.forEach((tapSec, idx) => {
      const tapSample = Math.floor(tapSec * sampleRate);
      if (tapSample < length) {
        const polarity = idx % 2 === 0 ? 1 : -1;
        channelData[tapSample] += polarity * (0.55 / (idx + 1));
      }
    });

    let lpState = 0;
    for (let i = 0; i < length; i++) {
      const progress = i / length;
      const env = Math.pow(1 - progress, decay);
      const white = (Math.random() * 2 - 1) * env;

      const dampAlpha = Math.max(0.08, 0.68 * (1 - progress * 0.85));
      lpState += dampAlpha * (white - lpState);

      channelData[i] = channelData[i] * 0.65 + lpState * 0.72;
    }
  }
  return impulse;
}

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    const bufferSize = audioCtx.sampleRate * 4;
    noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    reverbImpulseBuffer = createReverbImpulse(audioCtx);

    masterBusGain = audioCtx.createGain();
    masterBusGain.gain.value = 0.88;
    masterBusGain.connect(audioCtx.destination);

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

    previewFilterNode = audioCtx.createBiquadFilter();

    eqSpectrumAnalyser = audioCtx.createAnalyser();
    eqSpectrumAnalyser.fftSize = 512;
    eqSpectrumAnalyser.smoothingTimeConstant = 0.82;
    eqSpectrumData = new Uint8Array(eqSpectrumAnalyser.frequencyBinCount);

    // 1. SYNTH-ISOLATED SPACE & DYNAMICS BUS
    synthSpaceInputBus = audioCtx.createGain();
    synthDryGain = audioCtx.createGain();
    synthDryGain.gain.value = 1.0;

    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = getSyncedDelayTimeSeconds();
    delayFeedbackGain = audioCtx.createGain();
    delayWetGain = audioCtx.createGain();

    reverbConvolver = audioCtx.createConvolver();
    reverbConvolver.buffer = reverbImpulseBuffer;
    reverbWetGain = audioCtx.createGain();

    synthDynamicsInputBus = audioCtx.createGain();

    driveNode = audioCtx.createWaveShaper();
    driveNode.oversample = "4x";

    driveSmoothingFilter = audioCtx.createBiquadFilter();
    driveSmoothingFilter.type = "lowpass";
    driveSmoothingFilter.frequency.value = 9000;
    driveSmoothingFilter.Q.value = 0.5;

    compressorNode = audioCtx.createDynamicsCompressor();

    gateAnalyserNode = audioCtx.createAnalyser();
    gateAnalyserNode.fftSize = 256;
    gateTimeData = new Float32Array(gateAnalyserNode.fftSize);

    gateGainNode = audioCtx.createGain();
    gateGainNode.gain.value = 1.0;

    synthSpaceInputBus.connect(synthDryGain);
    synthDryGain.connect(synthDynamicsInputBus);

    synthSpaceInputBus.connect(delayNode);
    delayNode.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delayNode);
    delayNode.connect(delayWetGain);
    delayWetGain.connect(synthDynamicsInputBus);

    synthSpaceInputBus.connect(reverbConvolver);
    reverbConvolver.connect(reverbWetGain);
    reverbWetGain.connect(synthDynamicsInputBus);

    synthDynamicsInputBus.connect(driveNode);
    driveNode.connect(driveSmoothingFilter);
    driveSmoothingFilter.connect(compressorNode);
    compressorNode.connect(gateAnalyserNode);
    gateAnalyserNode.connect(gateGainNode);
    gateGainNode.connect(eqBassFilter);

    // 2. DEDICATED DRUM BUS WITH TRANSPARENT PEAK LIMITER
    drumBusInput = audioCtx.createGain();
    drumBusInput.gain.value = 0.95;

    drumBusLimiter = audioCtx.createDynamicsCompressor();
    drumBusLimiter.threshold.value = -3.0;
    drumBusLimiter.knee.value = 2.0;
    drumBusLimiter.ratio.value = 12.0;
    drumBusLimiter.attack.value = 0.003;
    drumBusLimiter.release.value = 0.08;

    drumDelayInputBus = audioCtx.createGain();
    drumDelayNode = audioCtx.createDelay(1.0);
    drumDelayNode.delayTime.value = getSyncedDelayTimeSeconds();
    drumDelayFeedbackGain = audioCtx.createGain();
    drumDelayFeedbackGain.gain.value = 0.42;
    drumGlobalDelayWetGain = audioCtx.createGain();

    drumReverbInputBus = audioCtx.createGain();
    drumReverbConvolver = audioCtx.createConvolver();
    drumReverbConvolver.buffer = reverbImpulseBuffer;
    drumGlobalReverbWetGain = audioCtx.createGain();

    drumBusInput.connect(drumBusLimiter);

    drumDelayInputBus.connect(drumDelayNode);
    drumDelayNode.connect(drumDelayFeedbackGain);
    drumDelayFeedbackGain.connect(drumDelayNode);
    drumDelayNode.connect(drumGlobalDelayWetGain);
    drumGlobalDelayWetGain.connect(drumBusLimiter);

    drumReverbInputBus.connect(drumReverbConvolver);
    drumReverbConvolver.connect(drumGlobalReverbWetGain);
    drumGlobalReverbWetGain.connect(drumBusLimiter);

    drumBusLimiter.connect(eqBassFilter);

    // 3. SHARED 3-BAND EQ -> SPECTRUM ANALYSER -> MASTER OUT
    eqBassFilter.connect(eqMidFilter);
    eqMidFilter.connect(eqTrebleFilter);
    eqTrebleFilter.connect(eqSpectrumAnalyser);
    eqSpectrumAnalyser.connect(masterBusGain);

    updateMasterFxParams();

    savedSamples.forEach((s) => {
      decodeSampleToAudioBuffer(s);
    });
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (!animLoopStarted) {
    animLoopStarted = true;
    animationFrameLoop();
  }
}

async function ensureAudioReady() {
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch (_) {
      // Ignore browser autoplay restrictions until user gesture
    }
  }
}

function updateRealtimeNoiseGate() {
  if (!audioCtx || !gateAnalyserNode || !gateGainNode) return;
  const now = audioCtx.currentTime;

  if (rackState.bypass.dynamics || activePolyVoices.size > 0) {
    gateGainNode.gain.setTargetAtTime(1.0, now, 0.008);
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

function updateMasterFxParams() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

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

  const syncedDelaySec = getSyncedDelayTimeSeconds();
  if (delayNode) {
    delayNode.delayTime.setTargetAtTime(syncedDelaySec, now, 0.02);
  }
  if (drumDelayNode) {
    drumDelayNode.delayTime.setTargetAtTime(syncedDelaySec, now, 0.02);
  }

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

  if (drumGlobalDelayWetGain && drumDelayFeedbackGain) {
    const globalDrumEcho = drumGlobalSpace.echo / 100;
    drumGlobalDelayWetGain.gain.setTargetAtTime(globalDrumEcho * 0.72, now, 0.01);
    drumDelayFeedbackGain.gain.setTargetAtTime(0.2 + globalDrumEcho * 0.38, now, 0.01);
  }
  if (drumGlobalReverbWetGain) {
    const globalDrumRev = drumGlobalSpace.reverb / 100;
    drumGlobalReverbWetGain.gain.setTargetAtTime(globalDrumRev * 0.9, now, 0.01);
  }
}

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

function computeCombinedEqResponseDb() {
  const totalDb = new Float32Array(EQ_GRAPH_POINTS);

  if (audioCtx && eqBassFilter && eqMidFilter && eqTrebleFilter && previewFilterNode) {
    const magBass = new Float32Array(EQ_GRAPH_POINTS);
    const magMid = new Float32Array(EQ_GRAPH_POINTS);
    const magTreble = new Float32Array(EQ_GRAPH_POINTS);
    const phaseDummy = new Float32Array(EQ_GRAPH_POINTS);

    eqBassFilter.getFrequencyResponse(eqFreqArray, magBass, phaseDummy);
    eqMidFilter.getFrequencyResponse(eqFreqArray, magMid, phaseDummy);
    eqTrebleFilter.getFrequencyResponse(eqFreqArray, magTreble, phaseDummy);

    let magSynthFilter = null;
    if (!rackState.bypass.filter) {
      previewFilterNode.type = rackState.filterType;
      previewFilterNode.frequency.value = rackState.params.cutoff;
      previewFilterNode.Q.value = rackState.params.resonance;
      magSynthFilter = new Float32Array(EQ_GRAPH_POINTS);
      previewFilterNode.getFrequencyResponse(eqFreqArray, magSynthFilter, phaseDummy);
    }

    for (let i = 0; i < EQ_GRAPH_POINTS; i++) {
      let combinedMag = magBass[i] * magMid[i] * magTreble[i];
      if (magSynthFilter) {
        combinedMag *= Math.pow(magSynthFilter[i], 0.45);
      }
      const db = 20 * Math.log10(Math.max(0.0001, combinedMag));
      totalDb[i] = Math.max(-22, Math.min(22, db));
    }
    return totalDb;
  }

  const bassGain = rackState.bypass.eq ? 0 : rackState.params.eqBass;
  const midGain = rackState.bypass.eq ? 0 : rackState.params.eqMid;
  const trebleGain = rackState.bypass.eq ? 0 : rackState.params.eqTreble;

  for (let i = 0; i < EQ_GRAPH_POINTS; i++) {
    const f = eqFreqArray[i];
    const bassShelf = bassGain / (1 + Math.pow(f / 120, 2));
    const logDist = Math.log2(f / 1000);
    const midBell = midGain * Math.exp(-0.5 * Math.pow(logDist / 0.65, 2));
    const trebleShelf = trebleGain / (1 + Math.pow(4500 / f, 2));

    let db = bassShelf + midBell + trebleShelf;

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

  eqCtx.fillStyle = "#06110e";
  eqCtx.fillRect(0, 0, w, h);

  eqCtx.strokeStyle = "rgba(45, 212, 191, 0.14)";
  eqCtx.lineWidth = 1;

  eqCtx.beginPath();
  eqCtx.moveTo(0, midY);
  eqCtx.lineTo(w, midY);
  eqCtx.stroke();

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

function samplePeakArray(peaks, tNorm) {
  if (!peaks || peaks.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, tNorm));
  const exactIdx = clamped * (peaks.length - 1);
  const idx0 = Math.floor(exactIdx);
  const idx1 = Math.min(peaks.length - 1, idx0 + 1);
  const frac = exactIdx - idx0;
  return peaks[idx0] * (1 - frac) + peaks[idx1] * frac;
}

function recalculateStaticWaveform(channelId) {
  const vis = channelVisuals[channelId];
  if (!vis || !vis.canvas) return;

  const numSamples = vis.canvas.width * 2;
  const points = new Float32Array(numSamples);

  if (channelId === "synth") {
    const waveType = waveSelect ? waveSelect.value : "sawtooth";
    const isSample = waveType.startsWith("sample:");
    const sampleObj = isSample ? getSampleById(waveType) : null;
    const slicedPeaks = isSample && sampleObj
      ? getChoppedPeaksSlice(sampleObj.peaks, chopStartRatio, chopEndRatio)
      : null;

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

    const slicedDuration = isSample && sampleObj
      ? Math.max(0.05, sampleObj.duration * (chopEndRatio - chopStartRatio))
      : 0.65;
    const baseDur = isSample && sampleObj ? Math.max(0.15, slicedDuration) : 0.65;
    const holdTime = isSample && sampleObj ? Math.max(0.08, slicedDuration - (attack + decay)) : 0.25;
    const totalDur = adsrBypass ? baseDur : Math.max(0.15, attack + decay + holdTime + release);

    const pitchMult = tuningBypass ? 1.0 : Math.pow(2, pitch / 12);
    const baseCycles = Math.max(4, Math.min(38, 14 * Math.pow(pitchMult, 0.55)));
    const detuneRatio = tuningBypass ? 1.0 : Math.pow(2, detune / 1200);
    const hasDetuneTwin = !tuningBypass && Math.abs(detune) > 0.5;

    const delaySec = getSyncedDelayTimeSeconds();
    const echoOffsetRatio = Math.min(0.45, Math.max(0.12, delaySec / Math.max(0.6, totalDur)));

    let lpState = 0;
    let bpState = 0;

    for (let i = 0; i < numSamples; i++) {
      const tNorm = i / (numSamples - 1);
      const tSec = tNorm * totalDur;

      let env = 1.0;
      if (adsrBypass) {
        env = tNorm < 0.9 ? 0.92 : Math.max(0, 0.92 * (1 - (tNorm - 0.9) / 0.1));
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

      const lfoWave = Math.sin(tNorm * Math.PI * 2 * (1.5 + (modDepth / 100) * 6));
      const effectiveCutoff = filterBypass
        ? 8500
        : Math.max(60, Math.min(8500, cutoff + (modDepth / 100) * cutoff * 0.75 * lfoWave));

      let rawSample = 0;
      if (isSample && slicedPeaks && slicedPeaks.length > 0) {
        rawSample = samplePeakArray(slicedPeaks, tNorm);
        if (hasDetuneTwin) {
          const twinSample = samplePeakArray(slicedPeaks, Math.min(1, tNorm * 0.992 + 0.008));
          rawSample = (rawSample + twinSample) * 0.65;
        }
      } else {
        rawSample = sampleOscillator(waveType, tNorm * baseCycles);
        if (hasDetuneTwin) {
          const twinSample = sampleOscillator(waveType, tNorm * baseCycles * detuneRatio + 0.17);
          rawSample = (rawSample + twinSample) * 0.62;
        }
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

      if (!spaceBypass && (echo > 2 || reverb > 2)) {
        const echoShift = Math.floor(numSamples * echoOffsetRatio);
        if (echo > 2 && i > echoShift) {
          sample += points[i - echoShift] * (echo / 100) * 0.55;
        }
        if (reverb > 2 && tNorm > 0.25) {
          const revWash = Math.sin(i * 0.47) * Math.cos(i * 0.23) * (reverb / 100) * 0.28 * (1 - tNorm * 0.6);
          sample += revWash;
        }
      }

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
    const s = drumSettings[channelId];
    if (!s) return;

    const isSample = s.presetKey && s.presetKey.startsWith("sample:");
    const sampleObj = isSample ? getSampleById(s.presetKey) : null;
    const sd = sampleObj && sampleObj.soundDesign ? sampleObj.soundDesign : null;

    const totalDur = isSample && sampleObj
      ? Math.max(0.1, sampleObj.duration)
      : Math.max(0.06, s.attack + s.decay);
    const attackRatio = Math.min(0.65, s.attack / totalDur);
    let lpState = 0;

    for (let i = 0; i < numSamples; i++) {
      const tNorm = i / (numSamples - 1);

      let env = 1.0;
      if (tNorm < attackRatio) {
        env = tNorm / Math.max(0.001, attackRatio);
      } else if (!isSample) {
        const decRatio = (tNorm - attackRatio) / Math.max(0.001, 1 - attackRatio);
        env = Math.pow(Math.max(0, 1 - decRatio), 2.3);
      } else {
        env = tNorm > 0.9 ? Math.max(0, 1 - (tNorm - 0.9) / 0.1) : 1.0;
      }

      if (!isSample && s.engine === "clap" && tNorm < 0.14) {
        const burst = Math.abs(Math.sin(tNorm * Math.PI * 22));
        env *= 0.45 + 0.55 * burst;
      }

      let raw = 0;
      if (isSample && sampleObj && sampleObj.peaks) {
        raw = samplePeakArray(sampleObj.peaks, tNorm);
      } else if (s.engine === "metallic") {
        const ratios = [1.0, 1.483, 1.932, 2.546, 3.012, 3.847];
        let metalSum = 0;
        for (let r = 0; r < ratios.length; r++) {
          metalSum += sampleOscillator("square", (s.startFreq / 80) * ratios[r] * tNorm * 5.0);
        }
        const pseudoNoise = Math.sin(i * 12.9898) * Math.cos(i * 78.233);
        raw = (metalSum / ratios.length) * (s.metallicTone || 0.8) + pseudoNoise * (s.noiseMix * 0.55);
      } else {
        const freqCurve = s.startFreq * Math.pow(Math.max(20, s.endFreq) / s.startFreq, Math.pow(tNorm, 0.72));
        const phase = (freqCurve / 55) * tNorm * 4.5;
        const tone = sampleOscillator(s.wave, phase);
        const pseudoNoise = Math.sin(i * 12.9898) * Math.cos(i * 78.233);
        raw = tone * (1 - s.noiseMix * 0.45) + pseudoNoise * s.noiseMix;
      }

      const highSmooth = Math.min(0.96, Math.max(0.08, s.highCut / 14000));
      lpState += highSmooth * (raw - lpState);
      raw = lpState;

      const lowThin = Math.max(0.45, 1 - (s.lowCut - 20) / 2200);
      const midFactor = Math.pow(10, s.midCut / 36);

      let shaped = raw * env * lowThin * midFactor * Math.max(0.2, s.volume);

      if (sd && sd.params && !sd.bypass?.dynamics && sd.params.drive > 0) {
        const dGain = 1 + (sd.params.drive / 100) * 12;
        shaped = Math.tanh(shaped * dGain) / Math.tanh(dGain * 0.82);
      }

      points[i] = Math.max(-1, Math.min(1, shaped));
    }
  }

  vis.wavePoints = points;
}

function drawChannelCanvas(vis, nowTime) {
  if (!vis || !vis.ctx || !vis.canvas) return;
  const { ctx, canvas, color, wavePoints, playhead } = vis;
  const width = canvas.width;
  const height = canvas.height;
  const halfH = height * 0.5;

  ctx.fillStyle = "#06110e";
  ctx.fillRect(0, 0, width, height);

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
// MULTI-STAGE ANALOG DRUM SYNTHESIS & SAVED SAMPLE DRUM ENGINE
// ============================================================================

function initDrumSettings() {
  WAVECRAFT_DATA.tracks.forEach((track) => {
    drumSettings[track.id] = {
      presetKey: "presetA",
      ...track.soundPresets.presetA,
      echo: 0,
      reverb: 0
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

function connectDrumTrackOutput(outputNode, trackSettings, startTime) {
  outputNode.connect(drumBusInput);

  const trackEchoAmt = (trackSettings.echo || 0) / 100;
  if (trackEchoAmt > 0.005 && drumDelayInputBus) {
    const echoSend = audioCtx.createGain();
    echoSend.gain.setValueAtTime(trackEchoAmt * 0.85, startTime);
    outputNode.connect(echoSend);
    echoSend.connect(drumDelayInputBus);
  }

  const trackReverbAmt = (trackSettings.reverb || 0) / 100;
  if (trackReverbAmt > 0.005 && drumReverbInputBus) {
    const reverbSend = audioCtx.createGain();
    reverbSend.gain.setValueAtTime(trackReverbAmt * 0.9, startTime);
    outputNode.connect(reverbSend);
    reverbSend.connect(drumReverbInputBus);
  }
}

function createNoiseSourceWithRandomOffset(startTime, durationSec) {
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuffer;
  const maxOffset = Math.max(0.1, noiseBuffer.duration - durationSec - 0.1);
  const randomOffset = Math.random() * Math.min(2.5, maxOffset);
  noise.start(startTime, randomOffset);
  noise.stop(startTime + durationSec + 0.03);
  return noise;
}

function makeSoftClipCurve(warmth = 0.3) {
  const n = 2048;
  const curve = new Float32Array(n);
  const drive = 1 + warmth * 2.6;
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

function chokeActiveOpenHat(atTime) {
  if (!activeOpenHatVoice || !audioCtx) return;
  try {
    const { gainNode, stopTime } = activeOpenHatVoice;
    if (atTime < stopTime) {
      gainNode.gain.cancelScheduledValues(atTime);
      gainNode.gain.setValueAtTime(Math.max(0.0001, gainNode.gain.value), atTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.018);
    }
  } catch (_) {
    // Ignore already finished nodes
  }
  activeOpenHatVoice = null;
}

async function playDrumSound(trackId, when = null, ignoreMuteSolo = false, stepVelocity = 0.85) {
  await ensureAudioReady();
  if (!ignoreMuteSolo && !isTrackAudible(trackId)) return;

  const s = drumSettings[trackId];
  if (!s || s.volume <= 0.01) return;

  const vel = Math.max(0.1, Math.min(1.0, Number(stepVelocity) || 0.85));
  const effectiveVolume = s.volume * vel;
  const velHighCut = Math.min(18000, s.highCut * (0.72 + 0.28 * vel));

  const startTime = when !== null ? when : audioCtx.currentTime;
  const attack = Math.max(0.001, s.attack);

  if (trackId === "hihat") {
    chokeActiveOpenHat(startTime);
  }

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
  highCutFilter.frequency.setValueAtTime(velHighCut, startTime);

  lowCutFilter.connect(midCutFilter);
  midCutFilter.connect(highCutFilter);
  connectDrumTrackOutput(highCutFilter, s, startTime);

  // Branch A: Saved Mic Sample assigned to this drum track
  if (s.presetKey && s.presetKey.startsWith("sample:")) {
    const sampleObj = getSampleById(s.presetKey);
    if (!sampleObj) return;
    const rawBuffer = sampleObj.audioBuffer || (await decodeSampleToAudioBuffer(sampleObj));
    if (!rawBuffer) return;

    const sd = sampleObj.soundDesign || null;
    const sdParams = sd && sd.params ? sd.params : {};
    const sdBypass = sd && sd.bypass ? sd.bypass : {};

    const pitchSemis = !sd || sdBypass.tuning ? 0 : (sdParams.pitch || 0);
    const detuneCents = !sd || sdBypass.tuning ? 0 : (sdParams.detune || 0);
    const pitchRatio = Math.max(0.25, Math.min(4.0, Math.pow(2, pitchSemis / 12)));

    const pitchedBuffer = getProcessedSampleBuffer(sampleObj, rawBuffer, false, pitchRatio);
    const fixedDur = pitchedBuffer.duration;

    const srcPrimary = audioCtx.createBufferSource();
    srcPrimary.buffer = pitchedBuffer;

    const sourceMixer = audioCtx.createGain();
    sourceMixer.gain.value = 1.0;
    srcPrimary.connect(sourceMixer);

    let srcTwin = null;
    if (sd && !sdBypass.tuning && Math.abs(detuneCents) > 0.5) {
      const twinRatio = pitchRatio * Math.pow(2, detuneCents / 1200);
      const twinBuffer = getProcessedSampleBuffer(sampleObj, rawBuffer, false, twinRatio);
      srcTwin = audioCtx.createBufferSource();
      srcTwin.buffer = twinBuffer;

      const twinGain = audioCtx.createGain();
      twinGain.gain.value = 0.72;
      srcTwin.connect(twinGain);
      twinGain.connect(sourceMixer);
      sourceMixer.gain.value = 0.72;
    }

    let chainNode = sourceMixer;

    if (sd && !sdBypass.filter) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = sd.filterType || "lowpass";
      const cutoffVal = sdParams.cutoff !== undefined ? sdParams.cutoff : 2200;
      const resVal = sdParams.resonance !== undefined ? sdParams.resonance : 3.0;
      filter.frequency.setValueAtTime(cutoffVal, startTime);
      filter.Q.setValueAtTime(resVal, startTime);

      const modAmt = sdParams.modDepth || 0;
      if (modAmt > 0) {
        const lfoOsc = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfoOsc.type = "sine";
        lfoOsc.frequency.setValueAtTime(1.5 + (modAmt / 100) * 9, startTime);
        lfoGain.gain.setValueAtTime((modAmt / 100) * (cutoffVal * 0.85), startTime);
        lfoOsc.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfoOsc.start(startTime);
        lfoOsc.stop(startTime + fixedDur + 1.5);
      }

      chainNode.connect(filter);
      chainNode = filter;
    }

    if (sd && !sdBypass.eq) {
      const sBass = audioCtx.createBiquadFilter();
      sBass.type = "lowshelf";
      sBass.frequency.setValueAtTime(120, startTime);
      sBass.gain.setValueAtTime(sdParams.eqBass || 0, startTime);

      const sMid = audioCtx.createBiquadFilter();
      sMid.type = "peaking";
      sMid.frequency.setValueAtTime(1000, startTime);
      sMid.Q.setValueAtTime(1.1, startTime);
      sMid.gain.setValueAtTime(sdParams.eqMid || 0, startTime);

      const sTreble = audioCtx.createBiquadFilter();
      sTreble.type = "highshelf";
      sTreble.frequency.setValueAtTime(4500, startTime);
      sTreble.gain.setValueAtTime(sdParams.eqTreble || 0, startTime);

      chainNode.connect(sBass);
      sBass.connect(sMid);
      sMid.connect(sTreble);
      chainNode = sTreble;
    }

    if (sd && !sdBypass.dynamics) {
      if ((sdParams.drive || 0) > 0.5) {
        const sDrive = audioCtx.createWaveShaper();
        sDrive.oversample = "2x";
        sDrive.curve = makeDistortionCurve(sdParams.drive);
        chainNode.connect(sDrive);
        chainNode = sDrive;
      }
      if ((sdParams.compression || 0) > 1) {
        const sComp = audioCtx.createDynamicsCompressor();
        const compPct = sdParams.compression / 100;
        sComp.threshold.setValueAtTime(-4 - compPct * 42, startTime);
        sComp.ratio.setValueAtTime(1 + compPct * 15, startTime);
        sComp.attack.setValueAtTime(0.004, startTime);
        sComp.release.setValueAtTime(0.14, startTime);
        chainNode.connect(sComp);
        chainNode = sComp;
      }
    }

    const envGain = audioCtx.createGain();
    let totalPlayDur = fixedDur;

    if (sd && !sdBypass.adsr) {
      const sdAttack = Math.max(0.002, sdParams.attack !== undefined ? sdParams.attack : 0.02);
      const sdDecay = Math.max(0.01, sdParams.decay !== undefined ? sdParams.decay : 0.25);
      const sdSustain = sdParams.sustain !== undefined ? sdParams.sustain : 0.55;
      const sdRelease = Math.max(0.02, sdParams.release !== undefined ? sdParams.release : 0.35);

      const holdTime = Math.max(0.05, fixedDur - (sdAttack + sdDecay));
      const peakGain = effectiveVolume * 1.1;
      const sustainGain = Math.max(0.001, peakGain * sdSustain);
      totalPlayDur = sdAttack + sdDecay + holdTime + sdRelease;

      envGain.gain.setValueAtTime(0.0001, startTime);
      envGain.gain.linearRampToValueAtTime(peakGain, startTime + sdAttack);
      envGain.gain.exponentialRampToValueAtTime(sustainGain, startTime + sdAttack + sdDecay);
      envGain.gain.setValueAtTime(sustainGain, startTime + sdAttack + sdDecay + holdTime);
      envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalPlayDur);
    } else {
      envGain.gain.setValueAtTime(0.0001, startTime);
      envGain.gain.linearRampToValueAtTime(effectiveVolume, startTime + Math.min(attack, fixedDur * 0.5));
      envGain.gain.setValueAtTime(effectiveVolume, startTime + Math.max(attack, fixedDur - 0.02));
      envGain.gain.linearRampToValueAtTime(0.0001, startTime + fixedDur);
    }

    triggerWaveformPlayhead(trackId, startTime, Math.max(0.12, totalPlayDur));

    chainNode.connect(envGain);
    envGain.connect(lowCutFilter);

    srcPrimary.start(startTime);
    srcPrimary.stop(startTime + totalPlayDur + 0.04);
    if (srcTwin) {
      srcTwin.start(startTime);
      srcTwin.stop(startTime + totalPlayDur + 0.04);
    }
    return;
  }

  // Branch B: Multi-Stage Studio Analog Drum Synthesis
  const totalTime = attack + s.decay;
  const engine = s.engine || "tom";
  triggerWaveformPlayhead(trackId, startTime, Math.max(0.12, totalTime));

  if (engine === "kick") {
    const bodyOsc = audioCtx.createOscillator();
    bodyOsc.type = s.wave || "sine";
    bodyOsc.frequency.setValueAtTime(s.startFreq, startTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(24, s.endFreq * 1.15), startTime + 0.045);
    bodyOsc.frequency.exponentialRampToValueAtTime(Math.max(20, s.endFreq), startTime + totalTime);

    const clickOsc = audioCtx.createOscillator();
    clickOsc.type = "triangle";
    clickOsc.frequency.setValueAtTime(Math.max(160, s.startFreq * 1.15), startTime);
    clickOsc.frequency.exponentialRampToValueAtTime(42, startTime + 0.025);

    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.45 * vel, startTime);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.028);

    const kickSum = audioCtx.createGain();
    kickSum.gain.value = 1.0;

    bodyOsc.connect(kickSum);
    clickOsc.connect(clickGain);
    clickGain.connect(kickSum);

    if (s.noiseMix > 0.01) {
      const beaterNoise = createNoiseSourceWithRandomOffset(startTime, 0.024);
      const noiseBp = audioCtx.createBiquadFilter();
      noiseBp.type = "bandpass";
      noiseBp.frequency.setValueAtTime(1400, startTime);
      noiseBp.Q.value = 1.4;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(s.noiseMix * 0.5, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.022);
      beaterNoise.connect(noiseBp);
      noiseBp.connect(noiseGain);
      noiseGain.connect(kickSum);
    }

    const softClip = audioCtx.createWaveShaper();
    softClip.curve = makeSoftClipCurve(s.warmth || 0.35);

    const envGain = audioCtx.createGain();
    envGain.gain.setValueAtTime(0.0001, startTime);
    envGain.gain.linearRampToValueAtTime(effectiveVolume * 1.05, startTime + attack);
    envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime);

    kickSum.connect(softClip);
    softClip.connect(envGain);
    envGain.connect(lowCutFilter);

    bodyOsc.start(startTime);
    clickOsc.start(startTime);
    bodyOsc.stop(startTime + totalTime + 0.03);
    clickOsc.stop(startTime + 0.035);
    return;
  }

  if (engine === "snare") {
    const shellLow = audioCtx.createOscillator();
    shellLow.type = s.wave || "triangle";
    shellLow.frequency.setValueAtTime(s.startFreq, startTime);
    shellLow.frequency.exponentialRampToValueAtTime(Math.max(60, s.endFreq), startTime + totalTime * 0.65);

    const shellHigh = audioCtx.createOscillator();
    shellHigh.type = "sine";
    shellHigh.frequency.setValueAtTime(s.startFreq * 1.78, startTime);
    shellHigh.frequency.exponentialRampToValueAtTime(Math.max(110, s.endFreq * 1.65), startTime + totalTime * 0.55);

    const shellGain = audioCtx.createGain();
    shellGain.gain.setValueAtTime(0.55 * (1 - s.noiseMix * 0.35), startTime);
    shellGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime * 0.72);

    shellLow.connect(shellGain);
    shellHigh.connect(shellGain);

    const snareNoise = createNoiseSourceWithRandomOffset(startTime, totalTime);
    const wireFilter = audioCtx.createBiquadFilter();
    wireFilter.type = "bandpass";
    wireFilter.frequency.setValueAtTime(1950, startTime);
    wireFilter.Q.setValueAtTime(0.85, startTime);

    const wireGain = audioCtx.createGain();
    wireGain.gain.setValueAtTime(0.0001, startTime);
    wireGain.gain.linearRampToValueAtTime(s.noiseMix * 0.95, startTime + attack);
    wireGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime);

    snareNoise.connect(wireFilter);
    wireFilter.connect(wireGain);

    const masterEnv = audioCtx.createGain();
    masterEnv.gain.setValueAtTime(effectiveVolume, startTime);

    shellGain.connect(masterEnv);
    wireGain.connect(masterEnv);
    masterEnv.connect(lowCutFilter);

    shellLow.start(startTime);
    shellHigh.start(startTime);
    shellLow.stop(startTime + totalTime + 0.03);
    shellHigh.stop(startTime + totalTime + 0.03);
    return;
  }

  if (engine === "clap") {
    const spread = s.spreadMs || 0.012;
    const clapNoise = createNoiseSourceWithRandomOffset(startTime, totalTime + spread * 3);

    const clapBp = audioCtx.createBiquadFilter();
    clapBp.type = "bandpass";
    clapBp.frequency.setValueAtTime(1250, startTime);
    clapBp.Q.setValueAtTime(1.35, startTime);

    const clapEnv = audioCtx.createGain();
    clapEnv.gain.setValueAtTime(0.0001, startTime);

    for (let b = 0; b < 3; b++) {
      const bStart = startTime + b * spread;
      clapEnv.gain.setValueAtTime(0.0001, bStart);
      clapEnv.gain.linearRampToValueAtTime(effectiveVolume * (0.85 + b * 0.07), bStart + 0.002);
      clapEnv.gain.exponentialRampToValueAtTime(0.08 * effectiveVolume, bStart + spread * 0.88);
    }

    const tailStart = startTime + 3 * spread;
    clapEnv.gain.setValueAtTime(effectiveVolume, tailStart);
    clapEnv.gain.exponentialRampToValueAtTime(0.0001, tailStart + s.decay);

    const bodyOsc1 = audioCtx.createOscillator();
    bodyOsc1.type = "triangle";
    bodyOsc1.frequency.setValueAtTime(s.startFreq, startTime);
    bodyOsc1.frequency.exponentialRampToValueAtTime(Math.max(80, s.endFreq), startTime + 0.06);

    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(effectiveVolume * 0.28, startTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.065);

    clapNoise.connect(clapBp);
    clapBp.connect(clapEnv);
    clapEnv.connect(lowCutFilter);

    bodyOsc1.connect(bodyGain);
    bodyGain.connect(lowCutFilter);

    bodyOsc1.start(startTime);
    bodyOsc1.stop(startTime + 0.075);
    return;
  }

  if (engine === "metallic") {
    const metalBus = audioCtx.createGain();
    metalBus.gain.value = 1.0;

    const ratios = [1.0, 1.483, 1.932, 2.546, 3.012, 3.847];
    const oscLevel = (s.metallicTone || 0.85) * (0.24 / ratios.length);

    ratios.forEach((ratio) => {
      const osc = audioCtx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(s.startFreq * ratio, startTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(180, s.endFreq * ratio), startTime + totalTime);

      const g = audioCtx.createGain();
      g.gain.value = oscLevel;
      osc.connect(g);
      g.connect(metalBus);

      osc.start(startTime);
      osc.stop(startTime + totalTime + 0.03);
    });

    const airNoise = createNoiseSourceWithRandomOffset(startTime, totalTime);
    const airGain = audioCtx.createGain();
    airGain.gain.value = s.noiseMix * 0.22;
    airNoise.connect(airGain);
    airGain.connect(metalBus);

    const metalBp = audioCtx.createBiquadFilter();
    metalBp.type = "bandpass";
    metalBp.frequency.setValueAtTime(7200, startTime);
    metalBp.Q.setValueAtTime(1.8, startTime);

    const metalHp = audioCtx.createBiquadFilter();
    metalHp.type = "highpass";
    metalHp.frequency.setValueAtTime(5400, startTime);

    const envGain = audioCtx.createGain();
    envGain.gain.setValueAtTime(0.0001, startTime);
    envGain.gain.linearRampToValueAtTime(effectiveVolume * 1.15, startTime + attack);
    envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime);

    metalBus.connect(metalBp);
    metalBp.connect(metalHp);
    metalHp.connect(envGain);
    envGain.connect(lowCutFilter);

    if (trackId === "openhat") {
      activeOpenHatVoice = {
        gainNode: envGain,
        stopTime: startTime + totalTime
      };
    }
    return;
  }

  const tomOsc = audioCtx.createOscillator();
  tomOsc.type = s.wave || "sine";
  tomOsc.frequency.setValueAtTime(s.startFreq, startTime);
  tomOsc.frequency.exponentialRampToValueAtTime(Math.max(30, s.endFreq), startTime + totalTime);

  const tomOvertone = audioCtx.createOscillator();
  tomOvertone.type = "triangle";
  tomOvertone.frequency.setValueAtTime(s.startFreq * 1.5, startTime);
  tomOvertone.frequency.exponentialRampToValueAtTime(Math.max(45, s.endFreq * 1.5), startTime + totalTime * 0.45);

  const overtoneGain = audioCtx.createGain();
  overtoneGain.gain.setValueAtTime(0.22, startTime);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime * 0.45);

  const tomNoise = createNoiseSourceWithRandomOffset(startTime, Math.min(0.05, totalTime));
  const tomNoiseGain = audioCtx.createGain();
  tomNoiseGain.gain.setValueAtTime(s.noiseMix * 0.45, startTime);
  tomNoiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(0.045, totalTime));

  const envGain = audioCtx.createGain();
  envGain.gain.setValueAtTime(0.0001, startTime);
  envGain.gain.linearRampToValueAtTime(effectiveVolume, startTime + attack);
  envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + totalTime);

  tomOsc.connect(envGain);
  tomOvertone.connect(overtoneGain);
  overtoneGain.connect(envGain);
  tomNoise.connect(tomNoiseGain);
  tomNoiseGain.connect(envGain);
  envGain.connect(lowCutFilter);

  tomOsc.start(startTime);
  tomOvertone.start(startTime);
  tomOsc.stop(startTime + totalTime + 0.03);
  tomOvertone.stop(startTime + totalTime + 0.03);
}

// ============================================================================
// POLYPHONIC SYNTHESIZER ENGINE (STEREO DETUNE, VELOCITY FILTER ENVELOPE & GATE)
// ============================================================================

async function startSustainedSynthNote(noteId, baseFreq = 220, velocity = 0.88) {
  await ensureAudioReady();

  if (activePolyVoices.has(noteId)) {
    releaseSustainedSynthNote(noteId);
  }

  const now = audioCtx.currentTime;
  const selectedSource = waveSelect.value;

  const pitchSemis = rackState.bypass.tuning ? 0 : rackState.params.pitch;
  const detuneCents = rackState.bypass.tuning ? 0 : rackState.params.detune;
  const shiftedFreq = baseFreq * Math.pow(2, pitchSemis / 12);

  const polyHeadroom = 0.78;
  const vel = Math.max(0.2, Math.min(1.0, velocity));

  // Ensure Noise Gate opens immediately when a note starts
  if (gateGainNode) {
    gateGainNode.gain.cancelScheduledValues(now);
    gateGainNode.gain.setValueAtTime(1.0, now);
  }

  // Branch A: Recorded Mic Sample played polyphonically with Sample Chopper + Granular Pitch-Shift
  if (selectedSource.startsWith("sample:")) {
    const sampleObj = getSampleById(selectedSource);
    if (!sampleObj) return;
    const rawBuffer = sampleObj.audioBuffer || (await decodeSampleToAudioBuffer(sampleObj));
    if (!rawBuffer) return;

    const pitchRatio = Math.max(0.25, Math.min(4.0, shiftedFreq / 220));
    const pitchedChopBuffer = getProcessedSampleBuffer(sampleObj, rawBuffer, true, pitchRatio);
    const fixedDur = pitchedChopBuffer.duration;

    const srcPrimary = audioCtx.createBufferSource();
    srcPrimary.buffer = pitchedChopBuffer;

    const sourceMixer = audioCtx.createGain();
    sourceMixer.gain.value = 1.0;

    const panPrimary = audioCtx.createStereoPanner();
    panPrimary.pan.setValueAtTime(Math.abs(detuneCents) > 0.5 ? -0.24 : 0, now);
    srcPrimary.connect(panPrimary);
    panPrimary.connect(sourceMixer);

    let srcTwin = null;
    if (!rackState.bypass.tuning && Math.abs(detuneCents) > 0.5) {
      const twinRatio = pitchRatio * Math.pow(2, detuneCents / 1200);
      const twinBuffer = getProcessedSampleBuffer(sampleObj, rawBuffer, true, twinRatio);
      srcTwin = audioCtx.createBufferSource();
      srcTwin.buffer = twinBuffer;

      const panTwin = audioCtx.createStereoPanner();
      panTwin.pan.setValueAtTime(0.24, now);

      const twinGain = audioCtx.createGain();
      twinGain.gain.value = 0.72;
      srcTwin.connect(panTwin);
      panTwin.connect(twinGain);
      twinGain.connect(sourceMixer);
      sourceMixer.gain.value = 0.72;
    }

    const envGain = audioCtx.createGain();
    const safeAttack = Math.max(0.005, rackState.params.attack || 0.01);
    const safeDecay = Math.max(0.02, rackState.params.decay || 0.15);
    const { sustain, release } = rackState.params;
    const peakGain = 0.95 * polyHeadroom * vel;
    const sustainGain = Math.max(0.001, peakGain * (rackState.bypass.adsr ? 0.95 : Math.max(0.05, sustain)));

    if (rackState.bypass.adsr) {
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.linearRampToValueAtTime(peakGain, now + 0.008);
    } else {
      envGain.gain.setValueAtTime(0.0001, now);
      envGain.gain.linearRampToValueAtTime(peakGain, now + safeAttack);
      envGain.gain.exponentialRampToValueAtTime(sustainGain, now + safeAttack + safeDecay);
    }

    triggerWaveformPlayhead("synth", now, Math.max(0.25, fixedDur));

    let lastNode = sourceMixer;
    let lfoOsc = null;
    if (!rackState.bypass.filter) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = rackState.filterType;
      const baseCut = Math.max(80, rackState.params.cutoff);
      const envCutPeak = rackState.filterType === "lowpass"
        ? Math.min(12000, baseCut * (1 + 0.35 * vel))
        : baseCut;

      filter.frequency.setValueAtTime(envCutPeak, now);
      filter.frequency.exponentialRampToValueAtTime(baseCut, now + Math.max(0.08, safeDecay));
      filter.Q.setValueAtTime(rackState.params.resonance, now);

      const modAmt = rackState.params.modDepth;
      if (modAmt > 0) {
        lfoOsc = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfoOsc.type = "sine";
        lfoOsc.frequency.setValueAtTime(1.5 + (modAmt / 100) * 9, now);
        lfoGain.gain.setValueAtTime((modAmt / 100) * (baseCut * 0.85), now);
        lfoOsc.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfoOsc.start(now);
      }

      lastNode.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(envGain);
    envGain.connect(synthSpaceInputBus);

    srcPrimary.start(now);
    if (srcTwin) srcTwin.start(now);

    let released = false;
    const stopRelease = () => {
      if (released) return;
      released = true;
      const relTime = audioCtx.currentTime;
      const relDur = rackState.bypass.adsr ? 0.05 : Math.max(0.04, release);

      envGain.gain.cancelScheduledValues(relTime);
      envGain.gain.setValueAtTime(Math.max(0.0001, envGain.gain.value), relTime);
      envGain.gain.exponentialRampToValueAtTime(0.0001, relTime + relDur);

      try {
        srcPrimary.stop(relTime + relDur + 0.03);
        if (srcTwin) srcTwin.stop(relTime + relDur + 0.03);
        if (lfoOsc) lfoOsc.stop(relTime + relDur + 0.03);
      } catch (_) {
        // Ignore if already stopped
      }
    };

    activePolyVoices.set(noteId, { stopRelease });
    updateCalAnimationState();
    return;
  }

  // Branch B: Stereo-Widened Analog Twin Oscillator Wave with Velocity Filter Envelope
  const oscPrimary = audioCtx.createOscillator();
  oscPrimary.type = selectedSource;
  oscPrimary.frequency.setValueAtTime(shiftedFreq, now);
  oscPrimary.detune.setValueAtTime(-detuneCents * 0.5, now);

  const oscMixer = audioCtx.createGain();
  oscMixer.gain.value = 1.0;

  const panPrimary = audioCtx.createStereoPanner();
  panPrimary.pan.setValueAtTime(!rackState.bypass.tuning && Math.abs(detuneCents) > 0.5 ? -0.26 : 0, now);
  oscPrimary.connect(panPrimary);
  panPrimary.connect(oscMixer);

  let oscTwin = null;
  if (!rackState.bypass.tuning && Math.abs(detuneCents) > 0.5) {
    oscTwin = audioCtx.createOscillator();
    oscTwin.type = selectedSource;
    oscTwin.frequency.setValueAtTime(shiftedFreq, now);
    oscTwin.detune.setValueAtTime(detuneCents * 0.5, now);

    const panTwin = audioCtx.createStereoPanner();
    panTwin.pan.setValueAtTime(0.26, now);

    const twinGain = audioCtx.createGain();
    twinGain.gain.value = 0.72;
    oscTwin.connect(panTwin);
    panTwin.connect(twinGain);
    twinGain.connect(oscMixer);
    oscMixer.gain.value = 0.7;
  }

  const envGain = audioCtx.createGain();
  const safeAttack = Math.max(0.005, rackState.params.attack || 0.01);
  const safeDecay = Math.max(0.02, rackState.params.decay || 0.15);
  const { sustain, release } = rackState.params;
  const peakGain = 0.42 * polyHeadroom * vel;
  const sustainGain = Math.max(0.001, peakGain * (rackState.bypass.adsr ? 0.85 : Math.max(0.05, sustain)));

  if (rackState.bypass.adsr) {
    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakGain * 0.85, now + 0.008);
  } else {
    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakGain, now + safeAttack);
    envGain.gain.exponentialRampToValueAtTime(sustainGain, now + safeAttack + safeDecay);
  }

  triggerWaveformPlayhead("synth", now, Math.max(0.45, safeAttack + safeDecay + 0.25));

  let lastNode = oscMixer;
  let lfoOsc = null;

  if (!rackState.bypass.filter) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = rackState.filterType;
    const baseCut = Math.max(80, rackState.params.cutoff);
    const envCutPeak = rackState.filterType === "lowpass"
      ? Math.min(12000, baseCut * (1 + 0.38 * vel))
      : baseCut;

    filter.frequency.setValueAtTime(envCutPeak, now);
    filter.frequency.exponentialRampToValueAtTime(baseCut, now + Math.max(0.08, safeDecay));
    filter.Q.setValueAtTime(rackState.params.resonance, now);

    const modAmt = rackState.params.modDepth;
    if (modAmt > 0) {
      lfoOsc = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfoOsc.type = "sine";
      lfoOsc.frequency.setValueAtTime(1.5 + (modAmt / 100) * 9, now);
      lfoGain.gain.setValueAtTime((modAmt / 100) * (baseCut * 0.85), now);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfoOsc.start(now);
    }

    lastNode.connect(filter);
    lastNode = filter;
  }

  lastNode.connect(envGain);
  envGain.connect(synthSpaceInputBus);

  oscPrimary.start(now);
  if (oscTwin) oscTwin.start(now);

  let released = false;
  const stopRelease = () => {
    if (released) return;
    released = true;
    const relTime = audioCtx.currentTime;
    const relDur = rackState.bypass.adsr ? 0.05 : Math.max(0.04, release);

    envGain.gain.cancelScheduledValues(relTime);
    envGain.gain.setValueAtTime(Math.max(0.0001, envGain.gain.value), relTime);
    envGain.gain.exponentialRampToValueAtTime(0.0001, relTime + relDur);

    try {
      oscPrimary.stop(relTime + relDur + 0.03);
      if (oscTwin) oscTwin.stop(relTime + relDur + 0.03);
      if (lfoOsc) lfoOsc.stop(relTime + relDur + 0.03);
    } catch (_) {
      // Ignore if already stopped
    }
  };

  activePolyVoices.set(noteId, { stopRelease });
  updateCalAnimationState();
}

function releaseSustainedSynthNote(noteId) {
  const voice = activePolyVoices.get(noteId);
  if (!voice) return;
  voice.stopRelease();
  activePolyVoices.delete(noteId);
  updateCalAnimationState();
}

async function triggerOneShotSynthNote(baseFreq = 220, holdMs = 340) {
  const oneShotId = `oneshot_${Date.now()}_${Math.random()}`;
  await startSustainedSynthNote(oneShotId, baseFreq, 0.9);
  setTimeout(() => {
    releaseSustainedSynthNote(oneShotId);
  }, holdMs);
}

// ============================================================================
// FLUTED ROTARY POTENTIOMETER KNOBS & INTERACTIVE UI BUILDERS
// ============================================================================

function createKnob({ label, min, max, step, value, defaultValue, unit, guideData, tip, accentColor, onChange }) {
  const resetTarget = defaultValue !== undefined ? defaultValue : value;

  const wrapper = document.createElement("div");
  wrapper.className = "knob-unit";

  function buildGuidePayload() {
    if (guideData) return guideData;
    if (tip) {
      return {
        title: label || "Parameter Control",
        what: tip,
        listen: "Listen for tonal balance, punch, or volume shifts as you adjust this control.",
        watch: "Watch the waveform preview and Live EQ curve update live."
      };
    }
    return null;
  }

  attachLearnHoverHandlers(wrapper, buildGuidePayload);

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
    const payload = buildGuidePayload();
    if (payload) updateSoundDesignGuide(payload);
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
    const payload = buildGuidePayload();
    if (payload) updateSoundDesignGuide(payload);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  });

  dial.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    startVal = currentVal;
    const payload = buildGuidePayload();
    if (payload) updateSoundDesignGuide(payload);
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

  if (delaySyncSelect) {
    delaySyncSelect.value = rackState.delaySync || "1/8";
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

  if (delaySyncSelect) {
    delaySyncSelect.addEventListener("change", () => {
      rackState.delaySync = delaySyncSelect.value;
      updateMasterFxParams();
      recalculateStaticWaveform("synth");
      const delayMs = Math.round(getSyncedDelayTimeSeconds() * 1000);
      updateSoundDesignGuide({
        title: `Echo Sync • ${delaySyncSelect.options[delaySyncSelect.selectedIndex].text} (${delayMs} ms)`,
        what: rackState.delaySync === "free"
          ? "Free mode sets Echo delay time to a fixed 280 ms independent of your drum tempo."
          : `Locks Echo repeat timing to ${rackState.delaySync} note subdivisions (${delayMs} ms) at ${bpmInput.value} BPM.`,
        listen: "Play a synth chord alongside the drum loop to hear the echo repeats bounce in perfect rhythmic time.",
        watch: "Watch the echo ghost pulses shift spacing along the OSC Waveform preview."
      });
    });
  }
}

function renderGlobalDrumSpaceKnobs() {
  if (!drumGlobalSpaceKnobs) return;
  drumGlobalSpaceKnobs.innerHTML = "";

  const globalEchoKnob = createKnob({
    label: "KIT ECHO",
    min: 0,
    max: 100,
    step: 1,
    value: drumGlobalSpace.echo,
    defaultValue: 100,
    unit: "%",
    accentColor: "#2dd4bf",
    guideData: {
      title: "Drum Kit • Global Echo Master",
      what: "Controls the overall Echo delay return level for all drum tracks that have Track Echo turned up.",
      listen: "Turn up individual track Echo knobs below, then use Kit Echo to swell or mute all drum echoes together.",
      watch: "Watch the Live EQ & Spectrum analyzer reflect the rhythmic drum echo repeats."
    },
    onChange: (val) => {
      drumGlobalSpace.echo = val;
      updateMasterFxParams();
    }
  });
  globalEchoKnob.classList.add("mini-knob");

  const globalReverbKnob = createKnob({
    label: "KIT REV",
    min: 0,
    max: 100,
    step: 1,
    value: drumGlobalSpace.reverb,
    defaultValue: 100,
    unit: "%",
    accentColor: "#2dd4bf",
    guideData: {
      title: "Drum Kit • Global Reverb Master",
      what: "Controls the overall Hall Reverb return level for all drum tracks that have Track Reverb turned up.",
      listen: "Turn up Track Reverb on your Snare or Clap, then use Kit Rev to dial in the room size across the whole beat.",
      watch: "Watch the Live Spectrum display sustain longer as the drum room tail blooms."
    },
    onChange: (val) => {
      drumGlobalSpace.reverb = val;
      updateMasterFxParams();
    }
  });
  globalReverbKnob.classList.add("mini-knob");

  drumGlobalSpaceKnobs.appendChild(globalEchoKnob);
  drumGlobalSpaceKnobs.appendChild(globalReverbKnob);
}

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
      accentColor: track.color,
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
      accentColor: track.color,
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
      accentColor: track.color,
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
      accentColor: track.color,
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
    },
    {
      label: "Echo",
      min: 0,
      max: 100,
      step: 1,
      value: settings.echo || 0,
      defaultValue: 0,
      unit: "%",
      accentColor: "#2dd4bf",
      guideData: {
        title: `${track.name} Space • Track Echo Send`,
        what: `Sends ${track.name} into the tempo-synced Drum Echo unit (scaled by KIT ECHO in the toolbar above).`,
        listen: `Turn up Echo on ${track.name} to hear rhythmic dub-style repeats bounce across your beat.`,
        watch: "Watch the Live Spectrum display pulse with each echo repeat."
      },
      onChange: (v) => {
        settings.echo = v;
      }
    },
    {
      label: "Reverb",
      min: 0,
      max: 100,
      step: 1,
      value: settings.reverb || 0,
      defaultValue: 0,
      unit: "%",
      accentColor: "#2dd4bf",
      guideData: {
        title: `${track.name} Space • Track Reverb Send`,
        what: `Sends ${track.name} into the Drum Hall Reverb unit (scaled by KIT REV in the toolbar above).`,
        listen: `Add Reverb to ${track.name} (great on Snare, Clap, Toms, or chopped Mic Samples) while keeping Kick dry and tight.`,
        watch: "Watch the high-frequency shimmer linger on the Live Spectrum analyzer."
      },
      onChange: (v) => {
        settings.reverb = v;
      }
    }
  ];

  knobConfigs.forEach((cfg) => {
    drumKnobsContainer.appendChild(createKnob(cfg));
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

function getStepBankClass(stepIndex) {
  const bank = Math.floor(stepIndex / 4) % 4;
  if (bank === 0) return "bank-red";
  if (bank === 1) return "bank-orange";
  if (bank === 2) return "bank-amber";
  return "bank-cream";
}

function createEmptyGridPattern() {
  const empty = {};
  WAVECRAFT_DATA.tracks.forEach((t) => {
    empty[t.id] = Array(32).fill(0);
  });
  return empty;
}

function cloneGridPattern(sourceGrid, normalizeBinaryHits = false) {
  const copy = {};
  WAVECRAFT_DATA.tracks.forEach((t) => {
    const row = sourceGrid && sourceGrid[t.id] ? sourceGrid[t.id] : [];
    copy[t.id] = Array.from({ length: 32 }, (_, idx) => {
      const rawVal = Number(row[idx]) || 0;
      if (rawVal <= 0) return 0;
      if (normalizeBinaryHits && rawVal === 1) return 0.85;
      return Math.max(0.15, Math.min(1.0, rawVal));
    });
  });
  return copy;
}

function renderSectionTabs() {
  if (!sectionTabsContainer) return;
  sectionTabsContainer.innerHTML = "";

  sections.forEach((sec, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "section-tab-btn";
    if (idx === activeSectionIndex) {
      btn.classList.add("active");
      if (isPlaying && chainSectionsEnabled) {
        btn.classList.add("chained-playing");
      }
    }
    btn.textContent = sec.name;
    btn.title = `Switch to Section ${sec.name} (${sec.stepCount} steps)`;
    btn.addEventListener("click", () => {
      switchToSection(idx, true);
    });
    sectionTabsContainer.appendChild(btn);
  });

  if (addSectionBtn) {
    addSectionBtn.disabled = sections.length >= SECTION_LETTERS.length;
  }
}

function switchToSection(targetIdx, resetAudioScheduler = false) {
  if (targetIdx < 0 || targetIdx >= sections.length) return;
  if (sections[activeSectionIndex]) {
    sections[activeSectionIndex].grid = gridState;
    sections[activeSectionIndex].stepCount = stepCount;
  }

  activeSectionIndex = targetIdx;
  const nextSec = sections[activeSectionIndex];
  gridState = nextSec.grid;
  stepCount = nextSec.stepCount || 16;

  if (resetAudioScheduler) {
    schedulingSectionIndex = targetIdx;
    if (currentScheduleStep >= stepCount) {
      currentScheduleStep = 0;
    }
  }

  if (stepsSelect) {
    stepsSelect.value = String(stepCount);
  }
  lastDrawnVisualStep = -1;

  renderSectionTabs();
  renderGrid();
}

function addNewSection() {
  if (sections.length >= SECTION_LETTERS.length) return;
  if (sections[activeSectionIndex]) {
    sections[activeSectionIndex].grid = gridState;
    sections[activeSectionIndex].stepCount = stepCount;
  }

  const nextLetter = SECTION_LETTERS[sections.length];
  sections.push({
    id: `sec_${nextLetter}`,
    name: nextLetter,
    stepCount: stepCount,
    grid: createEmptyGridPattern()
  });

  switchToSection(sections.length - 1, true);
  updateSoundDesignGuide({
    title: `Pattern Arranger • Added Section ${nextLetter}`,
    what: `Created blank Section ${nextLetter} so you can program a fill, breakdown, or chorus variation.`,
    listen: "Turn on CHAIN: ON to hear the sequencer automatically advance from Section A through all your sections.",
    watch: "Watch the active section badge light up as each pattern plays."
  });
}

function copyCurrentSectionToNext() {
  if (sections[activeSectionIndex]) {
    sections[activeSectionIndex].grid = gridState;
    sections[activeSectionIndex].stepCount = stepCount;
  }

  let targetIdx = activeSectionIndex + 1;
  if (targetIdx >= sections.length) {
    if (sections.length < SECTION_LETTERS.length) {
      const nextLetter = SECTION_LETTERS[sections.length];
      sections.push({
        id: `sec_${nextLetter}`,
        name: nextLetter,
        stepCount: stepCount,
        grid: cloneGridPattern(gridState, false)
      });
      targetIdx = sections.length - 1;
    } else {
      targetIdx = 0;
    }
  } else {
    sections[targetIdx].grid = cloneGridPattern(gridState, false);
    sections[targetIdx].stepCount = stepCount;
  }

  const fromName = sections[activeSectionIndex].name;
  const toName = sections[targetIdx].name;
  switchToSection(targetIdx, true);

  updateSoundDesignGuide({
    title: `Pattern Arranger • Copied ${fromName} → ${toName}`,
    what: `Duplicated Section ${fromName}'s drum pattern and note velocities into Section ${toName}.`,
    listen: "Tweak a few step velocities or add a tom/snare fill at the end of this section, then enable CHAIN: ON.",
    watch: "Watch the velocity bars inside each pad reflect your copied groove."
  });
}

function updateStepButtonVisual(btn, velValue) {
  const numVal = Number(velValue) || 0;
  const isActive = numVal > 0;
  btn.classList.toggle("active", isActive);

  const fillEl = btn.querySelector(".step-vel-fill");
  const tagEl = btn.querySelector(".step-vel-tag");
  if (isActive) {
    const pct = Math.round(Math.max(15, Math.min(100, numVal * 100)));
    if (fillEl) fillEl.style.height = `${pct}%`;
    if (tagEl) tagEl.textContent = String(pct);
  } else {
    if (fillEl) fillEl.style.height = "0%";
    if (tagEl) tagEl.textContent = "";
  }
}

function renderGrid() {
  sequencerGrid.innerHTML = "";
  stepElementsByStep = Array.from({ length: stepCount }, () => []);

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
    selectBtn.textContent = `${track.keyShortcut}. ${track.name}`;
    attachLearnHoverHandlers(selectBtn, () => ({
      title: `Voice Select • ${track.name} (Key ${track.keyShortcut})`,
      what: `Selects ${track.name} in the Voice Shaping strip above so you can sculpt its EQ, Attack, Echo, and Reverb.`,
      listen: `Click ${track.name} and press 'AUDITION VOICE' or key '${track.keyShortcut}' to trigger it live.`,
      watch: `Watch the ${track.name} static waveform preview reshape as you turn its editor knobs.`
    }));
    selectBtn.addEventListener("click", () => {
      selectedTrackId = track.id;
      document.querySelectorAll(".track-row").forEach((r) => {
        r.classList.toggle("selected-track", r.dataset.trackId === selectedTrackId);
      });
      renderDrumEditor();
    });

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

    if (savedSamples.length > 0) {
      const sepOpt = document.createElement("option");
      sepOpt.disabled = true;
      sepOpt.textContent = "── MIC LIBRARY ──";
      presetDropdown.appendChild(sepOpt);

      savedSamples.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = `sample:${s.id}`;
        const fxTag = s.soundDesign ? " [FX]" : "";
        opt.textContent = `🎤 ${s.name}${fxTag}`;
        if (drumSettings[track.id].presetKey === `sample:${s.id}`) opt.selected = true;
        presetDropdown.appendChild(opt);
      });
    }

    presetDropdown.addEventListener("change", (e) => {
      const chosenKey = e.target.value;
      const currentVol = drumSettings[track.id].volume;
      const currentEcho = drumSettings[track.id].echo || 0;
      const currentReverb = drumSettings[track.id].reverb || 0;

      if (chosenKey.startsWith("sample:")) {
        const sampleObj = getSampleById(chosenKey);
        drumSettings[track.id] = {
          ...track.soundPresets.presetA,
          presetKey: chosenKey,
          label: sampleObj ? `🎤 ${sampleObj.name}` : "Mic Sample",
          volume: currentVol,
          echo: currentEcho,
          reverb: currentReverb
        };
      } else {
        drumSettings[track.id] = {
          presetKey: chosenKey,
          ...track.soundPresets[chosenKey],
          volume: currentVol,
          echo: currentEcho,
          reverb: currentReverb
        };
      }

      selectedTrackId = track.id;
      document.querySelectorAll(".track-row").forEach((r) => {
        r.classList.toggle("selected-track", r.dataset.trackId === selectedTrackId);
      });
      recalculateStaticWaveform(track.id);
      renderDrumEditor();
      playDrumSound(track.id, null, true, 0.85);
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

    const stepsContainer = document.createElement("div");
    stepsContainer.className = "steps-container";
    stepsContainer.style.gridTemplateColumns = `repeat(${stepCount}, minmax(20px, 1fr))`;

    const beatGroup = stepCount === 8 ? 2 : stepCount === 32 ? 8 : 4;

    if (!gridState[track.id]) {
      gridState[track.id] = Array(32).fill(0);
    }

    for (let step = 0; step < stepCount; step++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `step-btn ${getStepBankClass(step)}`;
      if (step % beatGroup === 0) btn.classList.add("beat-start");

      const led = document.createElement("span");
      led.className = "step-led";
      btn.appendChild(led);

      const velFill = document.createElement("span");
      velFill.className = "step-vel-fill";
      btn.appendChild(velFill);

      const velTag = document.createElement("span");
      velTag.className = "step-vel-tag";
      btn.appendChild(velTag);

      const initialVel = Number(gridState[track.id][step]) || 0;
      updateStepButtonVisual(btn, initialVel);

      btn.dataset.track = track.id;
      btn.dataset.step = step;

      stepElementsByStep[step].push(btn);

      let dragStartY = 0;
      let dragStartVel = 0;
      let didDragVelocity = false;

      btn.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const currentVel = Number(gridState[track.id][step]) || 0;
        if (currentVel <= 0) return;

        dragStartY = e.clientY;
        dragStartVel = currentVel;
        didDragVelocity = false;

        function onVelMouseMove(moveEvt) {
          const dy = dragStartY - moveEvt.clientY;
          if (Math.abs(dy) > 4) {
            didDragVelocity = true;
            const nextVel = Math.max(0.15, Math.min(1.0, Number((dragStartVel + dy / 90).toFixed(2))));
            gridState[track.id][step] = nextVel;
            updateStepButtonVisual(btn, nextVel);
          }
        }

        function onVelMouseUp() {
          window.removeEventListener("mousemove", onVelMouseMove);
          window.removeEventListener("mouseup", onVelMouseUp);
        }

        window.addEventListener("mousemove", onVelMouseMove);
        window.addEventListener("mouseup", onVelMouseUp);
      });

      btn.addEventListener("wheel", (e) => {
        const currentVel = Number(gridState[track.id][step]) || 0;
        if (currentVel <= 0) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        const nextVel = Math.max(0.15, Math.min(1.0, Number((currentVel + delta).toFixed(2))));
        gridState[track.id][step] = nextVel;
        updateStepButtonVisual(btn, nextVel);
      }, { passive: false });

      btn.addEventListener("click", () => {
        if (didDragVelocity) {
          didDragVelocity = false;
          return;
        }
        const currentVel = Number(gridState[track.id][step]) || 0;
        const nextVel = currentVel > 0 ? 0 : 0.85;
        gridState[track.id][step] = nextVel;
        updateStepButtonVisual(btn, nextVel);
      });

      stepsContainer.appendChild(btn);
    }

    row.appendChild(stepsContainer);
    sequencerGrid.appendChild(row);
  });

  updateMuteSoloVisuals();
}

function updatePlayheadColumnHighlight(newStep) {
  if (lastDrawnVisualStep >= 0 && stepElementsByStep[lastDrawnVisualStep]) {
    const prevButtons = stepElementsByStep[lastDrawnVisualStep];
    for (let i = 0; i < prevButtons.length; i++) {
      prevButtons[i].classList.remove("playing");
    }
  }
  lastDrawnVisualStep = newStep;
  if (newStep >= 0 && stepElementsByStep[newStep]) {
    const nextButtons = stepElementsByStep[newStep];
    for (let i = 0; i < nextButtons.length; i++) {
      nextButtons[i].classList.add("playing");
    }
  }
}

// ============================================================================
// 60FPS ANIMATION LOOP & LOOKAHEAD SCHEDULER (WITH RELIABLE SECTION CHAINING)
// ============================================================================

function animationFrameLoop() {
  requestAnimationFrame(animationFrameLoop);

  let now = null;
  if (audioCtx) {
    now = audioCtx.currentTime;
    updateRealtimeNoiseGate();

    if (isPlaying) {
      while (visualStepQueue.length && visualStepQueue[0].time <= now) {
        const currentEvent = visualStepQueue.shift();
        if (
          currentEvent.sectionIndex !== undefined &&
          currentEvent.sectionIndex !== activeSectionIndex &&
          sections[currentEvent.sectionIndex]
        ) {
          switchToSection(currentEvent.sectionIndex, false);
        }
        if (currentEvent.step !== lastDrawnVisualStep) {
          updatePlayheadColumnHighlight(currentEvent.step);
        }
      }
    }
  }

  const visuals = Object.values(channelVisuals);
  for (let i = 0; i < visuals.length; i++) {
    drawChannelCanvas(visuals[i], now);
  }

  drawEqVisualizer();
}

function getStepDurationSecondsForSection(stepIndex, targetStepCount) {
  const bpm = Math.max(40, Math.min(240, Number(bpmInput.value) || 120));
  const barSec = (60 / bpm) * 4;
  const baseStepSec = barSec / targetStepCount;
  const swingFactor = (swingPercent / 100) * 0.5;
  const isEvenStep = stepIndex % 2 === 0;
  return isEvenStep ? baseStepSec * (1 + swingFactor) : baseStepSec * (1 - swingFactor);
}

function scheduleStepEvents(stepIndex, stepTime, sectionIdx) {
  const secObj = sections[sectionIdx];
  const targetGrid = secObj ? secObj.grid : gridState;
  const targetStepCount = secObj ? (secObj.stepCount || stepCount) : stepCount;

  visualStepQueue.push({
    step: stepIndex,
    time: stepTime,
    sectionIndex: sectionIdx
  });

  const stepsPerQuarter = targetStepCount / 4;
  if (metronomeEnabled && stepIndex % stepsPerQuarter === 0) {
    const isBeatOne = stepIndex === 0;
    playMetronomeClick(stepTime, isBeatOne);
  }

  WAVECRAFT_DATA.tracks.forEach((track) => {
    const row = targetGrid[track.id];
    const stepVel = row ? Number(row[stepIndex]) || 0 : 0;
    if (stepVel > 0) {
      playDrumSound(track.id, stepTime, false, stepVel);
    }
  });
}

function runLookaheadScheduler() {
  if (!isPlaying || !audioCtx) return;

  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    // Keep live edits to the currently viewed section synced
    if (sections[activeSectionIndex]) {
      sections[activeSectionIndex].grid = gridState;
      sections[activeSectionIndex].stepCount = stepCount;
    }

    if (!chainSectionsEnabled) {
      schedulingSectionIndex = activeSectionIndex;
    } else if (schedulingSectionIndex >= sections.length) {
      schedulingSectionIndex = 0;
    }

    const activeSchedSection = sections[schedulingSectionIndex];
    const schedStepCount = activeSchedSection ? (activeSchedSection.stepCount || stepCount) : stepCount;

    if (currentScheduleStep >= schedStepCount) {
      currentScheduleStep = 0;
    }

    scheduleStepEvents(currentScheduleStep, nextNoteTime, schedulingSectionIndex);
    nextNoteTime += getStepDurationSecondsForSection(currentScheduleStep, schedStepCount);
    currentScheduleStep++;

    if (currentScheduleStep >= schedStepCount) {
      currentScheduleStep = 0;
      if (chainSectionsEnabled && sections.length > 1) {
        schedulingSectionIndex = (schedulingSectionIndex + 1) % sections.length;
      }
    }
  }

  schedulerTimerId = setTimeout(runLookaheadScheduler, lookaheadMs);
}

async function togglePlay() {
  await ensureAudioReady();
  isPlaying = !isPlaying;

  if (isPlaying) {
    playBtn.classList.add("is-playing");
    currentScheduleStep = 0;
    schedulingSectionIndex = activeSectionIndex;
    updatePlayheadColumnHighlight(-1);
    visualStepQueue.length = 0;
    nextNoteTime = audioCtx.currentTime + 0.03;
    runLookaheadScheduler();
  } else {
    playBtn.classList.remove("is-playing");
    clearTimeout(schedulerTimerId);
    visualStepQueue.length = 0;
    updatePlayheadColumnHighlight(-1);
  }

  renderSectionTabs();
  updateCalAnimationState();
}

async function toggleMetronome() {
  await ensureAudioReady();
  metronomeEnabled = !metronomeEnabled;
  metroBtn.classList.toggle("active", metronomeEnabled);
  metroBtn.setAttribute("aria-pressed", String(metronomeEnabled));
  metroBtn.textContent = metronomeEnabled ? "CLICK: ON" : "CLICK: OFF";
}

function loadDefaultPreset(presetKey = "basicRock") {
  const preset = WAVECRAFT_DATA.presets[presetKey];
  if (!preset) return;

  if (factoryPresetSelect) {
    factoryPresetSelect.value = presetKey;
  }

  bpmInput.value = preset.bpm;
  waveSelect.value = preset.waveform;
  syncCalBeatTempo();

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
  rackState.delaySync = preset.delaySync || "1/8";
  Object.keys(rackState.bypass).forEach((modKey) => {
    rackState.bypass[modKey] = false;
  });

  renderModularRack();
  updateMasterFxParams();

  const initialPatternA = cloneGridPattern(preset.pattern, true);
  const initialPatternB = cloneGridPattern(preset.pattern, true);
  if (initialPatternB.clap) initialPatternB.clap[14] = 0.82;
  if (initialPatternB.lowtom) initialPatternB.lowtom[15] = 0.88;
  if (initialPatternB.midtom) initialPatternB.midtom[13] = 0.82;

  sections = [
    { id: "sec_A", name: "A", stepCount: stepCount, grid: initialPatternA },
    { id: "sec_B", name: "B", stepCount: stepCount, grid: initialPatternB }
  ];
  activeSectionIndex = 0;
  schedulingSectionIndex = 0;
  gridState = sections[0].grid;

  renderSectionTabs();
  renderGrid();
}

function generateSmartGroove() {
  const newGrid = createEmptyGridPattern();
  const grooveStyle = Math.floor(Math.random() * 3);

  for (let bar = 0; bar < 2; bar++) {
    const offset = bar * 16;

    newGrid.kick[offset + 0] = 0.96;
    if (grooveStyle === 0) {
      newGrid.kick[offset + 4] = 0.86;
      newGrid.kick[offset + 8] = 0.92;
      newGrid.kick[offset + 12] = 0.86;
      if (Math.random() > 0.5) newGrid.kick[offset + 14] = 0.65;
    } else if (grooveStyle === 1) {
      if (Math.random() > 0.35) newGrid.kick[offset + 3] = 0.72;
      newGrid.kick[offset + 6] = 0.88;
      if (Math.random() > 0.3) newGrid.kick[offset + 10] = 0.85;
      if (Math.random() > 0.65) newGrid.kick[offset + 13] = 0.6;
    } else {
      if (Math.random() > 0.3) newGrid.kick[offset + 3] = 0.76;
      if (Math.random() > 0.4) newGrid.kick[offset + 7] = 0.72;
      newGrid.kick[offset + 10] = 0.88;
    }

    if (grooveStyle === 2) {
      newGrid.snare[offset + 8] = 0.95;
      if (Math.random() > 0.5) newGrid.snare[offset + 14] = 0.56;
    } else {
      newGrid.snare[offset + 4] = 0.92;
      newGrid.snare[offset + 12] = 0.96;
      if (Math.random() > 0.6) newGrid.snare[offset + 15] = 0.52;
    }

    const hatDensity = Math.random();
    for (let s = 0; s < 16; s++) {
      const isOffbeat = s % 4 === 2;
      const accentVel = isOffbeat ? 0.86 : 0.54;
      if (hatDensity < 0.35) {
        newGrid.hihat[offset + s] = isOffbeat ? 0.86 : 0;
      } else if (hatDensity < 0.75) {
        newGrid.hihat[offset + s] = s % 2 === 0 || (s >= 12 && Math.random() > 0.45) ? accentVel : 0;
      } else {
        newGrid.hihat[offset + s] = Math.random() > 0.15 ? (s % 2 === 0 ? 0.84 : 0.48) : 0;
      }
    }

    if (Math.random() > 0.3) {
      newGrid.hihat[offset + 14] = 0;
      newGrid.openhat[offset + 14] = 0.82;
    }

    if (Math.random() > 0.35) newGrid.clap[offset + 12] = 0.88;
    if (Math.random() > 0.55) newGrid.clap[offset + 4] = 0.76;

    if (Math.random() > 0.4) {
      newGrid.midtom[offset + 11] = 0.74;
      newGrid.lowtom[offset + 15] = 0.82;
    }
    if (bar === 1 && Math.random() > 0.35) {
      newGrid.midtom[offset + 13] = 0.78;
      newGrid.lowtom[offset + 14] = 0.85;
    }

    if (bar === 0 && Math.random() > 0.35) {
      newGrid.crash[offset + 0] = 0.82;
    }
  }

  gridState = newGrid;
  if (sections[activeSectionIndex]) {
    sections[activeSectionIndex].grid = gridState;
  }
  renderGrid();
  updateSoundDesignGuide({
    title: "Pattern Generator • 8-Track Dynamic Groove",
    what: "Programmed an 8-voice pattern with accented downbeats, ghost hits, open-hat lifts, and tom fills.",
    listen: "Notice how softer ghost hits (48%–65%) give the beat human pocket while Open Hats choke on Closed Hats.",
    watch: "Watch the vertical velocity meters inside each active step pad—drag up/down on any pad to fine-tune!"
  });
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.repeat) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
      return;
    }

    const key = e.key.toLowerCase();

    if (DRUM_KEY_MAP[key]) {
      const trackId = DRUM_KEY_MAP[key];
      selectedTrackId = trackId;
      document.querySelectorAll(".track-row").forEach((r) => {
        r.classList.toggle("selected-track", r.dataset.trackId === selectedTrackId);
      });
      renderDrumEditor();
      playDrumSound(trackId, null, true, 0.92);
      return;
    }

    if (SYNTH_KEY_MAP[key]) {
      startSustainedSynthNote(`key_${key}`, SYNTH_KEY_MAP[key], 0.88);
    }
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (SYNTH_KEY_MAP[key]) {
      releaseSustainedSynthNote(`key_${key}`);
    }
  });

  window.addEventListener("blur", () => {
    Array.from(activePolyVoices.keys()).forEach((noteId) => {
      releaseSustainedSynthNote(noteId);
    });
  });
}

function setupSampleChopperEvents() {
  if (chopStartSlider) {
    chopStartSlider.addEventListener("input", () => {
      const startPct = Number(chopStartSlider.value);
      const endPct = Number(chopEndSlider ? chopEndSlider.value : 100);
      if (startPct >= endPct - 2) {
        chopStartSlider.value = String(Math.max(0, endPct - 2));
      }
      chopStartRatio = Number(chopStartSlider.value) / 100;
      updateSampleChopperUI();
      recalculateStaticWaveform("synth");
    });
  }

  if (chopEndSlider) {
    chopEndSlider.addEventListener("input", () => {
      const endPct = Number(chopEndSlider.value);
      const startPct = Number(chopStartSlider ? chopStartSlider.value : 0);
      if (endPct <= startPct + 2) {
        chopEndSlider.value = String(Math.min(100, startPct + 2));
      }
      chopEndRatio = Number(chopEndSlider.value) / 100;
      updateSampleChopperUI();
      recalculateStaticWaveform("synth");
    });
  }

  if (resetChopBtn) {
    resetChopBtn.addEventListener("click", () => {
      resetChopMarkers(true);
    });
  }

  if (applyChopBtn) {
    applyChopBtn.addEventListener("click", () => {
      applyPermanentChopToActiveSample();
    });
  }

  if (sampleChopCanvas) {
    function clientXToRatio(clientX) {
      const rect = sampleChopCanvas.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    sampleChopCanvas.addEventListener("mousedown", (e) => {
      if (!getActiveChopperSample()) return;
      isDraggingChopCanvas = true;
      chopDragAnchorRatio = clientXToRatio(e.clientX);
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDraggingChopCanvas) return;
      const curRatio = clientXToRatio(e.clientX);
      const low = Math.min(chopDragAnchorRatio, curRatio);
      const high = Math.max(chopDragAnchorRatio, curRatio);

      if (high - low >= 0.02) {
        chopStartRatio = Number(low.toFixed(2));
        chopEndRatio = Number(high.toFixed(2));
        if (chopStartSlider) chopStartSlider.value = String(Math.round(chopStartRatio * 100));
        if (chopEndSlider) chopEndSlider.value = String(Math.round(chopEndRatio * 100));
        updateSampleChopperUI();
        recalculateStaticWaveform("synth");
      }
    });

    window.addEventListener("mouseup", () => {
      isDraggingChopCanvas = false;
    });
  }
}

function setupMicSamplerEvents() {
  if (recMicBtn) {
    recMicBtn.addEventListener("click", () => {
      startMicRecording();
    });
  }

  if (previewRecBtn) {
    previewRecBtn.addEventListener("click", () => {
      const freq = parseFloat(noteSelect.value) || 220;
      if (pendingRecording && waveSelect) {
        waveSelect.value = "sample:unsaved";
        updateSampleChopperUI();
        recalculateStaticWaveform("synth");
      }
      const activeSample = getActiveChopperSample();
      const holdMs = activeSample ? Math.max(350, Math.min(2500, Math.round(activeSample.duration * 1000))) : 420;
      triggerOneShotSynthNote(freq, holdMs);
    });
  }

  if (saveSampleBtn) {
    saveSampleBtn.addEventListener("click", () => {
      saveActiveSampleToLibrary(false);
    });
  }

  if (saveSampleFxBtn) {
    saveSampleFxBtn.addEventListener("click", () => {
      saveActiveSampleToLibrary(true);
    });
  }

  if (sampleLibrarySelect) {
    sampleLibrarySelect.addEventListener("change", async () => {
      const selectedId = sampleLibrarySelect.value;
      if (deleteSampleBtn) {
        deleteSampleBtn.disabled = !selectedId;
      }
      if (!selectedId) {
        updateSampleChopperUI();
        return;
      }
      const sampleObj = getSampleById(selectedId);
      if (sampleObj) {
        await decodeSampleToAudioBuffer(sampleObj);
        applySavedSampleSoundDesign(sampleObj, true);

        resetChopMarkers(false);
        if (waveSelect) {
          waveSelect.value = `sample:${sampleObj.id}`;
        }
        if (previewRecBtn) {
          previewRecBtn.disabled = false;
        }
        updateSampleChopperUI();
        recalculateStaticWaveform("synth");

        if (recStatusText) {
          recStatusText.textContent = sampleObj.soundDesign
            ? `Loaded "${sampleObj.name}" + saved sound design.`
            : `Loaded clean sample "${sampleObj.name}" (default settings).`;
        }

        const holdMs = Math.max(350, Math.min(2500, Math.round(sampleObj.duration * 1000)));
        triggerOneShotSynthNote(parseFloat(noteSelect.value) || 220, holdMs);
      }
    });
  }

  if (deleteSampleBtn) {
    deleteSampleBtn.addEventListener("click", () => {
      deleteSelectedLibrarySample();
    });
  }
}

function setupEvents() {
  playBtn.addEventListener("click", togglePlay);
  metroBtn.addEventListener("click", toggleMetronome);

  if (learnToggleBtn) {
    learnToggleBtn.addEventListener("click", () => {
      setLearnModeEnabled(!learnModeEnabled);
    });
  }

  document.querySelectorAll("[data-tip]").forEach((el) => {
    if (el.classList.contains("knob-unit")) return;
    attachLearnHoverHandlers(el, () => {
      const labelEl = el.querySelector("span") || el.querySelector(".scope-label");
      const titleText = labelEl ? labelEl.textContent.trim() : (el.textContent.trim().slice(0, 28) || "Hardware Control");
      return {
        title: titleText,
        what: el.dataset.tip,
        listen: "Trigger a synth note or play the drum groove to hear how this control shapes the sound.",
        watch: "Watch the phosphor waveform and frequency analyzer respond in real time."
      };
    });
  });

  if (factoryPresetSelect) {
    factoryPresetSelect.addEventListener("change", () => {
      const chosenPreset = factoryPresetSelect.value;
      const presetObj = WAVECRAFT_DATA.presets[chosenPreset];
      loadDefaultPreset(chosenPreset);
      if (presetObj) {
        updateSoundDesignGuide({
          title: `Factory Preset • ${presetObj.name}`,
          what: presetObj.description || `Loaded ${presetObj.name} at ${presetObj.bpm} BPM.`,
          listen: "Press START / STOP (or Spacebar) for the 8-track groove, and hold keys A–K to play the matching synth patch.",
          watch: "Watch the 6 synth rack modules, tempo-synced echo, and 8 drum lanes update to match the preset."
        });
      }
    });
  }

  if (addSectionBtn) {
    addSectionBtn.addEventListener("click", addNewSection);
  }
  if (copySectionBtn) {
    copySectionBtn.addEventListener("click", copyCurrentSectionToNext);
  }
  if (chainSectionsBtn) {
    chainSectionsBtn.addEventListener("click", () => {
      chainSectionsEnabled = !chainSectionsEnabled;
      chainSectionsBtn.classList.toggle("active", chainSectionsEnabled);
      chainSectionsBtn.setAttribute("aria-pressed", String(chainSectionsEnabled));
      chainSectionsBtn.textContent = chainSectionsEnabled ? "CHAIN: ON" : "CHAIN: OFF";

      if (chainSectionsEnabled) {
        schedulingSectionIndex = activeSectionIndex;
      }

      renderSectionTabs();
      updateSoundDesignGuide({
        title: chainSectionsEnabled ? "Song Chain • Enabled (A → B → C...)" : "Song Chain • Loop Single Section",
        what: chainSectionsEnabled
          ? "Sequencer will automatically play through all sections in order (A → B → C...) like a full song arrangement."
          : "Sequencer will continuously loop only the currently selected section tab.",
        listen: "Press START / STOP to hear your pattern transitions play back-to-back.",
        watch: "Watch the active section tab glow amber as the playhead advances from section to section."
      });
    });
  }

  bpmInput.addEventListener("change", () => {
    updateMasterFxParams();
    recalculateStaticWaveform("synth");
    syncCalBeatTempo();
  });

  stepsSelect.addEventListener("change", () => {
    stepCount = Number(stepsSelect.value);
    if (sections[activeSectionIndex]) {
      sections[activeSectionIndex].stepCount = stepCount;
    }
    if (currentScheduleStep >= stepCount) {
      currentScheduleStep = 0;
    }
    lastDrawnVisualStep = -1;
    renderSectionTabs();
    renderGrid();
  });

  swingSlider.addEventListener("input", () => {
    swingPercent = Number(swingSlider.value);
    swingVal.textContent = swingPercent;
  });

  waveSelect.addEventListener("change", () => {
    const val = waveSelect.value;
    if (val.startsWith("sample:")) {
      const sampleObj = getSampleById(val);
      if (sampleObj) {
        if (sampleObj.id !== "unsaved") {
          if (sampleLibrarySelect) sampleLibrarySelect.value = sampleObj.id;
          if (deleteSampleBtn) deleteSampleBtn.disabled = false;
          applySavedSampleSoundDesign(sampleObj, true);
          if (recStatusText) {
            recStatusText.textContent = sampleObj.soundDesign
              ? `Loaded "${sampleObj.name}" + saved sound design.`
              : `Loaded clean sample "${sampleObj.name}" (default settings).`;
          }
        } else {
          resetSampleSoundDesignToDefaults(true);
        }
        resetChopMarkers(false);
        updateSampleChopperUI();
      }
    } else {
      updateSaveButtonsEnabledState();
    }
    recalculateStaticWaveform("synth");
  });

  if (testSynthBtn) {
    const triggerBtnMouseDown = (e) => {
      e.preventDefault();
      const freq = parseFloat(noteSelect.value) || 220;
      startSustainedSynthNote("ui_test_btn", freq, 0.92);
    };
    const releaseBtnMouseUp = () => {
      releaseSustainedSynthNote("ui_test_btn");
    };

    testSynthBtn.addEventListener("mousedown", triggerBtnMouseDown);
    window.addEventListener("mouseup", releaseBtnMouseUp);
    testSynthBtn.addEventListener("touchstart", triggerBtnMouseDown, { passive: false });
    testSynthBtn.addEventListener("touchend", releaseBtnMouseUp);
  }

  previewDrumBtn.addEventListener("click", () => {
    playDrumSound(selectedTrackId, null, true, 0.95);
  });

  inspireBtn.addEventListener("click", generateSmartGroove);

  clearBtn.addEventListener("click", () => {
    WAVECRAFT_DATA.tracks.forEach((t) => {
      gridState[t.id] = Array(32).fill(0);
    });
    if (sections[activeSectionIndex]) {
      sections[activeSectionIndex].grid = gridState;
    }
    renderGrid();
  });
}

// ============================================================================
// INITIALIZE APPLICATION ON LOAD
// ============================================================================

loadSavedSamplesFromStorage();
initRackDefaults();
initDrumSettings();

const synthCanvasEl = document.getElementById("scope-synth");
registerChannelCanvas("synth", synthCanvasEl, "#2dd4bf");

eqCanvas = document.getElementById("eq-visualizer");
if (eqCanvas) {
  eqCtx = eqCanvas.getContext("2d");
}

setupModularRackControls();
renderGlobalDrumSpaceKnobs();
loadDefaultPreset("basicRock");
syncSampleDropdowns();
updateSampleChopperUI();
renderDrumEditor();
setupSampleChopperEvents();
setupMicSamplerEvents();
setupEvents();
setupKeyboardShortcuts();
setLearnModeEnabled(true);
syncCalBeatTempo();
updateCalAnimationState();

drawChannelCanvas(channelVisuals.synth, null);
drawEqVisualizer();