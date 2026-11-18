// 1_data/data.js
// DATA LAYER: Holds drum tracks, per-instrument sound presets, and factory patterns.

const WAVECRAFT_DATA = {
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
      release: 0.3,
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
      release: 0.5,
      pattern: {
        kick:  [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0, 1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
        hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
        clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
      }
    }
  }
};