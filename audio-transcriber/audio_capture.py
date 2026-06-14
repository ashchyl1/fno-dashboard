"""
audio_capture.py — WASAPI loopback audio capture using PyAudioWPatch.

Records whatever is playing on the default output device (speakers/headphones),
NOT the microphone. Uses WASAPI loopback mode which is Windows-only.
"""

import threading
import queue
import time
import numpy as np

try:
    import pyaudiowpatch as pyaudio
except ImportError as e:
    raise ImportError(
        "PyAudioWPatch is required. Install it with: pip install PyAudioWPatch"
    ) from e


CHUNK_DURATION_SEC = 5       # seconds of audio per transcription chunk
SILENCE_THRESHOLD = 0.001    # RMS below this is treated as silence


def find_loopback_device(p: pyaudio.PyAudio) -> dict:
    """
    Locate the WASAPI loopback device that mirrors the default output (speakers).

    PyAudioWPatch exposes loopback devices as separate entries with
    is_loopback=True and a name that matches the real output device.
    We first find the default output device, then look for its loopback twin.
    """
    try:
        # Get the default output (render) device info via the WASAPI host API
        wasapi_info = p.get_host_api_info_by_type(pyaudio.paWASAPI)
        default_output_idx = wasapi_info["defaultOutputDevice"]
        default_output = p.get_device_info_by_index(default_output_idx)
    except Exception as exc:
        raise RuntimeError(
            f"Could not retrieve default WASAPI output device: {exc}"
        ) from exc

    # Iterate all devices and find the loopback counterpart
    for i in range(p.get_device_count()):
        dev = p.get_device_info_by_index(i)
        # Loopback devices have maxInputChannels > 0 and share the output name
        if (
            dev.get("isLoopbackDevice", False)
            and default_output["name"] in dev["name"]
        ):
            return dev

    raise RuntimeError(
        f"No WASAPI loopback device found for output '{default_output['name']}'. "
        "Make sure your audio driver supports WASAPI loopback."
    )


class AudioCapture:
    """
    Captures system audio via WASAPI loopback and pushes fixed-duration
    float32 numpy arrays into `chunk_queue` for the transcriber to consume.
    """

    def __init__(self, chunk_queue: queue.Queue, on_error=None):
        self.chunk_queue = chunk_queue
        self.on_error = on_error  # callable(str) to surface errors to the GUI

        self._p: pyaudio.PyAudio | None = None
        self._stream = None
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        self.sample_rate: int = 0
        self.channels: int = 0
        self._device_info: dict = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self):
        """Open the loopback stream and begin capturing on a background thread."""
        self._stop_event.clear()
        self._p = pyaudio.PyAudio()

        try:
            self._device_info = find_loopback_device(self._p)
        except RuntimeError as exc:
            self._cleanup_pyaudio()
            if self.on_error:
                self.on_error(str(exc))
            raise

        self.sample_rate = int(self._device_info["defaultSampleRate"])
        self.channels = min(int(self._device_info["maxInputChannels"]), 2)

        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()

    def stop(self):
        """Signal the capture loop to stop and wait for it to finish."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)
        self._cleanup_pyaudio()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _capture_loop(self):
        frames_per_chunk = int(self.sample_rate * CHUNK_DURATION_SEC)
        # PyAudio callback buffer size (smaller = lower latency for the callback)
        frames_per_buffer = 1024

        accumulated: list[np.ndarray] = []
        accumulated_frames = 0

        def callback(in_data, frame_count, time_info, status):
            if self._stop_event.is_set():
                return (None, pyaudio.paComplete)

            # Convert raw bytes → float32 numpy array
            audio = np.frombuffer(in_data, dtype=np.float32)
            accumulated.append(audio)
            nonlocal accumulated_frames
            accumulated_frames += frame_count

            if accumulated_frames >= frames_per_chunk:
                chunk = np.concatenate(accumulated)
                accumulated.clear()
                accumulated_frames = 0

                # Convert stereo → mono by averaging channels
                if self.channels > 1:
                    chunk = chunk.reshape(-1, self.channels).mean(axis=1)

                # Skip completely silent chunks (no audio playing)
                rms = float(np.sqrt(np.mean(chunk ** 2)))
                if rms >= SILENCE_THRESHOLD:
                    self.chunk_queue.put(chunk)

            return (None, pyaudio.paContinue)

        try:
            self._stream = self._p.open(
                format=pyaudio.paFloat32,
                channels=self.channels,
                rate=self.sample_rate,
                input=True,
                input_device_index=int(self._device_info["index"]),
                frames_per_buffer=frames_per_buffer,
                stream_callback=callback,
            )
            self._stream.start_stream()

            # Block here until stop() is called
            while not self._stop_event.is_set() and self._stream.is_active():
                time.sleep(0.1)

            # Flush any remaining accumulated audio
            if accumulated:
                chunk = np.concatenate(accumulated)
                if self.channels > 1:
                    chunk = chunk.reshape(-1, self.channels).mean(axis=1)
                rms = float(np.sqrt(np.mean(chunk ** 2)))
                if rms >= SILENCE_THRESHOLD:
                    self.chunk_queue.put(chunk)

        except Exception as exc:
            if self.on_error:
                self.on_error(f"Audio capture error: {exc}")
        finally:
            if self._stream:
                try:
                    self._stream.stop_stream()
                    self._stream.close()
                except Exception:
                    pass
            # Signal the transcriber queue that no more audio is coming
            self.chunk_queue.put(None)

    def _cleanup_pyaudio(self):
        if self._p:
            try:
                self._p.terminate()
            except Exception:
                pass
            self._p = None
