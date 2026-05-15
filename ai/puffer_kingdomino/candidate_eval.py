"""Evaluate a prototype legal-candidate policy checkpoint."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import random

import numpy as np
import torch

from .candidate_policy import CandidateScoringPolicy, InteractionCandidatePolicy, action_feature_table
from .candidate_train import DEFAULT_MAX_CANDIDATES, _write_legal_actions
from .core import KingdominoEnv, random_legal_action
from .policy import OBSERVATION_SIZE, OBS_SCALE

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


def _make_env(seed: int, native: bool = True):
    if native and NativeKingdominoEnv is not None:
        return NativeKingdominoEnv(seed=seed)
    return KingdominoEnv(seed=seed)


def _greedy_action(env, player: int) -> int:
    if hasattr(env, "greedy_action"):
        return int(env.greedy_action(player))
    from .core import greedy_policy_action

    return greedy_policy_action(env, player=player)


def _opponent_action(env, rng: random.Random, opponent: str) -> int:
    if opponent == "greedy":
        return _greedy_action(env, player=1)
    return random_legal_action(env, rng)


@torch.no_grad()
def _choose_candidate_action(model, env, action_features, legal_buffer, obs_buffer) -> int:
    legal_count = _write_legal_actions(env, legal_buffer)
    if hasattr(env, "write_observation_vector"):
        env.write_observation_vector(obs_buffer, OBS_SCALE)
    else:
        from .policy import observation_vector

        obs_buffer[:] = observation_vector(env)
    obs_tensor = torch.from_numpy(obs_buffer).unsqueeze(0)
    actions = torch.from_numpy(legal_buffer[:legal_count].astype(np.int64, copy=False)).unsqueeze(0)
    logits = model(obs_tensor, action_features[actions])
    index = int(torch.argmax(logits, dim=-1).item())
    return int(legal_buffer[index])


def evaluate(
    policy_path: Path,
    games: int,
    seed: int,
    opponent: str = "random",
    native: bool = True,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
) -> dict:
    payload = torch.load(policy_path, map_location="cpu")
    if payload.get("format") != "kingdomino-candidate-policy-v0":
        raise ValueError(f"unsupported candidate checkpoint format: {payload.get('format')}")
    metadata = payload.get("metadata", {})
    hidden_size = int(metadata.get("hidden_size", 64))
    model_type = payload.get("model_type") or metadata.get("model_type", "dot")
    if model_type == "interaction":
        model = InteractionCandidatePolicy(hidden_size=hidden_size)
    else:
        model = CandidateScoringPolicy(hidden_size=hidden_size)
    model.load_state_dict(payload["state_dict"])
    model.eval()
    action_features = torch.from_numpy(action_feature_table())
    legal_buffer = np.empty((max_candidates,), dtype=np.int32)
    obs_buffer = np.empty((OBSERVATION_SIZE,), dtype=np.float32)
    rng = random.Random(seed)
    wins = [0, 0]
    ties = 0
    total_scores = [0, 0]

    for game_index in range(games):
        env = _make_env((seed + game_index) & 0xFFFFFFFF, native=native)
        steps = 0
        while not env.done:
            if env.current_player == 0:
                action = _choose_candidate_action(model, env, action_features, legal_buffer, obs_buffer)
            else:
                action = _opponent_action(env, rng, opponent)
            if hasattr(env, "step_known_legal"):
                _obs, _reward, done, info = env.step_known_legal(action, observe=False)
            else:
                _obs, _reward, done, info = env.step(action, observe=False)
            if "error" in info:
                raise RuntimeError(f"policy produced illegal action in game {game_index}: {info['error']}")
            steps += 1
            if steps > 512:
                raise RuntimeError(f"eval exceeded step budget in game {game_index}")
            if done:
                break

        score0, score1 = env.scores()
        total_scores[0] += score0
        total_scores[1] += score1
        if score0 > score1:
            wins[0] += 1
        elif score1 > score0:
            wins[1] += 1
        else:
            ties += 1

    return {
        "games": games,
        "seed": seed,
        "policy": str(policy_path),
        "backend": metadata.get("backend"),
        "model_type": model_type,
        "opponent": opponent,
        "wins": wins,
        "ties": ties,
        "win_rate": wins[0] / games if games else 0,
        "avg_scores": [score / games if games else 0 for score in total_scores],
        "native": bool(native and NativeKingdominoEnv is not None),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True)
    parser.add_argument("--games", type=int, default=200)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--opponent", choices=["random", "greedy"], default="random")
    parser.add_argument("--python-env", action="store_true")
    parser.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
    args = parser.parse_args()
    print(json.dumps(evaluate(
        Path(args.policy),
        args.games,
        args.seed,
        opponent=args.opponent,
        native=not args.python_env,
        max_candidates=args.max_candidates,
    ), indent=2))


if __name__ == "__main__":
    main()
