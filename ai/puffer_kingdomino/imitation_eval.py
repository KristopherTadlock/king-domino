"""Evaluate policy agreement with the native greedy expert on sampled states."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random

import numpy as np
import torch

from .candidate_policy import (
    FactorizedActionPolicy,
    action_part_table,
    factorized_candidate_logits,
)
from .candidate_train import DEFAULT_MAX_CANDIDATES, _write_legal_actions
from .factor_eval import _make_env as _make_factor_env
from .policy import OBSERVATION_SIZE, OBS_SCALE, action_mask, choose_model_action, load_checkpoint
from .train import _advance_opponent, _expert_action, _make_env


def _load_factorized(path: Path):
    payload = torch.load(path, map_location="cpu")
    if payload.get("format") != "kingdomino-factorized-policy-v0":
        raise ValueError(f"unsupported factorized checkpoint format: {payload.get('format')}")
    hidden_size = int(payload.get("metadata", {}).get("hidden_size", 64))
    model = FactorizedActionPolicy(hidden_size=hidden_size)
    model.load_state_dict(payload["state_dict"])
    model.eval()
    return model


@torch.no_grad()
def _factorized_action(model, env, action_parts, legal_buffer, obs_buffer) -> int:
    legal_count = _write_legal_actions(env, legal_buffer)
    if hasattr(env, "write_observation_vector"):
        env.write_observation_vector(obs_buffer, OBS_SCALE)
    else:
        from .policy import observation_vector

        obs_buffer[:] = observation_vector(env)
    obs_tensor = torch.from_numpy(obs_buffer).unsqueeze(0)
    actions = torch.from_numpy(legal_buffer[:legal_count].astype(np.int64, copy=False)).unsqueeze(0)
    logits = factorized_candidate_logits(model(obs_tensor), action_parts[actions])
    index = int(torch.argmax(logits, dim=-1).item())
    return int(legal_buffer[index])


def evaluate_flat(policy_path: Path, states: int, seed: int, opponent: str) -> dict:
    model, checkpoint = load_checkpoint(policy_path)
    rng = random.Random(seed)
    env = _make_env(seed, native=True)
    matches = 0
    sampled = 0
    completed_games = 0
    legal_ranks = []

    while sampled < states:
        if env.done:
            completed_games += 1
            env = _make_env((seed + completed_games) & 0xFFFFFFFF, native=True)
        _advance_opponent(env, rng, opponent)
        if env.done:
            continue
        expert = _expert_action(env, player=0)
        chosen = choose_model_action(model, env, deterministic=True)
        matches += int(chosen == expert)
        mask = action_mask(env)
        legal = np.nonzero(mask)[0]
        if hasattr(env, "heuristic_score"):
            scores = sorted(
                ((float(env.heuristic_score(0, int(action))), int(action)) for action in legal),
                reverse=True,
            )
            legal_ranks.append(next((index + 1 for index, (_score, action) in enumerate(scores) if action == chosen), len(scores)))
        if hasattr(env, "step_known_legal"):
            env.step_known_legal(expert, observe=False)
        else:
            env.step(expert, observe=False)
        sampled += 1

    return {
        "kind": "flat",
        "policy": str(policy_path),
        "backend": checkpoint.get("backend"),
        "states": sampled,
        "seed": seed,
        "opponent": opponent,
        "matches": matches,
        "match_rate": matches / sampled if sampled else 0.0,
        "avg_chosen_greedy_rank": sum(legal_ranks) / len(legal_ranks) if legal_ranks else None,
    }


def evaluate_factorized(policy_path: Path, states: int, seed: int, opponent: str) -> dict:
    model = _load_factorized(policy_path)
    action_parts = torch.from_numpy(action_part_table())
    legal_buffer = np.empty((DEFAULT_MAX_CANDIDATES,), dtype=np.int32)
    obs_buffer = np.empty((OBSERVATION_SIZE,), dtype=np.float32)
    rng = random.Random(seed)
    env = _make_factor_env(seed, native=True)
    matches = 0
    sampled = 0
    completed_games = 0
    legal_ranks = []

    while sampled < states:
        if env.done:
            completed_games += 1
            env = _make_factor_env((seed + completed_games) & 0xFFFFFFFF, native=True)
        _advance_opponent(env, rng, opponent)
        if env.done:
            continue
        expert = _expert_action(env, player=0)
        chosen = _factorized_action(model, env, action_parts, legal_buffer, obs_buffer)
        matches += int(chosen == expert)
        count = _write_legal_actions(env, legal_buffer)
        if hasattr(env, "heuristic_score"):
            scores = sorted(
                ((float(env.heuristic_score(0, int(action))), int(action)) for action in legal_buffer[:count]),
                reverse=True,
            )
            legal_ranks.append(next((index + 1 for index, (_score, action) in enumerate(scores) if action == chosen), len(scores)))
        if hasattr(env, "step_known_legal"):
            env.step_known_legal(expert, observe=False)
        else:
            env.step(expert, observe=False)
        sampled += 1

    return {
        "kind": "factorized",
        "policy": str(policy_path),
        "states": sampled,
        "seed": seed,
        "opponent": opponent,
        "matches": matches,
        "match_rate": matches / sampled if sampled else 0.0,
        "avg_chosen_greedy_rank": sum(legal_ranks) / len(legal_ranks) if legal_ranks else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True)
    parser.add_argument("--kind", choices=["flat", "factorized"], default="flat")
    parser.add_argument("--states", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--opponent", choices=["random", "greedy"], default="random")
    args = parser.parse_args()
    if args.kind == "factorized":
        result = evaluate_factorized(Path(args.policy), args.states, args.seed, args.opponent)
    else:
        result = evaluate_flat(Path(args.policy), args.states, args.seed, args.opponent)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
