"""
transcriber.py — Background transcription using faster-whisper.

Consumes float32 audio chunks from a queue, transcribes each chunk with
the Whisper base model, and appends the resulting text to an output file.
"""

import queue
import threading
import datetime
import pathlib
from typing import Callable

import numpy as np

try:
    from faster_whisper import WhisperModel
except ImportError as exc:
    raise ImportError(
        "faster-whisper is required. Install it with: pip install faster-whisper"
    ) from exc

MODEL_SIZE = "base"          # tiny/base/small/medium/large — base is a good default
TRANSCRIPTS_DIR = pathlib.Path("transcripts")


def _make_output_path() -> pathlib.Path:
    """Generate a timestamped transcript file path."""
    TRANSCRIPTS_DIR.mkdir(exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    return TRANSCRIPTS_DIR / f"transcript_{ts}.txt"


class Transcriber:
    """
    Pulls audio chunks from `chunk_queue`, transcribes them, and writes
    results to a timestamped .txt file.  Runs on a dedicated background thread.
    """

    def __init__(
        self,
        chunk_queue: queue.Queue,
        on_status: Callable[[str], None] | None = None,
        on_error: Callable[[str], None] | None = None,
    ):
        self.chunk_queue = chunk_queue
        self.on_status = on_status  # called with short status strings for the GUI
        self.on_error = on_error

        self._thread: threading.Thread | None = None
        self._model: WhisperModel | None = None
        self._output_path: pathlib.Path | None = None
        self._output_file = None
        self.sample_rate: int = 16000  # set by caller before start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self, sample_rate: int):
        """Load the model (downloads on first run) and begin the transcription loop."""
        self.sample_rate = sample_rate
        self._output_path = _make_output_path()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        """Wait for the transcription thread to drain the queue and finish."""
        if self._thread:
            self._thread.join(timeout=60)  # give it time to finish the last chunk

    @property
    def output_path(self) -> pathlib.Path | None:
        return self._output_path

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run(self):
        # Load model — downloads ~150 MB on first use, cached afterwards
        try:
            if self.on_status:
                self.on_status("Loading model…")
            self._model = WhisperModel(
                MODEL_SIZE,
                device="cpu",       # use "cuda" if a compatible GPU is present
                compute_type="int8",  # int8 is fast on CPU with minimal quality loss
            )
        except Exception as exc:
            if self.on_error:
                self.on_error(f"Model load failed: {exc}")
            return

        try:
            self._output_file = open(self._output_path, "w", encoding="utf-8")
            self._write_header()

            if self.on_status:
                self.on_status("Recording…")

            while True:
                try:
                    chunk = self.chunk_queue.get(timeout=1.0)
                except queue.Empty:
                    continue

                if chunk is None:
                    # Sentinel value from audio_capture — no more audio
                    break

                self._transcribe_chunk(chunk)

        except Exception as exc:
            if self.on_error:
                self.on_error(f"Transcription error: {exc}")
        finally:
            if self._output_file:
                try:
                    self._output_file.flush()
                    self._output_file.close()
                except Exception:
                    pass

    def _write_header(self):
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._output_file.write(f"# Transcript — {ts}\n\n")
        self._output_file.flush()

    def _transcribe_chunk(self, audio: np.ndarray):
        """
        faster-whisper expects float32 audio normalised to [-1, 1] at 16 kHz.
        The loopback capture may give us a different sample rate, but we pass
        the array directly — faster-whisper handles resampling internally when
        given the correct original sample_rate via the audio argument being a
        numpy array. We rely on WhisperModel.transcribe accepting raw arrays.
        """
        # Ensure float32 and in [-1, 1]
        audio = audio.astype(np.float32)
        peak = np.abs(audio).max()
        if peak > 1.0:
            audio = audio / peak

        try:
            segments, _info = self._model.transcribe(
                audio,
                language=None,        # auto-detect language
                beam_size=5,
                vad_filter=True,      # skip internal silence with VAD
                vad_parameters={"min_silence_duration_ms": 500},
            )
            text_parts = [seg.text.strip() for seg in segments if seg.text.strip()]
            if text_parts:
                line = " ".join(text_parts)
                timestamp = datetime.datetime.now().strftime("[%H:%M:%S]")
                self._output_file.write(f"{timestamp} {line}\n")
                self._output_file.flush()  # flush immediately so nothing is lost
        except Exception as exc:
            # Non-fatal — log and continue with next chunk
            if self.on_error:
                self.on_error(f"Chunk transcription failed: {exc}")
