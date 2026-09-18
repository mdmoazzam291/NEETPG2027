#!/usr/bin/env python3
"""Generate the static question-bundle manifest from valid PYQ JSON files."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYQ_ROOT = ROOT / "data" / "pyq"
OUTPUT = PYQ_ROOT / "manifest.json"


def is_question_bundle(path: Path) -> bool:
    if path == OUTPUT or path.name.startswith("source_manifest"):
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(data, list) or not data:
        return False
    return all(
        isinstance(item, dict)
        and item.get("external_id")
        and item.get("stem")
        and isinstance(item.get("options"), list)
        and len(item["options"]) >= 2
        for item in data
    )


def main() -> None:
    files = [
        path.relative_to(ROOT).as_posix()
        for path in sorted(PYQ_ROOT.rglob("*.json"))
        if is_question_bundle(path)
    ]
    payload = {"version": 1, "files": files}
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(files)} question bundles")


if __name__ == "__main__":
    main()
