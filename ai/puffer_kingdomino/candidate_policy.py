"""Candidate-scoring policy prototype for compact legal-action training."""

from __future__ import annotations

import math

import numpy as np
import torch
from torch import nn

from .core import (
    ACTION_COUNT,
    COORD_MAX,
    COORD_MIN,
    DRAFT_ACTIONS,
    SKIP_ACTION,
    decode_placement_action,
)
from .policy import DEFAULT_HIDDEN_SIZE, OBSERVATION_SIZE


ACTION_FEATURE_SIZE = 40
ACTION_PART_SIZE = 6
FACTOR_LOGIT_SIZE = 37
FACTOR_DRAFT_OFFSET = 0
FACTOR_ORIENTATION_OFFSET = FACTOR_DRAFT_OFFSET + 4
FACTOR_X_OFFSET = FACTOR_ORIENTATION_OFFSET + 4
FACTOR_Y_OFFSET = FACTOR_X_OFFSET + 13
FACTOR_ANCHOR_OFFSET = FACTOR_Y_OFFSET + 13
FACTOR_SKIP_OFFSET = FACTOR_ANCHOR_OFFSET + 2
FACTOR_UNUSED = -1


def action_feature_table() -> np.ndarray:
    """Return normalized action features for every flat action id."""

    features = np.zeros((ACTION_COUNT, ACTION_FEATURE_SIZE), dtype=np.float32)
    coord_scale = max(abs(COORD_MIN), abs(COORD_MAX))

    for action in range(ACTION_COUNT):
        if action < DRAFT_ACTIONS:
            features[action, 0] = 1.0
            features[action, 3 + action] = 1.0
            continue

        if action == SKIP_ACTION:
            features[action, 2] = 1.0
            continue

        decoded = decode_placement_action(action)
        if decoded is None:
            continue
        draft_index, orientation, x, y, anchor_end = decoded
        radians = math.radians(orientation)
        features[action, 1] = 1.0
        features[action, 3 + draft_index] = 1.0
        features[action, 7 + (orientation // 90)] = 1.0
        features[action, 11 + (x - COORD_MIN)] = 1.0
        features[action, 24 + (y - COORD_MIN)] = 1.0
        features[action, 37 + anchor_end] = 1.0
        features[action, 39] = (abs(x) + abs(y)) / (coord_scale * 2.0)

    return features


def action_part_table() -> np.ndarray:
    """Return factor-logit indices used by each flat action id.

    Each row contains up to ACTION_PART_SIZE logit indices. Unused entries are
    FACTOR_UNUSED and are ignored by `factorized_candidate_logits`.
    """

    parts = np.full((ACTION_COUNT, ACTION_PART_SIZE), FACTOR_UNUSED, dtype=np.int64)
    for action in range(ACTION_COUNT):
        if action < DRAFT_ACTIONS:
            parts[action, 0] = FACTOR_DRAFT_OFFSET + action
            continue

        if action == SKIP_ACTION:
            parts[action, 0] = FACTOR_SKIP_OFFSET
            continue

        decoded = decode_placement_action(action)
        if decoded is None:
            continue
        draft_index, orientation, x, y, anchor_end = decoded
        parts[action, 0] = FACTOR_DRAFT_OFFSET + draft_index
        parts[action, 1] = FACTOR_ORIENTATION_OFFSET + (orientation // 90)
        parts[action, 2] = FACTOR_X_OFFSET + (x - COORD_MIN)
        parts[action, 3] = FACTOR_Y_OFFSET + (y - COORD_MIN)
        parts[action, 4] = FACTOR_ANCHOR_OFFSET + anchor_end
    return parts


class CandidateScoringPolicy(nn.Module):
    """Scores a variable-size set of legal actions instead of all 5413 ids."""

    def __init__(
        self,
        obs_size: int = OBSERVATION_SIZE,
        action_feature_size: int = ACTION_FEATURE_SIZE,
        hidden_size: int = DEFAULT_HIDDEN_SIZE,
    ):
        super().__init__()
        self.obs_size = obs_size
        self.action_feature_size = action_feature_size
        self.hidden_size = hidden_size
        self.obs = nn.Linear(obs_size, hidden_size)
        self.action = nn.Linear(action_feature_size, hidden_size)
        self.action_bias = nn.Linear(action_feature_size, 1)

    def forward(self, observations: torch.Tensor, candidate_features: torch.Tensor) -> torch.Tensor:
        state = torch.tanh(self.obs(observations))
        action = torch.tanh(self.action(candidate_features))
        score = (state[:, None, :] * action).sum(dim=-1) / math.sqrt(self.hidden_size)
        return score + self.action_bias(candidate_features).squeeze(-1)


class InteractionCandidatePolicy(nn.Module):
    """Richer legal-candidate scorer with explicit state/action interaction."""

    def __init__(
        self,
        obs_size: int = OBSERVATION_SIZE,
        action_feature_size: int = ACTION_FEATURE_SIZE,
        hidden_size: int = DEFAULT_HIDDEN_SIZE,
    ):
        super().__init__()
        self.obs_size = obs_size
        self.action_feature_size = action_feature_size
        self.hidden_size = hidden_size
        self.obs = nn.Linear(obs_size, hidden_size)
        self.action = nn.Linear(action_feature_size, hidden_size)
        self.joint = nn.Linear(hidden_size * 3, hidden_size)
        self.output = nn.Linear(hidden_size, 1)

    def forward(self, observations: torch.Tensor, candidate_features: torch.Tensor) -> torch.Tensor:
        state = torch.tanh(self.obs(observations))[:, None, :]
        action = torch.tanh(self.action(candidate_features))
        state = state.expand(-1, action.shape[1], -1)
        joint = torch.cat([state, action, state * action], dim=-1)
        return self.output(torch.tanh(self.joint(joint))).squeeze(-1)


class FactorizedActionPolicy(nn.Module):
    """Tiny policy head whose component logits score legal flat actions."""

    def __init__(self, obs_size: int = OBSERVATION_SIZE, hidden_size: int = DEFAULT_HIDDEN_SIZE):
        super().__init__()
        self.obs_size = obs_size
        self.hidden_size = hidden_size
        self.action_count = ACTION_COUNT
        self.input = nn.Linear(obs_size, hidden_size)
        self.output = nn.Linear(hidden_size, FACTOR_LOGIT_SIZE)

    def forward(self, observations: torch.Tensor) -> torch.Tensor:
        hidden = torch.tanh(self.input(observations))
        return self.output(hidden)


def factorized_candidate_logits(
    factor_logits: torch.Tensor,
    candidate_parts: torch.Tensor,
) -> torch.Tensor:
    safe_parts = candidate_parts.clamp_min(0)
    gathered = factor_logits.gather(1, safe_parts.reshape(factor_logits.shape[0], -1))
    gathered = gathered.reshape(candidate_parts.shape)
    return gathered.masked_fill(candidate_parts < 0, 0.0).sum(dim=-1)
