// 1_data/data.js
// DATA LAYER: Holds drum tracks, factory presets, and beginner explanations.

const WAVECRAFT_DATA = {
  tracks: [
    { id: "kick", name: "Kick", samplePath: "assets/samples/kick.wav", fallbackFreq: 65, color: "#ff5e5b" },
    { id: "snare", name: "Snare", samplePath: "assets/samples/snare.wav", fallbackFreq: 180, color: "#ffbe0b" },
    { id: "hihat", name: "Closed Hat", samplePath: "assets/samples/hihat-closed.wav", fallbackFreq: 800, color: "#00bbf9" },
    { id: "clap", name: "Clap", samplePath: "assets/samples/clap.wav", fallbackFreq: 320, color: "#9b5de5" }
  ],

  presets: {
    basicRock: {
      name: "Basic Four-on-the-Floor",
      bpm: 120,
      waveform: "sawtooth",
      cutoff: 2200,
      release: 0.3,
      pattern: {
        kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
        clap:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0]
      }
    },
    chillHipHop: {
      name: "Chill Boom-Bap",
      bpm: 92,
      waveform: "triangle",
      cutoff: 1100,
      release: 0.5,
      pattern: {
        kick:  [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
        snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
        hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        clap:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
      }
    }
  }
};