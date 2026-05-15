"""Reusable AI policy adapters for evaluation, teachers, and datasets."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import random
from typing import Iterable, Sequence

import numpy as np

from .candidate_train import DEFAULT_MAX_CANDIDATES, _write_legal_actions
from .core import KingdominoEnv, random_legal_action
from .heuristic_policy import DEFAULT_WEIGHTS, choose_action as choose_heuristic_action, load_policy
from .policy import OBSERVATION_SIZE, OBS_SCALE, choose_model_action, load_checkpoint, observation_vector

try:
    from .native import NativeKingdominoEnv
except ImportError:  # pragma: no cover - extension intentionally optional
    NativeKingdominoEnv = None


def make_env(seed: int, native: bool = True):
    if native and NativeKingdominoEnv is not None:
        return NativeKingdominoEnv(seed=seed)
    return KingdominoEnv(seed=seed)


def step_legal(env, action: int, observe: bool = False):
    if hasattr(env, "step_known_legal"):
        return env.step_known_legal(int(action), observe=observe)
    return env.step(int(action), observe=observe)


def legal_actions(env, buffer: np.ndarray | None = None) -> list[int]:
    if buffer is not None and hasattr(env, "write_legal_actions"):
        count = int(env.write_legal_actions(buffer))
        return [int(action) for action in buffer[:count]]
    return [int(action) for action in env.legal_actions()]


def score_margin(env, player: int) -> float:
    scores = env.scores()
    other = 1 - player
    return float(scores[player] - scores[other])


class Agent:
    name = "agent"

    def choose(self, env, player: int) -> int:
        raise NotImplementedError

    def score_actions(self, env, player: int, actions: Sequence[int]) -> list[float] | None:
        return None


@dataclass
class RandomAgent(Agent):
    rng: random.Random
    name: str = "random"

    def choose(self, env, player: int) -> int:
        return random_legal_action(env, self.rng)


@dataclass
class GreedyAgent(Agent):
    name: str = "greedy"

    def choose(self, env, player: int) -> int:
        if hasattr(env, "greedy_action"):
            return int(env.greedy_action(player))
        from .core import greedy_policy_action

        return int(greedy_policy_action(env, player=player))


@dataclass
class DeltaAgent(Agent):
    name: str = "delta"

    def choose(self, env, player: int) -> int:
        if hasattr(env, "delta_greedy_action"):
            return int(env.delta_greedy_action(player))
        return GreedyAgent().choose(env, player)


@dataclass
class HeuristicAgent(Agent):
    weights: list[float]
    name: str = "heuristic"

    def choose(self, env, player: int) -> int:
        return choose_heuristic_action(env, player, self.weights)

    def score_actions(self, env, player: int, actions: Sequence[int]) -> list[float] | None:
        if not hasattr(env, "weighted_score"):
            return None
        return [float(env.weighted_score(player, int(action), self.weights)) for action in actions]


@dataclass
class FlatTorchAgent(Agent):
    model: object
    name: str = "flat"

    def choose(self, env, player: int) -> int:
        return int(choose_model_action(self.model, env, deterministic=True))


@dataclass
class CandidateTorchAgent(Agent):
    model: object
    action_features: object | None
    feature_mode: str
    obs_buffer: np.ndarray
    legal_buffer: np.ndarray
    name: str = "candidate"

    def choose(self, env, player: int) -> int:
        import torch

        legal_count = _write_legal_actions(env, self.legal_buffer)
        if hasattr(env, "write_observation_vector"):
            env.write_observation_vector(self.obs_buffer, OBS_SCALE)
        else:
            self.obs_buffer[:] = observation_vector(env)
        obs_tensor = torch.from_numpy(self.obs_buffer).unsqueeze(0)
        action_ids = self.legal_buffer[:legal_count].astype(np.int64, copy=False)
        actions = torch.from_numpy(action_ids).unsqueeze(0)
        if self.action_features is None:
            from .candidate_policy import candidate_features_from_observations

            candidate_features = torch.from_numpy(candidate_features_from_observations(
                self.obs_buffer,
                action_ids,
                feature_mode=self.feature_mode,
            )).unsqueeze(0)
        else:
            candidate_features = self.action_features[actions]
        logits = self.model(obs_tensor, candidate_features)
        index = int(torch.argmax(logits, dim=-1).item())
        return int(self.legal_buffer[index])


@dataclass
class FactorizedTorchAgent(Agent):
    model: object
    action_parts: object
    obs_buffer: np.ndarray
    legal_buffer: np.ndarray
    name: str = "factorized"

    def choose(self, env, player: int) -> int:
        import torch

        from .candidate_policy import factorized_candidate_logits

        legal_count = _write_legal_actions(env, self.legal_buffer)
        if hasattr(env, "write_observation_vector"):
            env.write_observation_vector(self.obs_buffer, OBS_SCALE)
        else:
            self.obs_buffer[:] = observation_vector(env)
        obs_tensor = torch.from_numpy(self.obs_buffer).unsqueeze(0)
        actions = torch.from_numpy(self.legal_buffer[:legal_count].astype(np.int64, copy=False)).unsqueeze(0)
        logits = factorized_candidate_logits(self.model(obs_tensor), self.action_parts[actions])
        index = int(torch.argmax(logits, dim=-1).item())
        return int(self.legal_buffer[index])


def load_agent(
    kind: str,
    *,
    policy: str | Path | None = None,
    seed: int = 1,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    search_depth: int = 1,
    search_breadth: int = 12,
) -> Agent:
    kind = kind.lower()
    if kind == "random":
        return RandomAgent(random.Random(seed))
    if kind == "greedy":
        return GreedyAgent()
    if kind == "delta":
        return DeltaAgent()
    if kind == "heuristic":
        weights = DEFAULT_WEIGHTS
        if policy:
            weights, _metadata = load_policy(Path(policy))
        return HeuristicAgent(weights=weights)
    if kind == "search":
        from .search_teacher import SearchAgent

        weights = DEFAULT_WEIGHTS
        if policy:
            weights, _metadata = load_policy(Path(policy))
        return SearchAgent(weights=weights, depth=search_depth, breadth=search_breadth)
    if kind == "flat":
        if not policy:
            raise ValueError("flat policy kind requires --policy")
        model, _checkpoint = load_checkpoint(Path(policy))
        return FlatTorchAgent(model=model)
    if kind == "candidate":
        if not policy:
            raise ValueError("candidate policy kind requires --policy")
        import torch

        from .candidate_policy import (
            STATIC_FEATURE_MODE,
            CandidateScoringPolicy,
            InteractionCandidatePolicy,
            action_feature_table,
            candidate_feature_size,
        )

        payload = torch.load(Path(policy), map_location="cpu")
        metadata = payload.get("metadata", {})
        hidden_size = int(metadata.get("hidden_size", 64))
        model_type = payload.get("model_type") or metadata.get("model_type", "dot")
        feature_mode = payload.get("feature_mode") or metadata.get("feature_mode", STATIC_FEATURE_MODE)
        action_feature_size = int(payload.get("action_feature_size") or metadata.get("action_feature_size") or candidate_feature_size(feature_mode))
        model = (
            InteractionCandidatePolicy(hidden_size=hidden_size, action_feature_size=action_feature_size)
            if model_type == "interaction"
            else CandidateScoringPolicy(hidden_size=hidden_size, action_feature_size=action_feature_size)
        )
        model.load_state_dict(payload["state_dict"])
        model.eval()
        return CandidateTorchAgent(
            model=model,
            action_features=torch.from_numpy(action_feature_table()) if feature_mode == STATIC_FEATURE_MODE else None,
            feature_mode=feature_mode,
            obs_buffer=np.empty((OBSERVATION_SIZE,), dtype=np.float32),
            legal_buffer=np.empty((max_candidates,), dtype=np.int32),
            name=f"candidate-{model_type}-{feature_mode}",
        )
    if kind in ("factor", "factorized"):
        if not policy:
            raise ValueError("factorized policy kind requires --policy")
        import torch

        from .candidate_policy import FactorizedActionPolicy, action_part_table

        payload = torch.load(Path(policy), map_location="cpu")
        if payload.get("format") != "kingdomino-factorized-policy-v0":
            raise ValueError(f"unsupported factorized checkpoint format: {payload.get('format')}")
        hidden_size = int(payload.get("metadata", {}).get("hidden_size", 64))
        model = FactorizedActionPolicy(hidden_size=hidden_size)
        model.load_state_dict(payload["state_dict"])
        model.eval()
        return FactorizedTorchAgent(
            model=model,
            action_parts=torch.from_numpy(action_part_table()),
            obs_buffer=np.empty((OBSERVATION_SIZE,), dtype=np.float32),
            legal_buffer=np.empty((max_candidates,), dtype=np.int32),
        )
    raise ValueError(f"unknown agent kind: {kind}")


def agent_kinds() -> Iterable[str]:
    return ("random", "greedy", "delta", "heuristic", "search", "flat", "candidate", "factorized")
