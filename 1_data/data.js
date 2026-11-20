// 1_data/data.js
// DATA LAYER: Holds exaggerated educational DSP ranges, 3-part Sound Design Guide insights, drum presets, and factory patterns.

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
          guideTitle: "Oscillator • Fine Detune & Twin Chorus",
          what: "Fine-tunes pitch in cents (-100 to +100 ct) and layers a slightly detuned twin oscillator for classic analog chorus.",
          listen: "Turn away from 0 ct to hear two oscillators beating against each other in a thick, swirling unison.",
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
          what: "Determines the steady volume height held during the middle body of the note.",
          listen: "At 0%, the note dies out into a sharp pluck; at 100%, it stays at full organ-like loudness.",
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
          what: "Controls how long the sound takes to fade back to zero after the note finishes.",
          listen: "Low values cut off abruptly; high values let notes glide and ring out softly.",
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
          guideTitle: "Dynamics • Overdrive Saturation",
          what: "Pushes the signal into hard analog-style clipping, adding rich harmonic grit and aggression.",
          listen: "Listen for clean tones transforming into fuzzy, crunchy, distorted synth lead textures.",
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
          guideTitle: "Dynamics • Audio Compression",
          what: "Squashes loud volume peaks while boosting quieter body sections for a thick, consistent level.",
          listen: "Listen for the quiet decay and sustain portions becoming noticeably fuller and louder.",
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
          guideTitle: "Dynamics • Noise Gate Threshold",
          what: "Acts like an automatic mute switch that clamps shut whenever the wave drops below the dB threshold.",
          listen: "Raise the gate higher to hear quiet tails abruptly chop off into dead silence.",
          watch: "Watch the tapering tail of the waveform suddenly snap flat to a straight zero line once it falls below threshold."
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
          guideTitle: "Space & Time • Synth Echo (Delay)",
          what: "Creates rhythmic repeating copies of the synthesizer note (drums bypass this so beats stay tight).",
          listen: "Listen for distinct, rhythmic bouncing repeats trailing behind your synth note.",
          watch: "Watch ghost echo pulses appear spaced out along the tail of the synth waveform preview."
        },
        {
          id: "reverb",
          label: "Reverb",
          min: 0,
          max: 95,
          step: 1,
          defaultValue: 25,
          unit: "%",
          guideTitle: "Space & Time • Synth Hall Reverb",
          what: "Simulates thousands of acoustic reflections inside a large hall exclusively for the synthesizer.",
          listen: "Listen for a lush, atmospheric wash that surrounds the synth while keeping drums dry and punchy.",
          watch: "Watch a dense, shimmering acoustic tail fill the space behind the main synth envelope."
        }
      ]
    }
  },

  tracks: [
    {
      id: "kick",
      name: "Kick",
      samplePath: "assets/samples/kick.wav",
      color: "#ea580c",
      soundPresets: {
        presetA: {
          label: "Punchy 808",
          wave: "sine",
          startFreq: 135,
          endFreq: 36,
          decay: 0.3,
          noiseMix: 0,
          volume: 0.85,
          lowCut: 30,
          midCut: 0,
          highCut: 6000,
          attack: 0.005
        },
        presetB: {
          label: "Tight 909",
          wave: "triangle",
          startFreq: 170,
          endFreq: 46,
          decay: 0.17,
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
      color: "#f59e0b",
      soundPresets: {
        presetA: {
          label: "Crisp Studio",
          wave: "triangle",
          startFreq: 210,
          endFreq: 110,
          decay: 0.19,
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
          decay: 0.25,
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
      color: "#2dd4bf",
      soundPresets: {
        presetA: {
          label: "Sharp Tick",
          wave: "square",
          startFreq: 950,
          endFreq: 400,
          decay: 0.08,
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
          decay: 0.12,
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
      color: "#ef4444",
      soundPresets: {
        presetA: {
          label: "Classic Snap",
          wave: "sawtooth",
          startFreq: 340,
          endFreq: 160,
          decay: 0.2,
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

  // 32-step factory patterns + full modular rack parameter snapshots
  presets: {
    basicRock: {
      name: "Basic Four-on-the-Floor",
      bpm: 120,
      swing: 0,
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
        kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
        clap:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,1,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,1,0]
      }
    },
    chillHipHop: {
      name: "Chill Boom-Bap",
      bpm: 92,
      swing: 25,
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
        kick:  [1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0, 1,0,0,1, 0,0,1,0, 0,0,1,0, 0,0,0,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
        hihat: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
        clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
      }
    },
    acidElectro: {
      name: "Acid Electro Pulse",
      bpm: 132,
      swing: 10,
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
        kick:  [1,0,0,0, 1,0,0,1, 0,0,1,0, 1,0,0,0, 1,0,0,0, 1,0,0,1, 0,0,1,0, 1,0,1,0],
        snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
        hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,1],
        clap:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0]
      }
    }
  }
};