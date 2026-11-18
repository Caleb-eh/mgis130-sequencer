// 1_data/data.js
// DATA LAYER: Holds modular knob definitions, Learn Mode tooltips, drum presets, and patterns.

const WAVECRAFT_DATA = {
  // Modular Rack Knob Definitions (defaults, ranges, units, and plain-English Learn Mode tips)
  rackModules: {
    adsr: {
      title: "ADSR Envelope",
      accent: "#38bdf8",
      knobs: [
        {
          id: "attack",
          label: "Attack",
          min: 0.005,
          max: 1.0,
          step: 0.005,
          defaultValue: 0.02,
          unit: "ms",
          tip: "Attack: how fast the sound fades in after you trigger it. Low = snappy punch; High = slow swell."
        },
        {
          id: "decay",
          label: "Decay",
          min: 0.02,
          max: 1.5,
          step: 0.01,
          defaultValue: 0.25,
          unit: "ms",
          tip: "Decay: how quickly the sound drops from its loudest peak down to the Sustain level."
        },
        {
          id: "sustain",
          label: "Sustain",
          min: 0.05,
          max: 1.0,
          step: 0.01,
          defaultValue: 0.55,
          unit: "%",
          tip: "Sustain: the steady volume level held while a note stays active."
        },
        {
          id: "release",
          label: "Release",
          min: 0.05,
          max: 2.0,
          step: 0.02,
          defaultValue: 0.35,
          unit: "ms",
          tip: "Release: how long the sound lingers and fades out after the note ends."
        }
      ]
    },
    filter: {
      title: "Filter & Modulation",
      accent: "#a855f7",
      knobs: [
        {
          id: "cutoff",
          label: "Cutoff",
          min: 80,
          max: 8000,
          step: 20,
          defaultValue: 2200,
          unit: "Hz",
          tip: "Filter Cutoff: the frequency boundary where the filter starts removing brightness (LP) or bass (HP)."
        },
        {
          id: "resonance",
          label: "Resonance",
          min: 0.5,
          max: 18,
          step: 0.2,
          defaultValue: 2.5,
          unit: "Q",
          tip: "Resonance (Q): boosts frequencies right at the Cutoff point for a sharp, vocal, or acid whistle."
        },
        {
          id: "modDepth",
          label: "LFO Mod",
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 15,
          unit: "%",
          tip: "Modulation (LFO): automatically wobbles the filter cutoff up and down for movement and vibrato."
        }
      ]
    },
    dynamics: {
      title: "Dynamics & Grit",
      accent: "#f59e0b",
      knobs: [
        {
          id: "drive",
          label: "Drive",
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 10,
          unit: "%",
          tip: "Drive (Saturation): adds warm analog crunch and harmonic harmonics by gently clipping the wave."
        },
        {
          id: "compression",
          label: "Compress",
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 25,
          unit: "%",
          tip: "Compression: tames loud volume spikes and glues sounds together so quiet details stand out."
        },
        {
          id: "gate",
          label: "Noise Gate",
          min: -80,
          max: -10,
          step: 1,
          defaultValue: -70,
          unit: "dB",
          tip: "Noise Gate: silences quiet background hiss or reverb tails once volume drops below this threshold."
        }
      ]
    },
    space: {
      title: "Space & Time",
      accent: "#10b981",
      knobs: [
        {
          id: "echo",
          label: "Echo",
          min: 0,
          max: 85,
          step: 1,
          defaultValue: 20,
          unit: "%",
          tip: "Echo (Feedback Delay): creates rhythmic repeating bounces of your sound."
        },
        {
          id: "reverb",
          label: "Reverb",
          min: 0,
          max: 90,
          step: 1,
          defaultValue: 25,
          unit: "%",
          tip: "Reverb: simulates sound waves bouncing around a room or hall to add depth and space."
        }
      ]
    }
  },

  tracks: [
    {
      id: "kick",
      name: "Kick",
      samplePath: "assets/samples/kick.wav",
      color: "#ff5e5b",
      soundPresets: {
        presetA: {
          label: "Punchy 808",
          wave: "sine",
          startFreq: 130,
          endFreq: 38,
          decay: 0.28,
          noiseMix: 0,
          volume: 0.85,
          lowCut: 30,
          midCut: 0,
          highCut: 6000,
          attack: 0.005
        },
        presetB: {
          label: "Tight Club",
          wave: "triangle",
          startFreq: 165,
          endFreq: 48,
          decay: 0.16,
          noiseMix: 0.08,
          volume: 0.85,
          lowCut: 45,
          midCut: -6,
          highCut: 9000,
          attack: 0.002
        }
      }
    },
    {
      id: "snare",
      name: "Snare",
      samplePath: "assets/samples/snare.wav",
      color: "#ffbe0b",
      soundPresets: {
        presetA: {
          label: "Crisp Studio",
          wave: "triangle",
          startFreq: 210,
          endFreq: 110,
          decay: 0.18,
          noiseMix: 0.65,
          volume: 0.75,
          lowCut: 110,
          midCut: 0,
          highCut: 12000,
          attack: 0.004
        },
        presetB: {
          label: "Fat Lo-Fi",
          wave: "sine",
          startFreq: 175,
          endFreq: 85,
          decay: 0.24,
          noiseMix: 0.45,
          volume: 0.75,
          lowCut: 90,
          midCut: -4,
          highCut: 4200,
          attack: 0.015
        }
      }
    },
    {
      id: "hihat",
      name: "Closed Hat",
      samplePath: "assets/samples/hihat-closed.wav",
      color: "#00bbf9",
      soundPresets: {
        presetA: {
          label: "Sharp Tick",
          wave: "square",
          startFreq: 950,
          endFreq: 400,
          decay: 0.07,
          noiseMix: 0.85,
          volume: 0.6,
          lowCut: 400,
          midCut: 0,
          highCut: 15000,
          attack: 0.002
        },
        presetB: {
          label: "Soft Shaker",
          wave: "triangle",
          startFreq: 600,
          endFreq: 300,
          decay: 0.11,
          noiseMix: 0.9,
          volume: 0.6,
          lowCut: 650,
          midCut: -5,
          highCut: 8500,
          attack: 0.02
        }
      }
    },
    {
      id: "clap",
      name: "Clap",
      samplePath: "assets/samples/clap.wav",
      color: "#9b5de5",
      soundPresets: {
        presetA: {
          label: "Classic Snap",
          wave: "sawtooth",
          startFreq: 340,
          endFreq: 160,
          decay: 0.19,
          noiseMix: 0.8,
          volume: 0.7,
          lowCut: 220,
          midCut: 0,
          highCut: 11000,
          attack: 0.008
        },
        presetB: {
          label: "Wide Room",
          wave: "triangle",
          startFreq: 280,
          endFreq: 130,
          decay: 0.28,
          noiseMix: 0.85,
          volume: 0.7,
          lowCut: 180,
          midCut: -6,
          highCut: 7500,
          attack: 0.018
        }
      }
    }
  ],

  // 32-step patterns so 8, 16, and 32 step quantization all slice cleanly
  presets: {
    basicRock: {
      name: "Basic Four-on-the-Floor",
      bpm: 120,
      waveform: "sawtooth",
      cutoff: 2200,
      release: 0.35,
      pattern: {
        kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
        clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,1,0]
      }
    },
    chillHipHop: {
      name: "Chill Boom-Bap",
      bpm: 92,
      waveform: "triangle",
      cutoff: 1100,
      release: 0.55,
      pattern: {
        kick:  [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0, 1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
        hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
        clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
      }
    }
  }
};