"""
gui.py — Tkinter GUI: a single Start/Stop button with a status line.

The window is intentionally tiny.  All heavy work (audio capture,
transcription) runs on background threads; the GUI thread only polls
a shared state object and updates labels.
"""

import tkinter as tk
from tkinter import messagebox
import queue
import threading
import time
from typing import Callable


class AppState:
    """Minimal shared state — mutated by background threads, read by the GUI poll."""
    IDLE = "Idle"
    STARTING = "Starting…"
    RECORDING = "Recording…"
    STOPPING = "Stopping…"
    STOPPED = "Stopped"

    def __init__(self):
        self._lock = threading.Lock()
        self._status = self.IDLE
        self._error: str | None = None
        self.start_time: float | None = None

    @property
    def status(self) -> str:
        with self._lock:
            return self._status

    @status.setter
    def status(self, value: str):
        with self._lock:
            self._status = value
            if value == self.RECORDING:
                self.start_time = time.time()
            elif value in (self.IDLE, self.STOPPED):
                self.start_time = None

    @property
    def error(self) -> str | None:
        with self._lock:
            return self._error

    @error.setter
    def error(self, value: str | None):
        with self._lock:
            self._error = value

    def elapsed(self) -> str:
        if self.start_time is None:
            return ""
        secs = int(time.time() - self.start_time)
        h, rem = divmod(secs, 3600)
        m, s = divmod(rem, 60)
        if h:
            return f"{h}:{m:02d}:{s:02d}"
        return f"{m:02d}:{s:02d}"


class MainWindow:
    POLL_MS = 250  # GUI refresh interval in milliseconds

    def __init__(
        self,
        root: tk.Tk,
        on_start: Callable[["AppState"], None],
        on_stop: Callable[[], None],
    ):
        self.root = root
        self.on_start = on_start
        self.on_stop = on_stop
        self.state = AppState()

        self._build_ui()
        self._poll()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        self.root.title("Audio Transcriber")
        self.root.geometry("320x130")
        self.root.resizable(False, False)

        # Padding frame
        frame = tk.Frame(self.root, padx=16, pady=12)
        frame.pack(fill=tk.BOTH, expand=True)

        # Toggle button
        self.btn = tk.Button(
            frame,
            text="Start",
            width=12,
            height=2,
            font=("Segoe UI", 11, "bold"),
            bg="#2ecc71",
            fg="white",
            activebackground="#27ae60",
            activeforeground="white",
            relief=tk.FLAT,
            cursor="hand2",
            command=self._on_button,
        )
        self.btn.pack()

        # Status label
        self.lbl_status = tk.Label(
            frame,
            text="Idle",
            font=("Segoe UI", 9),
            fg="#555555",
        )
        self.lbl_status.pack(pady=(8, 0))

        # Output file label
        self.lbl_file = tk.Label(
            frame,
            text="",
            font=("Segoe UI", 8),
            fg="#888888",
            wraplength=290,
        )
        self.lbl_file.pack()

    # ------------------------------------------------------------------
    # Button handler
    # ------------------------------------------------------------------

    def _on_button(self):
        s = self.state.status
        if s in (AppState.IDLE, AppState.STOPPED):
            self._set_button("Stop", "#e74c3c", "#c0392b")
            self.state.status = AppState.STARTING
            self.on_start(self.state)
        elif s == AppState.RECORDING:
            self._set_button("...", "#aaaaaa", "#888888")
            self.btn.config(state=tk.DISABLED)
            self.state.status = AppState.STOPPING
            threading.Thread(target=self._do_stop, daemon=True).start()

    def _do_stop(self):
        self.on_stop()
        # Re-enable the button on the GUI thread
        self.root.after(0, self._on_stop_complete)

    def _on_stop_complete(self):
        self.state.status = AppState.STOPPED
        self._set_button("Start", "#2ecc71", "#27ae60")
        self.btn.config(state=tk.NORMAL)

    def _set_button(self, text: str, bg: str, active_bg: str):
        self.btn.config(text=text, bg=bg, activebackground=active_bg)

    # ------------------------------------------------------------------
    # Poll loop — updates the status line every POLL_MS milliseconds
    # ------------------------------------------------------------------

    def _poll(self):
        status = self.state.status
        elapsed = self.state.elapsed()

        # Surface any error that arrived from a background thread
        err = self.state.error
        if err:
            self.state.error = None
            messagebox.showerror("Error", err, parent=self.root)
            # Reset to idle if we weren't recording
            if status not in (AppState.RECORDING,):
                self.state.status = AppState.IDLE
                self._set_button("Start", "#2ecc71", "#27ae60")
                self.btn.config(state=tk.NORMAL)

        label = status
        if elapsed:
            label = f"{status}  {elapsed}"
        self.lbl_status.config(text=label)

        self.root.after(self.POLL_MS, self._poll)

    # ------------------------------------------------------------------
    # Called by the controller once we know the output file path
    # ------------------------------------------------------------------

    def set_output_file(self, path: str):
        self.lbl_file.config(text=path)
