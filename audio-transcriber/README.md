# Audio Transcriber

A small Windows desktop tool that records whatever is playing on your speakers (system audio loopback) and transcribes it to a text file in real time — no microphone, no API key, fully offline.

## Requirements

- **Windows 10 or 11**
- **Python 3.10+** (3.11 recommended)
- A working default audio output device (speakers or headphones)

## Setup

```bash
# 1. Clone / copy this folder, then navigate into it
cd audio-transcriber

# 2. Create and activate a virtual environment (recommended)
python -m venv .venv
.venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt
```

The first time you press **Start**, `faster-whisper` will download the Whisper `base` model (~150 MB) and cache it at `%USERPROFILE%\.cache\huggingface\hub`. Subsequent runs load it instantly from cache.

## Usage

```bash
python main.py
```

1. Press **Start** — the app begins recording system audio immediately.  
2. Play any video, music, podcast, or call on your PC.  
3. Transcribed text appears in `transcripts/transcript_YYYY-MM-DD_HH-MM-SS.txt`, one timestamped line per audio chunk (~5 seconds).  
4. Press **Stop** to finish. The file is flushed and closed cleanly.  
   Press **Start** again to begin a new file.

## Project layout

```
audio-transcriber/
├── main.py            # Entry point — wires everything together
├── audio_capture.py   # WASAPI loopback capture (PyAudioWPatch)
├── transcriber.py     # faster-whisper inference loop
├── gui.py             # Tkinter window
├── requirements.txt
└── README.md
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| *"No WASAPI loopback device found"* | Make sure your audio driver supports WASAPI (most modern Windows drivers do). Check Sound → Playback and verify the default device is active. |
| *"Model load failed"* | Check your internet connection on first run. Firewall or proxy may block HuggingFace Hub downloads. |
| Silent chunks skipped / no output | The app ignores silence. Start some audio before pressing Start, or check that volume is not muted. |
| App freezes on Start | If the model download is taking a long time, the status line shows "Loading model…" — wait for it to complete. |

## Notes

- Model quality can be improved at the cost of speed by changing `MODEL_SIZE = "base"` in `transcriber.py` to `"small"`, `"medium"`, or `"large"`.
- Transcription runs on CPU by default. If you have an NVIDIA GPU, change `device="cpu"` → `device="cuda"` and `compute_type="int8"` → `compute_type="float16"` in `transcriber.py` for a significant speed boost.
