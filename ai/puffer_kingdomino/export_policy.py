"""Export a Torch policy checkpoint to a browser-runnable JSON artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .policy import browser_export_payload, load_checkpoint


def export_policy(policy_path: Path, output_path: Path) -> dict:
    model, checkpoint = load_checkpoint(policy_path)
    payload = browser_export_payload(model, checkpoint)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload), encoding="utf-8")
    return {
        "policy": str(policy_path),
        "output": str(output_path),
        "backend": payload["backend"],
        "format": payload["format"],
        "bytes": output_path.stat().st_size,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", default="ai/artifacts/latest.pt")
    parser.add_argument("--output", default="ai/artifacts/browser_policy.json")
    args = parser.parse_args()
    print(json.dumps(export_policy(Path(args.policy), Path(args.output)), indent=2))


if __name__ == "__main__":
    main()
