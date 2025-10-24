import json
import shlex
import subprocess
import uuid
from pathlib import Path
from typing import Iterable, List, Optional, Tuple
from urllib.parse import urlparse

from app.config import settings
from app.storage import FileSystemStorage


class DownloadResult:
    def __init__(self, output_path: Path, files: List[Path]) -> None:
        self.output_path = output_path
        self.files = files


class DownloadManager:
    """Lightweight wrapper around the gallery-dl CLI."""

    def __init__(self, storage_root: Optional[Path] = None, extra_args: Optional[List[str]] = None) -> None:
        root = storage_root or settings.storage_root
        self.storage = FileSystemStorage(root)
        self.extra_args = (
            extra_args if extra_args is not None else self._parse_extra_args(settings.gallery_dl_extra_args)
        )

    def run(self, download_id: uuid.UUID, urls: Iterable[str], folder_name: Optional[str] = None) -> DownloadResult:
        urls = list(urls)
        if not urls:
            raise ValueError("At least one URL must be provided to DownloadManager.run")

        target_folder_name = folder_name or str(download_id)
        safe_folder = self._sanitize_folder_name(target_folder_name)
        base_folder = self.storage.resolve_job_path(safe_folder)

        domain_folder, resource_folder = self._derive_subfolders(urls[0])
        destination = base_folder
        if domain_folder:
            destination = destination / domain_folder
        if resource_folder:
            destination = destination / resource_folder
        destination.mkdir(parents=True, exist_ok=True)

        command: List[str] = [
            "gallery-dl",
            "--dest",
            str(destination),
        ]

        if settings.gallery_dl_config_path.exists():
            command.extend(["--config", str(settings.gallery_dl_config_path)])

        if self.extra_args:
            command.extend(self.extra_args)

        command.extend(urls)
        # TODO: capture progress and structured metadata once gallery-dl exposes hooks.
        subprocess.run(command, check=True)

        files = list(destination.rglob("*"))
        relevant_files = [path for path in files if path.is_file()]
        return DownloadResult(output_path=destination, files=relevant_files)

    @staticmethod
    def _parse_extra_args(raw: Optional[str]) -> List[str]:
        if not raw:
            return []
        return shlex.split(raw)

    @staticmethod
    def _sanitize_folder_name(name: str) -> str:
        sanitized = name.strip()
        sanitized = sanitized.replace("\\", "_").replace("/", "_")
        sanitized = " ".join(sanitized.split())
        allowed = "".join(char if char.isalnum() or char in ("-", "_", ".", " ") else "_" for char in sanitized)
        condensed = allowed.replace(" ", "_")
        condensed = condensed.strip("_")
        if len(condensed) > 100:
            condensed = condensed[:100].rstrip("_")
        return condensed or "download"

    def _derive_subfolders(self, url: str) -> Tuple[Optional[str], Optional[str]]:
        parsed = urlparse(url)
        hostname = parsed.hostname or "unknown"
        domain_parts = hostname.split(".")
        if len(domain_parts) > 1:
            domain = domain_parts[-2]
        else:
            domain = domain_parts[0]
        domain_folder = self._sanitize_folder_name(domain)

        path_parts = [segment for segment in parsed.path.split("/") if segment]
        resource = path_parts[-1] if path_parts else None
        resource_folder = self._sanitize_folder_name(resource) if resource else None

        return domain_folder, resource_folder


def output_manifest(result: DownloadResult) -> str:
    """Return a JSON representation of downloaded files."""
    payload = {
        "output_path": str(result.output_path),
        "files": [
            {"path": str(path.relative_to(result.output_path)), "size": path.stat().st_size} for path in result.files
        ],
    }
    return json.dumps(payload, indent=2)
