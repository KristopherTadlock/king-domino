"""Shared Torch policy helpers for Kingdomino AI training and export."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

from .core import ACTION_COUNT


OBSERVATION_SIZE = 695
DEFAULT_HIDDEN_SIZE = 64
OBS_SCALE = 50.0


class MaskedMLPPolicy(nn.Module):
    def __init__(self, obs_size: int = OBSERVATION_SIZE, hidden_size: int = DEFAULT_HIDDEN_SIZE, action_count: int = ACTION_COUNT):
        super().__init__()
        self.obs_size = obs_size
        self.hidden_size = hidden_size
        self.action_count = action_count
        self.input = nn.Linear(obs_size, hidden_size)
        self.output = nn.Linear(hidden_size, action_count)

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        hidden = torch.tanh(self.input(obs))
        return self.output(hidden)


def observation_vector(env) -> np.ndarray:
    if hasattr(env, "write_observation_vector"):
        obs = np.empty(OBSERVATION_SIZE, dtype=np.float32)
        env.write_observation_vector(obs, OBS_SCALE)
        return obs
    obs = env.observe()["observation"]
    return np.asarray(obs, dtype=np.float32) / OBS_SCALE


def action_mask(env) -> np.ndarray:
    return np.asarray(env.action_mask(), dtype=np.bool_)


def masked_logits(model: MaskedMLPPolicy, obs: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    logits = model(obs)
    return logits.masked_fill(~mask, -1e9)


@torch.no_grad()
def choose_model_action(model: MaskedMLPPolicy, env, deterministic: bool = True) -> int:
    obs = torch.from_numpy(observation_vector(env)).unsqueeze(0)
    mask = torch.from_numpy(action_mask(env)).unsqueeze(0)
    logits = masked_logits(model, obs, mask)
    if deterministic:
        return int(torch.argmax(logits, dim=-1).item())
    dist = torch.distributions.Categorical(logits=logits)
    return int(dist.sample().item())


def checkpoint_payload(model: MaskedMLPPolicy, metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "format": "kingdomino-torch-policy-v1",
        "backend": metadata.get("backend", "torch-imitation-v0"),
        "obs_size": model.obs_size,
        "hidden_size": model.hidden_size,
        "action_count": model.action_count,
        "obs_scale": OBS_SCALE,
        "state_dict": model.state_dict(),
        "metadata": metadata,
    }


def save_checkpoint(model: MaskedMLPPolicy, path: Path, metadata: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(checkpoint_payload(model, metadata), path)


def load_checkpoint(path: Path, map_location: str = "cpu") -> tuple[MaskedMLPPolicy, dict[str, Any]]:
    payload = torch.load(path, map_location=map_location)
    if payload.get("format") != "kingdomino-torch-policy-v1":
        raise ValueError(f"unsupported policy checkpoint format: {payload.get('format')}")
    model = MaskedMLPPolicy(
        obs_size=int(payload["obs_size"]),
        hidden_size=int(payload["hidden_size"]),
        action_count=int(payload["action_count"]),
    )
    model.load_state_dict(payload["state_dict"])
    model.eval()
    return model, payload


def browser_export_payload(model: MaskedMLPPolicy, checkpoint: dict[str, Any]) -> dict[str, Any]:
    state = model.state_dict()
    return {
        "format": "kingdomino-browser-policy-v1",
        "backend": checkpoint.get("backend", "torch-imitation-v0"),
        "policy": {
            "type": "masked_mlp_v0",
            "obsSize": model.obs_size,
            "hiddenSize": model.hidden_size,
            "actionCount": model.action_count,
            "obsScale": checkpoint.get("obs_scale", OBS_SCALE),
            "activation": "tanh",
            "weights": {
                "inputWeight": state["input.weight"].detach().cpu().tolist(),
                "inputBias": state["input.bias"].detach().cpu().tolist(),
                "outputWeight": state["output.weight"].detach().cpu().tolist(),
                "outputBias": state["output.bias"].detach().cpu().tolist(),
            },
        },
        "metadata": checkpoint.get("metadata", {}),
    }
