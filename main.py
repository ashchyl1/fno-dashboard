"""
main.py - GUI for the WASAPI loopback audio recorder.
Uses customtkinter (falls back to tkinter).
"""

import threading
import time
import os
from pathlib import Path
from typing import Optional

try:
    import customtkinter as ctk
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("blue")
    USE_CTK = True
except ImportError:
    import tkinter as ctk
    USE_CTK = False

import tkinter as tk
from tkinter import filedialog, messagebox

from audio_capture import AudioCapture, enumerate_loopback_devices, DeviceInfo

# Default recordings folder next to this script
DEFAULT_OUTPUT_DIR = str(Path(__file__).parent / "Recordings")


def make_frame(parent, **kw):
    return ctk.CTkFrame(parent, **kw) if USE_CTK else tk.Frame(parent, **kw)

def make_label(parent, text="", **kw):
    return ctk.CTkLabel(parent, text=text, **kw) if USE_CTK else tk.Label(parent, text=text, **kw)

def make_button(parent, text="", command=None, **kw):
    return ctk.CTkButton(parent, text=text, command=command, **kw) if USE_CTK else tk.Button(parent, text=text, command=command, **kw)

def make_option_menu(parent, variable, values, **kw):
    return ctk.CTkOptionMenu(parent, variable=variable, values=values, **kw) if USE_CTK else tk.OptionMenu(parent, variable, *values, **kw)

def make_entry(parent, **kw):
    return ctk.CTkEntry(parent, **kw) if USE_CTK else tk.Entry(parent, **kw)

def make_checkbox(parent, text="", variable=None, **kw):
    return ctk.CTkCheckBox(parent, text=text, variable=variable, **kw) if USE_CTK else tk.Checkbutton(parent, text=text, variable=variable, **kw)


class VUMeter(tk.Canvas):
    """Simple horizontal VU meter drawn on a Canvas."""
    BAR_COLOR_LOW = "#00cc44"
    BAR_COLOR_MED = "#ffaa00"
    BAR_COLOR_HIGH = "#ff3333"

    def __init__(self, parent, width=300, height=20, **kw):
        bg = "#2b2b2b" if USE_CTK else "black"
        super().__init__(parent, width=width, height=height, bg=bg,
                         highlightthickness=0, **kw)
        self._width = width
        self._height = height
        self._level = 0.0

    def set_level(self, rms: float):
        # rms is 0..1 (float32 amplitude)
        import math
        # Map to 0..1 log scale
        db = 20 * math.log10(max(rms, 1e-10))
        normalized = max(0.0, min(1.0, (db + 60) / 60))  # -60dB..0dB -> 0..1
        self._level = normalized
        self._redraw()

    def reset(self):
        self._level = 0.0
        self._redraw()

    def _redraw(self):
        self.delete("all")
        w = int(self._width * self._level)
        if w <= 0:
            return
        # Color based on level
        if self._level < 0.6:
            color = self.BAR_COLOR_LOW
        elif self._level < 0.85:
            color = self.BAR_COLOR_MED
        else:
            color = self.BAR_COLOR_HIGH
        self.create_rectangle(0, 0, w, self._height, fill=color, outline="")


class RecorderApp:
    def __init__(self, root):
        self.root = root
        self.root.title("System Audio Recorder")
        if USE_CTK:
            self.root.geometry("600x500")
        else:
            self.root.geometry("600x520")
            self.root.configure(bg="#2b2b2b")

        self._devices: list = []
        self._default_device_idx = 0
        self._selected_device: Optional[DeviceInfo] = None

        self._capture = AudioCapture(
            on_level=self._on_level,
            on_error=self._on_error,
            on_stopped=self._on_stopped,
        )

        self._timer_running = False
        self._level_value = 0.0

        self._build_ui()
        self._refresh_devices()
        self._ensure_output_dir()
        self._update_button_states()
        self._start_clock()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------
    def _build_ui(self):
        pad = {"padx": 10, "pady": 6}

        # Device row
        dev_row = make_frame(self.root)
        dev_row.pack(fill="x", **pad)
        make_label(dev_row, text="Output Device:").pack(side="left")
        self._device_var = tk.StringVar(value="(loading…)")
        self._device_menu = make_option_menu(dev_row, self._device_var, ["(loading…)"],
                                              command=self._on_device_change)
        self._device_menu.pack(side="left", fill="x", expand=True, padx=(8, 0))

        btn_refresh = make_button(dev_row, text="⟳", command=self._refresh_devices, width=36)
        btn_refresh.pack(side="left", padx=(4, 0))

        # Format row
        fmt_row = make_frame(self.root)
        fmt_row.pack(fill="x", **pad)
        make_label(fmt_row, text="Format:").pack(side="left")
        self._fmt_var = tk.StringVar(value="WAV")
        fmt_menu = make_option_menu(fmt_row, self._fmt_var, ["WAV", "MP3"])
        fmt_menu.pack(side="left", padx=(8, 0))

        # Output folder row
        folder_row = make_frame(self.root)
        folder_row.pack(fill="x", **pad)
        make_label(folder_row, text="Save to:").pack(side="left")
        self._folder_var = tk.StringVar(value=DEFAULT_OUTPUT_DIR)
        folder_entry = make_entry(folder_row, textvariable=self._folder_var, width=350)
        folder_entry.pack(side="left", fill="x", expand=True, padx=(8, 0))
        browse_btn = make_button(folder_row, text="Browse…", command=self._browse_folder)
        browse_btn.pack(side="left", padx=(4, 0))

        # Silence auto-stop row
        silence_row = make_frame(self.root)
        silence_row.pack(fill="x", **pad)
        self._silence_var = tk.BooleanVar(value=False)
        silence_cb = make_checkbox(silence_row, text="Auto-stop after",
                                    variable=self._silence_var,
                                    command=self._on_silence_toggle)
        silence_cb.pack(side="left")
        self._silence_sec_var = tk.StringVar(value="10")
        self._silence_sec_entry = make_entry(silence_row, textvariable=self._silence_sec_var, width=50)
        self._silence_sec_entry.pack(side="left", padx=(4, 4))
        make_label(silence_row, text="s of silence").pack(side="left")
        self._silence_sec_entry.configure(state="disabled")

        # VU meter
        vu_row = make_frame(self.root)
        vu_row.pack(fill="x", padx=10, pady=(4, 0))
        make_label(vu_row, text="Level:").pack(side="left")
        self._vu = VUMeter(vu_row, width=480, height=18)
        self._vu.pack(side="left", padx=(8, 0))

        # Timer
        timer_row = make_frame(self.root)
        timer_row.pack(fill="x", **pad)
        make_label(timer_row, text="Elapsed:").pack(side="left")
        self._timer_label = make_label(timer_row, text="00:00:00")
        if USE_CTK:
            self._timer_label.configure(font=ctk.CTkFont(family="Courier", size=22, weight="bold"))
        else:
            self._timer_label.configure(font=("Courier", 22, "bold"), fg="#ffffff", bg="#2b2b2b")
        self._timer_label.pack(side="left", padx=(8, 0))

        # Control buttons
        btn_row = make_frame(self.root)
        btn_row.pack(fill="x", **pad)
        self._btn_start = make_button(btn_row, text="▶  Start", command=self._start)
        self._btn_start.pack(side="left", padx=(0, 8))
        self._btn_pause = make_button(btn_row, text="⏸  Pause", command=self._pause_resume)
        self._btn_pause.pack(side="left", padx=(0, 8))
        self._btn_stop = make_button(btn_row, text="⏹  Stop", command=self._stop)
        self._btn_stop.pack(side="left")

        # Status line
        status_frame = make_frame(self.root)
        status_frame.pack(fill="x", **pad)
        self._status_label = make_label(status_frame, text="Status: Idle")
        if not USE_CTK:
            self._status_label.configure(fg="#aaaaaa", bg="#2b2b2b", anchor="w")
        self._status_label.pack(fill="x")

    # ------------------------------------------------------------------
    # Device management
    # ------------------------------------------------------------------
    def _refresh_devices(self):
        self._devices, self._default_device_idx = enumerate_loopback_devices()
        names = [str(d) for d in self._devices] if self._devices else ["No devices found"]
        if USE_CTK:
            self._device_menu.configure(values=names)
        else:
            menu = self._device_menu["menu"]
            menu.delete(0, "end")
            for n in names:
                menu.add_command(label=n, command=lambda v=n: self._device_var.set(v))

        if self._devices:
            self._device_var.set(names[self._default_device_idx])
            self._selected_device = self._devices[self._default_device_idx]
        else:
            self._device_var.set("No devices found")
            self._selected_device = None

    def _on_device_change(self, value):
        for d in self._devices:
            if str(d) == value:
                self._selected_device = d
                break

    # ------------------------------------------------------------------
    # Folder
    # ------------------------------------------------------------------
    def _browse_folder(self):
        folder = filedialog.askdirectory(initialdir=self._folder_var.get())
        if folder:
            self._folder_var.set(folder)

    def _ensure_output_dir(self):
        try:
            Path(DEFAULT_OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Silence toggle
    # ------------------------------------------------------------------
    def _on_silence_toggle(self):
        state = "normal" if self._silence_var.get() else "disabled"
        self._silence_sec_entry.configure(state=state)

    # ------------------------------------------------------------------
    # Capture controls
    # ------------------------------------------------------------------
    def _start(self):
        if self._selected_device is None:
            messagebox.showerror("No Device", "No loopback device found. Make sure audio is set up.")
            return

        out_dir = self._folder_var.get().strip()
        try:
            Path(out_dir).mkdir(parents=True, exist_ok=True)
        except Exception as e:
            messagebox.showerror("Folder Error", f"Cannot create output folder:\n{e}")
            return

        fmt = self._fmt_var.get().lower()

        # Configure silence detection
        self._capture.silence_auto_stop = self._silence_var.get()
        try:
            self._capture.silence_duration_sec = float(self._silence_sec_var.get())
        except ValueError:
            self._capture.silence_duration_sec = 10.0

        self._capture.start(self._selected_device, out_dir, fmt)
        self._set_status("Recording…")
        self._update_button_states()

    def _pause_resume(self):
        if self._capture.state == "recording":
            self._capture.pause()
            self._btn_pause.configure(text="▶  Resume")
            self._set_status("Paused")
        elif self._capture.state == "paused":
            self._capture.resume()
            self._btn_pause.configure(text="⏸  Pause")
            self._set_status("Recording…")
        self._update_button_states()

    def _stop(self):
        self._capture.stop()
        self._set_status("Stopping…")
        self._update_button_states()

    # ------------------------------------------------------------------
    # Callbacks from capture engine (may be on other threads)
    # ------------------------------------------------------------------
    def _on_level(self, rms: float):
        self.root.after(0, lambda: self._vu.set_level(rms))

    def _on_error(self, msg: str):
        self.root.after(0, lambda: self._handle_error(msg))

    def _handle_error(self, msg: str):
        self._set_status(f"Error: {msg}")
        self._vu.reset()
        self._btn_pause.configure(text="⏸  Pause")
        self._update_button_states()
        messagebox.showerror("Recorder Error", msg)

    def _on_stopped(self, path: str):
        self.root.after(0, lambda: self._handle_stopped(path))

    def _handle_stopped(self, path: str):
        self._vu.reset()
        self._btn_pause.configure(text="⏸  Pause")
        short = Path(path).name
        self._set_status(f"Saved → {short}")
        self._update_button_states()

    # ------------------------------------------------------------------
    # Timer
    # ------------------------------------------------------------------
    def _start_clock(self):
        self._tick()

    def _tick(self):
        if self._capture.state in ("recording", "paused"):
            elapsed = int(self._capture.elapsed_seconds())
            h = elapsed // 3600
            m = (elapsed % 3600) // 60
            s = elapsed % 60
            self._timer_label.configure(text=f"{h:02d}:{m:02d}:{s:02d}")
        elif self._capture.state == "idle":
            self._timer_label.configure(text="00:00:00")
        self.root.after(500, self._tick)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _set_status(self, msg: str):
        self._status_label.configure(text=f"Status: {msg}")

    def _update_button_states(self):
        state = self._capture.state
        is_idle = state == "idle"
        is_active = state in ("recording", "paused")

        def cfg(widget, enabled):
            s = "normal" if enabled else "disabled"
            try:
                widget.configure(state=s)
            except Exception:
                pass

        cfg(self._btn_start, is_idle)
        cfg(self._btn_pause, is_active)
        cfg(self._btn_stop, is_active)

    def on_close(self):
        if self._capture.state in ("recording", "paused"):
            if messagebox.askyesno("Quit", "Recording in progress. Stop and save before quitting?"):
                self._capture.stop()
                time.sleep(0.5)  # brief wait for writer to flush
        self.root.destroy()


def main():
    if USE_CTK:
        root = ctk.CTk()
    else:
        root = tk.Tk()

    app = RecorderApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
