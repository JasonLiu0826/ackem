"""Start and monitor GPT-SoVITS api_v2.py subprocess."""

from __future__ import annotations

import logging
import socket
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_API_PORT = 9880


def read_gpt_sovits_home(config_paths: list[Path]) -> Path | None:
    for path in config_paths:
        if path.is_file():
            text = path.read_text(encoding="utf-8").strip()
            if text:
                home = Path(text)
                if home.is_dir():
                    return home.resolve()
    return None


def resolve_gpt_sovits_home(config_paths: list[Path]) -> Path | None:
    """Bundled runtime inside Ackem first, then user config file."""
    voice_svc = Path(__file__).resolve().parent
    bundled = voice_svc / "gpt-sovits-runtime"
    if _is_gpt_sovits_home(bundled):
        return bundled.resolve()
    return read_gpt_sovits_home(config_paths)


def _is_gpt_sovits_home(path: Path) -> bool:
    return (path / "api_v2.py").is_file() and (path / "runtime" / "python.exe").is_file()


def is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


class GptSovitsApiProcess:
    def __init__(
        self,
        home: Path,
        port: int = DEFAULT_API_PORT,
        host: str = "127.0.0.1",
    ):
        self.home = home
        self.port = port
        self.host = host
        self._proc: subprocess.Popen | None = None
        self.base_url = f"http://{host}:{port}"

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def ensure_started(self, timeout_sec: float = 180.0) -> None:
        if is_port_open(self.host, self.port):
            logger.info("GPT-SoVITS API already listening on %s", self.base_url)
            return

        python_exe = self.home / "runtime" / "python.exe"
        api_script = self.home / "api_v2.py"
        if not python_exe.is_file():
            raise RuntimeError(f"GPT-SoVITS python not found: {python_exe}")
        if not api_script.is_file():
            raise RuntimeError(f"GPT-SoVITS api_v2.py not found: {api_script}")

        cmd = [
            str(python_exe),
            "-s",
            str(api_script),
            "-a",
            self.host,
            "-p",
            str(self.port),
        ]
        logger.info("Starting GPT-SoVITS API: %s", " ".join(cmd))
        self._proc = subprocess.Popen(
            cmd,
            cwd=str(self.home),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

        deadline = time.time() + timeout_sec
        while time.time() < deadline:
            if self._proc.poll() is not None:
                raise RuntimeError(
                    f"GPT-SoVITS API exited early with code {self._proc.returncode}"
                )
            if is_port_open(self.host, self.port):
                logger.info("GPT-SoVITS API ready at %s", self.base_url)
                return
            time.sleep(1.0)

        raise RuntimeError(
            f"GPT-SoVITS API did not start within {timeout_sec}s on port {self.port}"
        )

    def stop(self) -> None:
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self._proc = None
