"""Export a Torch policy checkpoint to a browser-runnable JSON artifact."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .candidate_policy import ACTION_FEATURE_SIZE, RICH_ACTION_FEATURE_SIZE
from .policy import browser_export_payload, load_checkpoint


def _tensor_list(state: dict, key: str):
    return state[key].detach().cpu().tolist()


def _candidate_browser_export_payload(checkpoint: dict) -> dict:
    state = checkpoint["state_dict"]
    metadata = checkpoint.get("metadata", {})
    model_type = str(checkpoint.get("model_type") or metadata.get("model_type") or "dot")
    feature_mode = str(checkpoint.get("feature_mode") or metadata.get("feature_mode") or "static")
    action_feature_size = int(
        checkpoint.get("action_feature_size")
        or metadata.get("action_feature_size")
        or (RICH_ACTION_FEATURE_SIZE if feature_mode == "rich" else ACTION_FEATURE_SIZE)
    )
    hidden_size = int(checkpoint.get("hidden_size") or metadata.get("hidden_size") or len(state["obs.bias"]))

    if model_type == "interaction":
        weights = {
            "obsWeight": _tensor_list(state, "obs.weight"),
            "obsBias": _tensor_list(state, "obs.bias"),
            "actionWeight": _tensor_list(state, "action.weight"),
            "actionBias": _tensor_list(state, "action.bias"),
            "jointWeight": _tensor_list(state, "joint.weight"),
            "jointBias": _tensor_list(state, "joint.bias"),
            "outputWeight": _tensor_list(state, "output.weight")[0],
            "outputBias": _tensor_list(state, "output.bias")[0],
        }
    elif model_type == "dot":
        weights = {
            "obsWeight": _tensor_list(state, "obs.weight"),
            "obsBias": _tensor_list(state, "obs.bias"),
            "actionWeight": _tensor_list(state, "action.weight"),
            "actionBias": _tensor_list(state, "action.bias"),
            "actionBiasWeight": _tensor_list(state, "action_bias.weight")[0],
            "actionBiasBias": _tensor_list(state, "action_bias.bias")[0],
        }
    else:
        raise ValueError(f"unsupported candidate model type for browser export: {model_type}")

    return {
        "format": "kingdomino-browser-policy-v2",
        "backend": metadata.get("backend", "torch-candidate-policy-v0"),
        "policy": {
            "type": "candidate_policy_v0",
            "modelType": model_type,
            "featureMode": feature_mode,
            "obsSize": int(metadata.get("obs_size") or 695),
            "hiddenSize": hidden_size,
            "actionFeatureSize": action_feature_size,
            "actionCount": 5413,
            "obsScale": 50.0,
            "observationVersion": int(metadata.get("observation_version") or 2),
            "activation": "tanh",
            "weights": weights,
        },
        "metadata": metadata,
    }


def export_policy(policy_path: Path, output_path: Path) -> dict:
    raw = torch.load(policy_path, map_location="cpu")
    if raw.get("format") == "kingdomino-candidate-policy-v0":
        payload = _candidate_browser_export_payload(raw)
    else:
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
