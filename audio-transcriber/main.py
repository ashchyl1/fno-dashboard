"""
main.py — Entry point.  Wires together AudioCapture, Transcriber, and MainWindow.
"""

import queue
import tkinter as tk

from audio_capture import AudioCapture
from transcriber import Transcriber
from gui import MainWindow, AppState


class Controller:
    """
    Owns the AudioCapture and Transcriber instances and manages their lifecycle.
    The GUI calls on_start / on_stop; this class starts/stops the workers.
    """

    def __init__(self):
        self._chunk_queue: queue.Queue | None = None
        self._capture: AudioCapture | None = None
        self._transcriber: Transcriber | None = None
        self._window: MainWindow | None = None

    def bind_window(self, window: MainWindow):
        self._window = window

    def on_start(self, state: AppState):
        """Called from the GUI thread when the user presses Start."""
        self._chunk_queue = queue.Queue(maxsize=64)

        def on_error(msg: str):
            state.error = msg
            state.status = AppState.IDLE

        def on_status(msg: str):
            # Map transcriber status strings to AppState values
            if msg == "Recording…":
                state.status = AppState.RECORDING
            # Other statuses (e.g. "Loading model…") are transient — ignore

        self._capture = AudioCapture(
            chunk_queue=self._chunk_queue,
            on_error=on_error,
        )
        self._transcriber = Transcriber(
            chunk_queue=self._chunk_queue,
            on_status=on_status,
            on_error=on_error,
        )

        try:
            self._capture.start()
        except RuntimeError:
            # Error already surfaced via on_error callback
            return

        sample_rate = self._capture.sample_rate
        self._transcriber.start(sample_rate=sample_rate)

        if self._window and self._transcriber.output_path:
            self._window.root.after(
                0,
                lambda: self._window.set_output_file(
                    str(self._transcriber.output_path)
                ),
            )

    def on_stop(self):
        """Called from a worker thread (not the GUI thread) when the user presses Stop."""
        if self._capture:
            self._capture.stop()
            self._capture = None
        if self._transcriber:
            self._transcriber.stop()
            self._transcriber = None


def main():
    root = tk.Tk()
    controller = Controller()
    window = MainWindow(
        root,
        on_start=controller.on_start,
        on_stop=controller.on_stop,
    )
    controller.bind_window(window)

    # Clean shutdown when the window is closed
    def on_close():
        if window.state.status == AppState.RECORDING:
            controller.on_stop()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
