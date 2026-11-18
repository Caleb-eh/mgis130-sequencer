# mgis130-sequencer
Drum Sequencer and Beat Synthesizer
🎛️ WaveCraft — Interactive Drum Sequencer & Sound Design Lab

WaveCraft is a beginner-friendly, browser-based music production and sound design application. Built with vanilla HTML, CSS, and JavaScript using the Web Audio API, it allows users to build 16-step drum loops using .wav samples and sculpt custom synthesizer sounds in real time.

Designed specifically for newcomers learning audio engineering and synthesis, WaveCraft pairs clean, color-coded visual controls with real-time waveform feedback and plain-English explanations for every parameter.

✨ Features

🥁 16-Step Drum Sequencer

Sample-Based Playback: Triggers crisp .wav audio samples for core drum kit elements (Kick, Snare, Closed Hi-Hat, Open Hi-Hat, Clap, Tom, Perc).

Visual Beat Grouping: Steps are grouped into 4-beat measures for easy rhythm reading and timing.

Track Controls: Individual volume, mute (M), and solo (S) controls for every drum channel, plus global BPM and Swing adjustments.

🌊 Wave Manipulation & Synthesis

Oscillator Selection: Switch between Sine, Triangle, Sawtooth, and Square waveforms with visual wave icons.

Pitch & Detune: Fine-tune oscillator pitch and thicken sounds using the Detune control.

ADSR Envelope: Shape how a sound starts, sustains, and fades out with visual Attack, Decay, Sustain, and Release controls.

🎚️ Real-Time Audio Effects Rack

Every effect module features intuitive rotary knobs, live value readouts, and an individual Bypass (On/Off) toggle so learners can hear the exact impact of each processor:

Filter & Resonance: Low-pass/high-pass frequency sculpting with adjustable resonance peaks.

Drive: Add warm saturation or gritty harmonic distortion.

Compression & Sidechain: Control dynamic range and create rhythmic "pumping" effects linked to the kick drum.

Noise Gate: Automatically cut background hiss or tail noise below a set threshold.

Modulation: Add movement using LFO-driven pitch or filter modulation.

Delay, Echo & Reverb: Place sounds in virtual spaces ranging from tight slapback echoes to lush, ambient halls.

🎓 Built for Learning

Real-Time Oscilloscope: Watch the audio wave change shape live as you turn knobs.

"Learn Mode" Tooltips: Hover over any knob or switch to see a beginner-friendly explanation of what it does and how it affects the audio.

Factory Presets: Load pre-configured drum patterns and synth patches from data.js to explore how classic sounds are built.

📁 Project Structure

wavecraft-audio-app/
├── index.html          # Main application layout, sequencer grid, and control panels
├── style.css           # High-contrast, color-coded modular UI styling and knob animations
├── script.js           # Web Audio API engine, sequencer clock, and UI event listeners
├── data.js             # Preset synth patches, default drum patterns, and educational tooltips
├── README.md           # Project documentation
└── assets/
    └── samples/        # High-quality .wav drum and instrument samples
        ├── kick.wav
        ├── snare.wav
        ├── hihat-closed.wav
        ├── hihat-open.wav
        ├── clap.wav
        ├── tom.wav
        └── synth-base.wav


🚀 Getting Started

Because modern web browsers restrict loading local .wav files directly over the file:// protocol due to CORS security policies, you will need to run the app through a local development server.

Prerequisites

A modern web browser (Chrome, Firefox, Edge, or Safari)

GitHub Desktop (for cloning and managing the repository)

A simple local server (e.g., VS Code Live Server extension, Python, or Node http-server)

Installation & Setup

Clone the repository using GitHub Desktop or via terminal:

git clone https://github.com/your-username/wavecraft-audio-app.git


Navigate to the project folder:

cd wavecraft-audio-app


Add your .wav samples:
Ensure all required .wav audio files are placed inside the assets/samples/ directory and match the filenames referenced in data.js.

Launch the app:

If using VS Code, right-click index.html and select "Open with Live Server".

Or run a quick Python server in your terminal:

python -m http.server 8000


Then open http://localhost:8000 in your browser.

🗺️ Roadmap

[x] Core project structure (index.html, style.css, script.js, data.js)

[ ] Web Audio API synthesizer & .wav sample loader

[ ] 16-step sequencer clock and UI grid

[ ] Interactive rotary knobs with drag-to-adjust and scroll-wheel support

[ ] Complete effects chain (Filter, Drive, Compression, Sidechain, Noise Gate, Delay, Reverb)

[ ] HTML5 Canvas real-time oscilloscope visualizer

[ ] Beginner "Learn Mode" tooltips & preset library

[ ] Export loop to .wav feature

🤝 Contributing

Contributions, ideas, and beginner-friendly UI suggestions are welcome! Feel free to open an issue or submit a pull request via GitHub Desktop.

📄 License

This project is open-source and available under the MIT License.
