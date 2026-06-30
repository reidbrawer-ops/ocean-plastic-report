"""Load and query the source registry (config/sources.yaml)."""
from __future__ import annotations

from pathlib import Path
from typing import Dict

import yaml


class SourceRegistry:
    def __init__(self, data: Dict[str, dict]):
        self._sources = data

    @classmethod
    def load(cls, path: str | Path) -> "SourceRegistry":
        with open(path, "r", encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        return cls(doc.get("sources", {}))

    def get(self, key: str) -> dict:
        if key not in self._sources:
            raise KeyError(
                f"Unknown source '{key}'. Add it to config/sources.yaml so its license "
                f"and commercial_ok flag are recorded — untracked data cannot be used."
            )
        return self._sources[key]

    def license_of(self, key: str) -> str:
        return self.get(key).get("license", "unresolved")

    def commercial_ok(self, key: str) -> bool:
        return bool(self.get(key).get("commercial_ok", False))

    def all(self) -> Dict[str, dict]:
        return dict(self._sources)

    def quarantined(self) -> Dict[str, dict]:
        return {k: v for k, v in self._sources.items() if not v.get("commercial_ok", False)}
