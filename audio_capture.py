"""
audio_capture.py - Capture engine for WASAPI loopback recording.
Handles device enumeration, format detection, audio capture, and file writing.
"""

import threading
import queue
import time
import wave
import struct
import io
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional, Tuple
import numpy as np

try:
    import pyaudiowpatch as pyaudio
except ImportError:
    import pyaudio

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False

try:
    import lameenc
    HAS_LAMEENC = True
except ImportError:
    HAS_LAMEENC = False


CHUNK_FRAMES = 1024
SILENCE_THRESHOLD_DB = -50.0  # dBFS below which we consider it silence


def rms_to_db(rms: float) -> float:
    if rms < 1e-10:
        return -100.0
    import math
    return 20.0 * math.log10(rms)


def float32_to_int16(data: np.ndarray) -> np.ndarray:
    """Convert float32 [-1,1] to int16 with clipping protection."""
    clipped = np.clip(data, -1.0, 1.0)
    return (clipped * 32767).astype(np.int16)


class DeviceInfo:
    def __init__(self, index: int, name: str, is_loopback: bool,
                 host_api: int, sample_rate: float, channels: int):
        self.index = index
        self.name = name
        self.is_loopback = is_loopback
        self.host_api = host_api
        self.sample_rate = sample_rate
        self.channels = channels

    def __str__(self):
        tag = " [Loopback]" if self.is_loopback else ""
        return f"{self.name}{tag}"


def enumerate_loopback_devices() -> Tuple[list, int]:
    """
    Returns (list of DeviceInfo for loopback devices, index of default device in list).
    Falls back to regular input devices if no WASAPI loopback found.
    """
    pa = pyaudio.PyAudio()
    devices = []
    default_idx = 0

    try:
        wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
        default_output_idx = wasapi_info.get("defaultOutputDevice", -1)

        device_count = pa.get_device_count()
        for i in range(device_count):
            try:
                info = pa.get_device_info_by_index(i)
                if info.get("hostApi") != wasapi_info["index"]:
                    continue
                # loopback devices have maxInputChannels > 0 and are marked loopback
                is_loopback = info.get("isLoopbackDevice", False)
                if not is_loopback:
                    continue

                dev = DeviceInfo(
                    index=i,
                    name=info["name"],
                    is_loopback=True,
                    host_api=info["hostApi"],
                    sample_rate=info["defaultSampleRate"],
                    channels=max(1, info.get("maxInputChannels", 2)),
                )
                # find the loopback that corresponds to the default output
                if info.get("loopbackDeviceOriginalIndex", -1) == default_output_idx:
                    default_idx = len(devices)
                devices.append(dev)
            except Exception:
                continue
    except Exception:
        pass

    pa.terminate()

    if not devices:
        # Fallback: try to find any input device
        pa = pyaudio.PyAudio()
        try:
            for i in range(pa.get_device_count()):
                try:
                    info = pa.get_device_info_by_index(i)
                    if info.get("maxInputChannels", 0) > 0:
                        dev = DeviceInfo(
                            index=i,
                            name=info["name"] + " (input fallback)",
                            is_loopback=False,
                            host_api=info["hostApi"],
                            sample_rate=info["defaultSampleRate"],
                            channels=info.get("maxInputChannels", 2),
                        )
                        devices.append(dev)
                except Exception:
                    continue
        finally:
            pa.terminate()

    return devices, default_idx


class WavWriter:
    """Incremental WAV writer using wave module."""

    def __init__(self, path: str, channels: int, sample_rate: int):
        self.path = path
        self._file = wave.open(path, "wb")
        self._file.setnchannels(channels)
        self._file.setsampwidth(2)  # 16-bit
        self._file.setframerate(sample_rate)

    def write(self, float_data: np.ndarray):
        int_data = float32_to_int16(float_data)
        self._file.writeframes(int_data.tobytes())

    def close(self):
        self._file.close()


class Mp3Writer:
    """Incremental MP3 writer using lameenc."""

    def __init__(self, path: str, channels: int, sample_rate: int, bitrate: int = 192):
        if not HAS_LAMEENC:
            raise RuntimeError("lameenc is not installed. Cannot write MP3.")
        self.path = path
        self._fh = open(path, "wb")
        self._encoder = lameenc.Encoder()
        self._encoder.set_bit_rate(bitrate)
        self._encoder.set_in_sample_rate(sample_rate)
        self._encoder.set_channels(channels)
        self._encoder.set_quality(2)  # 2 = high quality

    def write(self, float_data: np.ndarray):
        int_data = float32_to_int16(float_data)
        mp3_bytes = self._encoder.encode(int_data.tobytes())
        if mp3_bytes:
            self._fh.write(mp3_bytes)

    def close(self):
        # Flush remaining MP3 frames
        tail = self._encoder.flush()
        if tail:
            self._fh.write(tail)
        self._fh.close()


class AudioCapture:
    """
    Core capture engine. Runs a background thread that reads from WASAPI loopback
    and pushes frames into a queue. A writer thread drains the queue to disk.
    """

    def __init__(self,
                 on_level: Optional[Callable[[float], None]] = None,
                 on_error: Optional[Callable[[str], None]] = None,
                 on_stopped: Optional[Callable[[str], None]] = None):
        self.on_level = on_level      # callback(rms 0..1)
        self.on_error = on_error      # callback(message)
        self.on_stopped = on_stopped  # callback(saved_path)

        self._state = "idle"  # idle | recording | paused | stopping
        self._lock = threading.Lock()
        self._queue: queue.Queue = queue.Queue(maxsize=500)
        self._capture_thread: Optional[threading.Thread] = None
        self._writer_thread: Optional[threading.Thread] = None
        self._writer = None
        self._output_path = ""

        self._pa: Optional[pyaudio.PyAudio] = None
        self._stream = None

        # Auto-stop silence detection
        self.silence_auto_stop = False
        self.silence_threshold_db = -50.0
        self.silence_duration_sec = 10.0
        self._silence_since: Optional[float] = None

        # Stats
        self.start_time: Optional[float] = None
        self.pause_offset: float = 0.0
        self._pause_start: Optional[float] = None

    @property
    def state(self) -> str:
        return self._state

    def elapsed_seconds(self) -> float:
        if self.start_time is None:
            return 0.0
        if self._state == "paused" and self._pause_start:
            return self._pause_start - self.start_time - self.pause_offset
        return time.time() - self.start_time - self.pause_offset

    def start(self, device: DeviceInfo, output_dir: str, fmt: str = "wav"):
        with self._lock:
            if self._state not in ("idle",):
                return

        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        ext = fmt.lower()
        filename = f"recording_{ts}.{ext}"
        self._output_path = str(Path(output_dir) / filename)

        try:
            self._pa = pyaudio.PyAudio()
            dev_info = self._pa.get_device_info_by_index(device.index)
            sample_rate = int(dev_info.get("defaultSampleRate", 48000))
            channels = max(1, dev_info.get("maxInputChannels", 2))

            if fmt == "mp3":
                self._writer = Mp3Writer(self._output_path, channels, sample_rate)
            else:
                self._writer = WavWriter(self._output_path, channels, sample_rate)

            self._stream = self._pa.open(
                format=pyaudio.paFloat32,
                channels=channels,
                rate=sample_rate,
                input=True,
                input_device_index=device.index,
                frames_per_buffer=CHUNK_FRAMES,
                stream_callback=self._audio_callback,
            )
        except Exception as e:
            self._cleanup_pa()
            if self.on_error:
                self.on_error(f"Failed to open device: {e}")
            return

        self._state = "recording"
        self.start_time = time.time()
        self.pause_offset = 0.0
        self._pause_start = None
        self._silence_since = None

        self._writer_thread = threading.Thread(target=self._writer_loop, daemon=True)
        self._writer_thread.start()
        self._stream.start_stream()

    def _audio_callback(self, in_data, frame_count, time_info, status_flags):
        """Called by PyAudio on capture thread."""
        if self._state == "paused":
            return (None, pyaudio.paContinue)
        if self._state != "recording":
            return (None, pyaudio.paComplete)

        data = np.frombuffer(in_data, dtype=np.float32).copy()
        try:
            self._queue.put_nowait(data)
        except queue.Full:
            pass  # drop frame rather than block

        # Level metering
        if self.on_level and len(data) > 0:
            rms = float(np.sqrt(np.mean(data ** 2)))
            self.on_level(rms)

        # Silence detection
        if self.silence_auto_stop:
            db = rms_to_db(float(np.sqrt(np.mean(data ** 2))))
            if db < self.silence_threshold_db:
                if self._silence_since is None:
                    self._silence_since = time.time()
                elif time.time() - self._silence_since >= self.silence_duration_sec:
                    self._state = "stopping"
                    return (None, pyaudio.paComplete)
            else:
                self._silence_since = None

        return (None, pyaudio.paContinue)

    def _writer_loop(self):
        """Drain queue and write to disk."""
        try:
            while True:
                try:
                    chunk = self._queue.get(timeout=0.2)
                    if chunk is None:
                        break
                    if self._state != "paused":
                        self._writer.write(chunk)
                except queue.Empty:
                    if self._state == "stopping":
                        break
        except Exception as e:
            if self.on_error:
                self.on_error(f"Write error: {e}")
        finally:
            try:
                self._writer.close()
            except Exception:
                pass
            path = self._output_path
            self._state = "idle"
            if self.on_stopped:
                self.on_stopped(path)

    def stop(self):
        with self._lock:
            if self._state not in ("recording", "paused"):
                return
            self._state = "stopping"

        self._shutdown_stream()
        # Signal writer to finish
        try:
            self._queue.put(None, timeout=1.0)
        except queue.Full:
            pass

    def pause(self):
        with self._lock:
            if self._state != "recording":
                return
            self._state = "paused"
            self._pause_start = time.time()

    def resume(self):
        with self._lock:
            if self._state != "paused":
                return
            if self._pause_start:
                self.pause_offset += time.time() - self._pause_start
                self._pause_start = None
            self._state = "recording"

    def _shutdown_stream(self):
        if self._stream:
            try:
                if self._stream.is_active():
                    self._stream.stop_stream()
                self._stream.close()
            except Exception:
                pass
            self._stream = None

    def _cleanup_pa(self):
        self._shutdown_stream()
        if self._pa:
            try:
                self._pa.terminate()
            except Exception:
                pass
            self._pa = None
