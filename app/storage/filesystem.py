from pathlib import Path
from typing import Iterable


class FileSystemStorage:
    """Simple storage backend writing files to the host filesystem."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def resolve_job_path(self, job_id: str) -> Path:
        """Return the directory where job artifacts are stored."""
        path = self.root / job_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def list_files(self, job_id: str) -> Iterable[Path]:
        """Yield files produced for a job."""
        folder = self.resolve_job_path(job_id)
        return folder.rglob("*")

