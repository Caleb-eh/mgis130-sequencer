// 1_data/data.js
// DATA LAYER: Holds exaggerated educational DSP ranges, 3-part Sound Design Guide insights,
// 8 studio-grade drum voices (3 variations each), and 4 complete factory presets.

const WAVECRAFT_DATA = {
  // Modular Rack Knob Definitions with rich 3-part educational breakdowns (what, listen, watch)
  rackModules: {
    tuning: {
      title: "Oscillator Tuning",
      accent: "#f5efe6",
      knobs: [
        {
          id: "pitch",
          label: "Pitch",
          min: -24,
          max: 24,
          step: 1,
          defaultValue: 0,
          unit: "st",
          guideTitle: "Oscillator • Coarse Pitch Shift",
          what: "Shifts the oscillator frequency smoothly across a wide 4-octave range (-24 to +24 semitones).",
          listen: "Turn down for sub-shaking basslines or sweep upward for screaming analog lead tones.",
          watch: "Watch the wave cycles pack tightly together (higher pitch) or stretch apart (lower pitch)."
        },
        {
          id: "detune",
          label: "Detune",
          min: -100,
          max: 100,
          step: 1,
          defaultValue: 0,
          unit: "ct",
          guideTitle: "Oscillator • Fine Detune & Stereo Twin Chorus",
          what: "Fine-tunes pitch in cents (-100 to +100 ct) and layers a stereo-widened twin oscillator for rich analog chorus.",
          listen: "Turn away from 0 ct to hear two oscillators beating against each other in a wide, swirling stereo unison.",
          watch: "Watch phase interference ripples shimmer across the waveform as the twin oscillators drift."
        }
      ]
    },
    adsr: {
      title: "ADSR Envelope",
      accent: "#38bdf8",
      knobs: [
        {
          id: "attack",
          label: "Attack",
          min: 0.005,
          max: 1.4,
          step: 0.005,
          defaultValue: 0.02,
          unit: "ms",
          guideTitle: "ADSR • Attack Time",
          what: "Controls how quickly the sound fades in from silence to peak volume after a note starts.",
          listen: "Low values create an instant percussive punch; high values create a slow, violin-like swell.",
          watch: "Watch the left slope of the waveform envelope ramp up gradually instead of starting at full height."
        },
        {
          id: "decay",
          label: "Decay",
          min: 0.02,
          max: 1.8,
          step: 0.01,
          defaultValue: 0.25,
          unit: "ms",
          guideTitle: "ADSR • Decay Time",
          what: "Sets how fast the volume drops from its initial peak down to the Sustain holding level.",
          listen: "Short decay creates snappy, plucky synth stabs; long decay produces a smoother, lingering drop.",
          watch: "Watch the steepness of the downward slope right after the initial peak."
        },
        {
          id: "sustain",
          label: "Sustain",
          min: 0.0,
          max: 1.0,
          step: 0.01,
          defaultValue: 0.55,
          unit: "%",
          guideTitle: "ADSR • Sustain Level",
          what: "Determines the steady volume height held while holding a key (A–K) or during the body of a note.",
          listen: "Hold a key (A–K): at 0%, the note dies out into a sharp pluck; at 100%, it holds at full organ loudness.",
          watch: "Watch the middle plateau of the wave rise or shrink down toward the center line."
        },
        {
          id: "release",
          label: "Release",
          min: 0.04,
          max: 2.5,
          step: 0.02,
          defaultValue: 0.35,
          unit: "ms",
          guideTitle: "ADSR • Release Tail",
          what: "Controls how long the sound takes to fade back to zero after you release a key or the note ends.",
          listen: "Low values cut off abruptly when you lift your finger; high values let chords ring out softly.",
          watch: "Watch the right-hand tail of the waveform stretch out into a long, tapering fade."
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
          min: 60,
          max: 8500,
          step: 20,
          defaultValue: 2200,
          unit: "Hz",
          guideTitle: "Filter • Cutoff Frequency",
          what: "Sets the frequency border where the filter removes high frequencies (LP) or low bass (HP).",
          listen: "Turning Low-Pass down makes bright waves sound warm, muffled, and underwater.",
          watch: "Watch sharp sawtooth/square edges smooth out into rounder curves and the EQ curve roll off."
        },
        {
          id: "resonance",
          label: "Resonance",
          min: 0.5,
          max: 28,
          step: 0.2,
          defaultValue: 3.0,
          unit: "Q",
          guideTitle: "Filter • Resonance (Q Peak)",
          what: "Dramatically boosts a narrow band of frequencies right at the Cutoff frequency.",
          listen: "Listen for an unmistakable, sharp whistling or vocal 'oww' peak ringing at the cutoff pitch.",
          watch: "Watch a sharp resonant spike appear on the Live EQ graph right at the cutoff frequency."
        },
        {
          id: "modDepth",
          label: "LFO Mod",
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 15,
          unit: "%",
          guideTitle: "Filter • LFO Modulation Depth",
          what: "Uses an invisible Low-Frequency Oscillator (LFO) to sweep the filter cutoff up and down automatically.",
          listen: "Listen for a rhythmic 'wah-wah' wobble and sweeping harmonic movement across the note.",
          watch: "Watch the wave's harmonic ripple density expand and compress across the length of the note."
        }
      ]
    },
    eq: {
      title: "3-Band Equalizer",
      accent: "#ea580c",
      knobs: [
        {
          id: "eqBass",
          label: "Bass",
          min: -15,
          max: 15,
          step: 0.5,
          defaultValue: 0,
          unit: "dB",
          guideTitle: "3-Band EQ • Bass Low-Shelf (120 Hz)",
          what: "Boosts or cuts deep sub-bass and warmth frequencies below 120 Hz using a Low-Shelf filter.",
          listen: "Turn clockwise for heavy, chest-thumping low end; turn counter-clockwise to tighten muddy bass.",
          watch: "Watch the left side of the Live EQ Frequency Curve lift above or dip below the 0 dB center line."
        },
        {
          id: "eqMid",
          label: "Mid",
          min: -15,
          max: 15,
          step: 0.5,
          defaultValue: 0,
          unit: "dB",
          guideTitle: "3-Band EQ • Mid Peaking (1,000 Hz)",
          what: "Boosts or scoops midrange presence centered at 1 kHz where synth leads and snare punch live.",
          listen: "Boost for aggressive vocal presence; cut to create a scooped, modern hi-fi studio curve.",
          watch: "Watch the bell-shaped curve rise or dip around the 1 kHz center marker on the EQ screen."
        },
        {
          id: "eqTreble",
          label: "Treble",
          min: -15,
          max: 15,
          step: 0.5,
          defaultValue: 0,
          unit: "dB",
          guideTitle: "3-Band EQ • Treble High-Shelf (4.5 kHz)",
          what: "Boosts or attenuates crisp high frequencies above 4,500 Hz using a High-Shelf filter.",
          listen: "Turn up for bright hi-hat sizzle and synth air; turn down for warm, vintage analog tape roll-off.",
          watch: "Watch the right side of the Live EQ Frequency Curve rise toward 10 kHz or slope downward."
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
          defaultValue: 12,
          unit: "%",
          guideTitle: "Dynamics • 4x Oversampled Overdrive",
          what: "Pushes the synth into smooth 4x-oversampled analog saturation with warm high-end smoothing.",
          listen: "Listen for clean tones transforming into warm, crunchy, harmonic-rich distorted synth textures.",
          watch: "Watch the rounded peaks of the wave visibly flatten and square off against the ceiling!"
        },
        {
          id: "compression",
          label: "Compress",
          min: 0,
          max: 100,
          step: 1,
          defaultValue: 25,
          unit: "%",
          guideTitle: "Dynamics • Synth Compression",
          what: "Evens out synthesizer volume peaks while boosting quieter sustain sections (drums use their own clean bus limiter).",
          listen: "Listen for the quiet decay and sustain portions of synth chords becoming noticeably fuller and louder.",
          watch: "Watch the difference between the tallest peak and the quieter tail even out vertically."
        },
        {
          id: "gate",
          label: "Noise Gate",
          min: -80,
          max: -6,
          step: 1,
          defaultValue: -72,
          unit: "dB",
          guideTitle: "Dynamics • Synth Noise Gate Threshold",
          what: "Clamps shut whenever the synth drops below the dB threshold—isolated from drums so drum transients never get clipped.",
          listen: "Raise the gate higher to hear quiet synth reverb/release tails abruptly chop off into dead silence.",
          watch: "Watch the tapering tail of the synth waveform suddenly snap flat to zero once it falls below threshold."
        }
      ]
    },
    space: {
      title: "Space & Time (Synth Only)",
      accent: "#10b981",
      knobs: [
        {
          id: "echo",
          label: "Echo",
          min: 0,
          max: 90,
          step: 1,
          defaultValue: 20,
          unit: "%",
          guideTitle: "Space & Time • Synth Echo (Tempo-Synced Delay)",
          what: "Creates repeating copies of the synthesizer note. Use the SYNC selector to lock repeats to 1/8, Dotted 1/8, or 1/4 notes at your current BPM.",
          listen: "Listen for rhythmic bouncing repeats locking directly into the groove of your drum beat.",
          watch: "Watch ghost echo pulses adjust spacing along the tail of the synth waveform preview."
        },
        {
          id: "reverb",
          label: "Reverb",
          min: 0,
          max: 95,
          step: 1,
          defaultValue: 25,
          unit: "%",
          guideTitle: "Space & Time • Stereo Damped Hall Reverb",
          what: "Simulates stereo-decorrelated early reflections and warm damped hall tails exclusively for the synthesizer.",
          listen: "Listen for a lush, wide stereo wash that surrounds the synth while keeping drums punchy.",
          watch: "Watch a dense, shimmering acoustic tail fill the space behind the main synth envelope."
        }
      ]
    }
  },

  // 8 Studio-Grade Drum Voices with 3 Selectable Variations Each (presetA, presetB, presetC)
  tracks: [
    {
      id: "kick",
      name: "Kick",
      keyShortcut: "1",
      color: "#ea580c",
      soundPresets: {
        presetA: {
          label: "Punchy 808",
          engine: "kick",
          wave: "sine",
          startFreq: 160,
          endFreq: 42,
          decay: 0.34,
          noiseMix: 0.04,
          warmth: 0.35,
          volume: 0.88,
          lowCut: 28,
          midCut: -2,
          highCut: 6500,
          attack: 0.003
        },
        presetB: {
          label: "Tight 909",
          engine: "kick",
          wave: "triangle",
          startFreq: 185,
          endFreq: 48,
          decay: 0.21,
          noiseMix: 0.12,
          warmth: 0.45,
          volume: 0.88,
          lowCut: 42,
          midCut: -5,
          highCut: 9500,
          attack: 0.002
        },
        presetC: {
          label: "Sub Boom",
          engine: "kick",
          wave: "sine",
          startFreq: 135,
          endFreq: 33,
          decay: 0.52,
          noiseMix: 0.02,
          warmth: 0.28,
          volume: 0.9,
          lowCut: 24,
          midCut: -3,
          highCut: 4200,
          attack: 0.005
        }
      }
    },
    {
      id: "snare",
      name: "Snare",
      keyShortcut: "2",
      color: "#f59e0b",
      soundPresets: {
        presetA: {
          label: "Crisp Studio",
          engine: "snare",
          wave: "triangle",
          startFreq: 185,
          endFreq: 112,
          decay: 0.2,
          noiseMix: 0.68,
          warmth: 0.25,
          volume: 0.78,
          lowCut: 110,
          midCut: 1,
          highCut: 12500,
          attack: 0.003
        },
        presetB: {
          label: "Fat Lo-Fi",
          engine: "snare",
          wave: "sine",
          startFreq: 165,
          endFreq: 88,
          decay: 0.27,
          noiseMix: 0.5,
          warmth: 0.4,
          volume: 0.78,
          lowCut: 90,
          midCut: -3,
          highCut: 4600,
          attack: 0.01
        },
        presetC: {
          label: "Gated 80s",
          engine: "snare",
          wave: "triangle",
          startFreq: 205,
          endFreq: 125,
          decay: 0.32,
          noiseMix: 0.82,
          warmth: 0.35,
          volume: 0.8,
          lowCut: 125,
          midCut: 2,
          highCut: 14000,
          attack: 0.002
        }
      }
    },
    {
      id: "hihat",
      name: "Closed Hat",
      keyShortcut: "3",
      color: "#2dd4bf",
      soundPresets: {
        presetA: {
          label: "Sharp Tick",
          engine: "metallic",
          wave: "square",
          startFreq: 800,
          endFreq: 540,
          decay: 0.065,
          noiseMix: 0.85,
          metallicTone: 0.75,
          volume: 0.64,
          lowCut: 480,
          midCut: 0,
          highCut: 15500,
          attack: 0.002
        },
        presetB: {
          label: "Soft Shaker",
          engine: "metallic",
          wave: "triangle",
          startFreq: 640,
          endFreq: 420,
          decay: 0.11,
          noiseMix: 0.92,
          metallicTone: 0.45,
          volume: 0.62,
          lowCut: 750,
          midCut: -4,
          highCut: 9200,
          attack: 0.016
        },
        presetC: {
          label: "Metallic 808",
          engine: "metallic",
          wave: "square",
          startFreq: 960,
          endFreq: 680,
          decay: 0.085,
          noiseMix: 0.7,
          metallicTone: 1.0,
          volume: 0.66,
          lowCut: 560,
          midCut: 1,
          highCut: 16000,
          attack: 0.001
        }
      }
    },
    {
      id: "openhat",
      name: "Open Hat",
      keyShortcut: "4",
      color: "#06b6d4",
      soundPresets: {
        presetA: {
          label: "Sizzle 808",
          engine: "metallic",
          wave: "square",
          startFreq: 860,
          endFreq: 620,
          decay: 0.36,
          noiseMix: 0.75,
          metallicTone: 0.95,
          volume: 0.62,
          lowCut: 460,
          midCut: 0,
          highCut: 15500,
          attack: 0.004
        },
        presetB: {
          label: "Trashy 909",
          engine: "metallic",
          wave: "square",
          startFreq: 740,
          endFreq: 510,
          decay: 0.44,
          noiseMix: 0.88,
          metallicTone: 0.78,
          volume: 0.64,
          lowCut: 390,
          midCut: 2,
          highCut: 14500,
          attack: 0.003
        },
        presetC: {
          label: "Half-Open Crisp",
          engine: "metallic",
          wave: "square",
          startFreq: 920,
          endFreq: 650,
          decay: 0.22,
          noiseMix: 0.78,
          metallicTone: 0.88,
          volume: 0.62,
          lowCut: 540,
          midCut: -1,
          highCut: 15000,
          attack: 0.002
        }
      }
    },
    {
      id: "clap",
      name: "Clap",
      keyShortcut: "5",
      color: "#ef4444",
      soundPresets: {
        presetA: {
          label: "Classic Snap",
          engine: "clap",
          wave: "triangle",
          startFreq: 320,
          endFreq: 165,
          decay: 0.21,
          noiseMix: 0.88,
          spreadMs: 0.012,
          volume: 0.74,
          lowCut: 240,
          midCut: 1,
          highCut: 11500,
          attack: 0.003
        },
        presetB: {
          label: "Wide Room",
          engine: "clap",
          wave: "triangle",
          startFreq: 275,
          endFreq: 135,
          decay: 0.31,
          noiseMix: 0.92,
          spreadMs: 0.016,
          volume: 0.74,
          lowCut: 190,
          midCut: -4,
          highCut: 8400,
          attack: 0.006
        },
        presetC: {
          label: "Tight Electro",
          engine: "clap",
          wave: "sawtooth",
          startFreq: 390,
          endFreq: 190,
          decay: 0.14,
          noiseMix: 0.85,
          spreadMs: 0.009,
          volume: 0.74,
          lowCut: 310,
          midCut: 2,
          highCut: 13500,
          attack: 0.002
        }
      }
    },
    {
      id: "lowtom",
      name: "Low Tom",
      keyShortcut: "6",
      color: "#f97316",
      soundPresets: {
        presetA: {
          label: "Deep 808 Tom",
          engine: "tom",
          wave: "sine",
          startFreq: 145,
          endFreq: 68,
          decay: 0.34,
          noiseMix: 0.08,
          warmth: 0.25,
          volume: 0.78,
          lowCut: 50,
          midCut: -2,
          highCut: 5200,
          attack: 0.003
        },
        presetB: {
          label: "Acoustic Floor",
          engine: "tom",
          wave: "triangle",
          startFreq: 165,
          endFreq: 76,
          decay: 0.38,
          noiseMix: 0.22,
          warmth: 0.3,
          volume: 0.78,
          lowCut: 58,
          midCut: -4,
          highCut: 6800,
          attack: 0.004
        },
        presetC: {
          label: "Pitched Zap",
          engine: "tom",
          wave: "sine",
          startFreq: 240,
          endFreq: 55,
          decay: 0.26,
          noiseMix: 0.05,
          warmth: 0.4,
          volume: 0.78,
          lowCut: 45,
          midCut: 1,
          highCut: 7500,
          attack: 0.002
        }
      }
    },
    {
      id: "midtom",
      name: "Mid Tom",
      keyShortcut: "7",
      color: "#eab308",
      soundPresets: {
        presetA: {
          label: "Punchy Rack Tom",
          engine: "tom",
          wave: "sine",
          startFreq: 215,
          endFreq: 108,
          decay: 0.26,
          noiseMix: 0.12,
          warmth: 0.25,
          volume: 0.75,
          lowCut: 85,
          midCut: 0,
          highCut: 6800,
          attack: 0.003
        },
        presetB: {
          label: "Hollow Synth Tom",
          engine: "tom",
          wave: "triangle",
          startFreq: 245,
          endFreq: 122,
          decay: 0.28,
          noiseMix: 0.16,
          warmth: 0.35,
          volume: 0.75,
          lowCut: 95,
          midCut: 2,
          highCut: 8200,
          attack: 0.003
        },
        presetC: {
          label: "Disco Sweep",
          engine: "tom",
          wave: "sine",
          startFreq: 340,
          endFreq: 96,
          decay: 0.31,
          noiseMix: 0.08,
          warmth: 0.3,
          volume: 0.76,
          lowCut: 80,
          midCut: 1,
          highCut: 9000,
          attack: 0.002
        }
      }
    },
    {
      id: "crash",
      name: "Crash",
      keyShortcut: "8",
      color: "#a855f7",
      soundPresets: {
        presetA: {
          label: "Bright Splash",
          engine: "metallic",
          wave: "square",
          startFreq: 1040,
          endFreq: 720,
          decay: 0.72,
          noiseMix: 0.82,
          metallicTone: 0.92,
          volume: 0.62,
          lowCut: 420,
          midCut: 1,
          highCut: 16000,
          attack: 0.005
        },
        presetB: {
          label: "Dark Wash",
          engine: "metallic",
          wave: "square",
          startFreq: 760,
          endFreq: 510,
          decay: 0.92,
          noiseMix: 0.86,
          metallicTone: 0.85,
          volume: 0.62,
          lowCut: 340,
          midCut: -3,
          highCut: 10800,
          attack: 0.012
        },
        presetC: {
          label: "Lo-Fi Trash",
          engine: "metallic",
          wave: "square",
          startFreq: 880,
          endFreq: 590,
          decay: 0.58,
          noiseMix: 0.94,
          metallicTone: 0.75,
          volume: 0.64,
          lowCut: 520,
          midCut: 3,
          highCut: 7800,
          attack: 0.004
        }
      }
    }
  ],

  // 32-step factory patterns across all 8 tracks + full modular rack parameter snapshots
  presets: {
    basicRock: {
      name: "Basic Four-on-the-Floor",
      bpm: 120,
      swing: 0,
      delaySync: "1/8",
      waveform: "sawtooth",
      filterType: "lowpass",
      rackParams: {
        pitch: 0,
        detune: 8,
        attack: 0.02,
        decay: 0.25,
        sustain: 0.55,
        release: 0.35,
        cutoff: 2400,
        resonance: 3.0,
        modDepth: 12,
        eqBass: 2.0,
        eqMid: 0.0,
        eqTreble: 1.5,
        drive: 12,
        compression: 25,
        gate: -72,
        echo: 18,
        reverb: 22
      },
      pattern: {
        kick:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
        snare:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,0,0],
        openhat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
        clap:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
        lowtom:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
        midtom:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
        crash:   [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
      }
    },
    chillHipHop: {
      name: "Chill Boom-Bap",
      bpm: 92,
      swing: 25,
      delaySync: "1/8d",
      waveform: "triangle",
      filterType: "lowpass",
      rackParams: {
        pitch: -12,
        detune: 14,
        attack: 0.04,
        decay: 0.35,
        sustain: 0.45,
        release: 0.55,
        cutoff: 1150,
        resonance: 5.5,
        modDepth: 32,
        eqBass: 4.5,
        eqMid: -2.0,
        eqTreble: -1.5,
        drive: 28,
        compression: 45,
        gate: -62,
        echo: 32,
        reverb: 38
      },
      pattern: {
        kick:    [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0, 1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0],
        snare:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
        hihat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,0,0, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,0,0],
        openhat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
        clap:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        lowtom:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
        midtom:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0],
        crash:   [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
      }
    },
    acidElectro: {
      name: "Acid Electro Pulse",
      bpm: 132,
      swing: 10,
      delaySync: "1/8d",
      waveform: "square",
      filterType: "lowpass",
      rackParams: {
        pitch: 0,
        detune: 22,
        attack: 0.01,
        decay: 0.18,
        sustain: 0.3,
        release: 0.22,
        cutoff: 1500,
        resonance: 16.5,
        modDepth: 68,
        eqBass: 3.0,
        eqMid: 2.5,
        eqTreble: 4.0,
        drive: 55,
        compression: 55,
        gate: -50,
        echo: 42,
        reverb: 24
      },
      pattern: {
        kick:    [1,0,0,0, 1,0,0,1, 0,0,1,0, 1,0,0,0, 1,0,0,0, 1,0,0,1, 0,0,1,0, 1,0,1,0],
        snare:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0],
        openhat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
        clap:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        lowtom:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
        midtom:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,0,0],
        crash:   [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
      }
    },
    electroTomGroove: {
      name: "808 Electro Tom Groove",
      bpm: 126,
      swing: 8,
      delaySync: "1/8",
      waveform: "sawtooth",
      filterType: "lowpass",
      rackParams: {
        pitch: -12,
        detune: 18,
        attack: 0.012,
        decay: 0.22,
        sustain: 0.42,
        release: 0.28,
        cutoff: 1950,
        resonance: 9.5,
        modDepth: 42,
        eqBass: 4.0,
        eqMid: 1.0,
        eqTreble: 2.5,
        drive: 34,
        compression: 40,
        gate: -64,
        echo: 28,
        reverb: 26
      },
      pattern: {
        kick:    [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0, 1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0],
        snare:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat:   [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,0,0],
        openhat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
        clap:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        lowtom:  [0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0, 0,0,0,0, 0,0,0,1, 0,0,1,1],
        midtom:  [0,0,0,0, 0,0,0,0, 0,1,0,0, 0,1,0,0, 0,0,0,0, 0,0,0,0, 0,1,0,0, 1,1,0,0],
        crash:   [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]
      }
    }
  }
};