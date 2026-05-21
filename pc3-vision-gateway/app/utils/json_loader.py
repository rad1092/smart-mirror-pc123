from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any


logger = logging.getLogger(__name__)


def load_json_file(path: str | Path | None, default: dict[str, Any]) -> dict[str, Any]:
    if path is None:
        return default
    resolved = Path(path)
    try:
        with resolved.open("r", encoding="utf-8") as file:
            loaded = json.load(file)
        if isinstance(loaded, dict):
            return loaded
        logger.warning("JSON config is not an object: %s", resolved)
    except FileNotFoundError:
        logger.warning("JSON config not found: %s. Using defaults.", resolved)
    except json.JSONDecodeError:
        logger.exception("JSON config parse failed: %s. Using defaults.", resolved)
    return default
