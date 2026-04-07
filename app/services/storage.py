from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path

from app.config import settings


class StorageService:
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or settings.archive_root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _safe_name(self, value: str) -> str:
        cleaned = re.sub(r"[^\w\-.]+", "_", value, flags=re.UNICODE).strip("_")
        return cleaned[:120] or "media"

    def build_path(self, platform: str, filename: str) -> Path:
        now = datetime.utcnow()
        folder = self.root / self._safe_name(platform) / f"{now:%Y}" / f"{now:%m}" / f"{now:%d}"
        folder.mkdir(parents=True, exist_ok=True)
        return folder / self._safe_name(filename)

    def save_bytes(self, path: Path, content: bytes) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path


storage_service = StorageService()
