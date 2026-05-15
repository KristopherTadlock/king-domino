"""Distill teacher datasets into neural Kingdomino policies."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from .candidate_policy import (
    CandidateScoringPolicy,
    FEATURE_MODES,
    FactorizedActionPolicy,
    InteractionCandidatePolicy,
    action_part_table,
    candidate_feature_size,
    candidate_features_from_observations,
    factorized_candidate_logits,
)
from .core import ACTION_COUNT
from .policy import DEFAULT_HIDDEN_SIZE, OBSERVATION_VERSION, MaskedMLPPolicy, save_checkpoint


def _load_dataset(path: Path):
    data = np.load(path)
    metadata = json.loads(str(data["metadata"]))
    return data, metadata


def _split_indices(count: int, seed: int, train_fraction: float = 0.9):
    rng = np.random.default_rng(seed)
    indices = np.arange(count)
    rng.shuffle(indices)
    split = int(count * train_fraction)
    return indices[:split], indices[split:]


def _accuracy(logits: torch.Tensor, target: torch.Tensor) -> float:
    if logits.numel() == 0:
        return 0.0
    return float((torch.argmax(logits, dim=-1) == target).float().mean().item())


def _flat_logits(model, obs_tensor, legal_actions, legal_mask):
    logits = model(obs_tensor)
    full_mask = torch.zeros((obs_tensor.shape[0], ACTION_COUNT), dtype=torch.bool)
    for row in range(obs_tensor.shape[0]):
        full_mask[row, legal_actions[row][legal_mask[row]]] = True
    return logits.masked_fill(~full_mask, -1e9)


def _candidate_logits(head, model, obs_tensor, legal_actions, legal_mask, action_features=None, action_parts=None):
    if head == "flat":
        logits = model(obs_tensor)
        gathered = logits.gather(1, legal_actions.clamp_min(0))
    elif head == "factorized":
        gathered = factorized_candidate_logits(model(obs_tensor), action_parts[legal_actions])
    else:
        gathered = model(obs_tensor, action_features)
    return gathered.masked_fill(~legal_mask, -1e9)


def _candidate_feature_tensor(
    observations: np.ndarray,
    legal_actions: np.ndarray,
    feature_mode: str,
    legal_mask: np.ndarray | None = None,
) -> torch.Tensor:
    return torch.from_numpy(candidate_features_from_observations(
        observations,
        legal_actions,
        feature_mode=feature_mode,
        legal_mask=legal_mask,
    ))


def _teacher_probs(candidate_scores: torch.Tensor, legal_mask: torch.Tensor, temperature: float) -> torch.Tensor:
    scores = torch.nan_to_num(candidate_scores, nan=-1e9, neginf=-1e9, posinf=1e9)
    scores = scores.masked_fill(~legal_mask, -1e9)
    row_max = scores.max(dim=-1, keepdim=True).values
    centered = (scores - row_max) / max(temperature, 1e-6)
    centered = centered.masked_fill(~legal_mask, -1e9)
    probs = torch.softmax(centered, dim=-1).masked_fill(~legal_mask, 0.0)
    return probs / probs.sum(dim=-1, keepdim=True).clamp_min(1e-8)


def _distill_loss(
    logits: torch.Tensor,
    target_indices: torch.Tensor,
    candidate_scores: torch.Tensor | None,
    legal_mask: torch.Tensor,
    *,
    objective: str,
    teacher_temperature: float,
    soft_weight: float,
) -> tuple[torch.Tensor, float, float]:
    ce_loss = F.cross_entropy(logits, target_indices)
    if objective == "ce":
        return ce_loss, float(ce_loss.item()), 0.0
    if candidate_scores is None:
        raise ValueError("objective requires candidate_scores; regenerate the dataset with teacher_dataset v1")
    teacher = _teacher_probs(candidate_scores, legal_mask, teacher_temperature)
    log_probs = F.log_softmax(logits, dim=-1)
    soft_loss = F.kl_div(log_probs, teacher, reduction="batchmean")
    if objective == "soft":
        return soft_loss, float(ce_loss.item()), float(soft_loss.item())
    if objective == "hybrid":
        weight = min(1.0, max(0.0, soft_weight))
        return (1.0 - weight) * ce_loss + weight * soft_loss, float(ce_loss.item()), float(soft_loss.item())
    raise ValueError(f"unknown objective: {objective}")


def train_distilled(
    *,
    dataset: Path,
    output: Path,
    head: str,
    seed: int = 123,
    epochs: int = 4,
    batch_size: int = 256,
    hidden_size: int = DEFAULT_HIDDEN_SIZE,
    lr: float = 2.5e-4,
    objective: str = "ce",
    teacher_temperature: float = 8.0,
    soft_weight: float = 0.5,
    model_type: str = "dot",
    feature_mode: str = "static",
) -> dict:
    torch.manual_seed(seed)
    started = time.perf_counter()
    data, dataset_metadata = _load_dataset(dataset)
    dataset_observation_version = int(dataset_metadata.get("observation_version", 1))
    if dataset_observation_version != OBSERVATION_VERSION:
        raise ValueError(
            f"dataset observation_version {dataset_observation_version} != {OBSERVATION_VERSION}; "
            "regenerate the dataset before training"
        )
    observations = data["observations"].astype(np.float32, copy=False)
    legal_actions = data["legal_actions"].astype(np.int64, copy=False)
    legal_mask = data["legal_mask"].astype(np.bool_, copy=False)
    target_actions = data["target_actions"].astype(np.int64, copy=False)
    target_indices = data["target_indices"].astype(np.int64, copy=False)
    candidate_scores = data["candidate_scores"].astype(np.float32, copy=False) if "candidate_scores" in data else None
    train_indices, val_indices = _split_indices(observations.shape[0], seed)

    if head == "flat":
        model = MaskedMLPPolicy(hidden_size=hidden_size)
    elif head == "factorized":
        model = FactorizedActionPolicy(hidden_size=hidden_size)
    elif head == "candidate":
        action_feature_size = candidate_feature_size(feature_mode)
        model = (
            InteractionCandidatePolicy(hidden_size=hidden_size, action_feature_size=action_feature_size)
            if model_type == "interaction"
            else CandidateScoringPolicy(hidden_size=hidden_size, action_feature_size=action_feature_size)
        )
    else:
        raise ValueError(f"unknown head: {head}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    action_features = None
    action_parts = torch.from_numpy(action_part_table()) if head == "factorized" else None
    updates = 0
    last_loss = 0.0
    last_ce_loss = 0.0
    last_soft_loss = 0.0
    last_accuracy = 0.0

    for _epoch in range(max(1, epochs)):
        shuffled = train_indices.copy()
        np.random.default_rng(seed + _epoch).shuffle(shuffled)
        for start in range(0, len(shuffled), batch_size):
            batch = shuffled[start:start + batch_size]
            obs_tensor = torch.from_numpy(observations[batch])
            batch_width = int(np.max(np.sum(legal_mask[batch], axis=1)))
            batch_actions = legal_actions[batch, :batch_width]
            action_tensor = torch.from_numpy(batch_actions)
            mask_tensor = torch.from_numpy(legal_mask[batch, :batch_width])
            score_tensor = torch.from_numpy(candidate_scores[batch, :batch_width]) if candidate_scores is not None else None
            target_tensor = torch.from_numpy(target_indices[batch])
            action_features = (
                _candidate_feature_tensor(observations[batch], batch_actions, feature_mode, legal_mask[batch, :batch_width])
                if head == "candidate"
                else None
            )
            logits = _candidate_logits(head, model, obs_tensor, action_tensor, mask_tensor, action_features, action_parts)
            loss, ce_loss, soft_loss = _distill_loss(
                logits,
                target_tensor,
                score_tensor,
                mask_tensor,
                objective=objective,
                teacher_temperature=teacher_temperature,
                soft_weight=soft_weight,
            )
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            updates += 1
            last_loss = float(loss.item())
            last_ce_loss = ce_loss
            last_soft_loss = soft_loss
            last_accuracy = _accuracy(logits.detach(), target_tensor)

    with torch.no_grad():
        val_accuracy = 0.0
        val_soft_loss = 0.0
        if len(val_indices):
            accuracies = []
            soft_losses = []
            for start in range(0, len(val_indices), batch_size):
                batch = val_indices[start:start + batch_size]
                obs_tensor = torch.from_numpy(observations[batch])
                batch_width = int(np.max(np.sum(legal_mask[batch], axis=1)))
                batch_actions = legal_actions[batch, :batch_width]
                action_tensor = torch.from_numpy(batch_actions)
                mask_tensor = torch.from_numpy(legal_mask[batch, :batch_width])
                score_tensor = torch.from_numpy(candidate_scores[batch, :batch_width]) if candidate_scores is not None else None
                target_tensor = torch.from_numpy(target_indices[batch])
                action_features = (
                    _candidate_feature_tensor(observations[batch], batch_actions, feature_mode, legal_mask[batch, :batch_width])
                    if head == "candidate"
                    else None
                )
                logits = _candidate_logits(head, model, obs_tensor, action_tensor, mask_tensor, action_features, action_parts)
                accuracies.append(_accuracy(logits, target_tensor))
                if score_tensor is not None:
                    teacher = _teacher_probs(score_tensor, mask_tensor, teacher_temperature)
                    soft_losses.append(float(F.kl_div(F.log_softmax(logits, dim=-1), teacher, reduction="batchmean").item()))
            val_accuracy = float(np.mean(accuracies)) if accuracies else 0.0
            val_soft_loss = float(np.mean(soft_losses)) if soft_losses else 0.0

    elapsed = max(time.perf_counter() - started, 1e-9)
    metadata = {
        "backend": f"torch-{head}-teacher-distill-v0",
        "head": head,
        "model_type": model_type if head == "candidate" else None,
        "feature_mode": feature_mode if head == "candidate" else None,
        "action_feature_size": candidate_feature_size(feature_mode) if head == "candidate" else None,
        "observation_version": OBSERVATION_VERSION,
        "seed": seed,
        "epochs": epochs,
        "batch_size": batch_size,
        "hidden_size": hidden_size,
        "lr": lr,
        "objective": objective,
        "teacher_temperature": teacher_temperature,
        "soft_weight": soft_weight,
        "dataset": str(dataset),
        "dataset_metadata": dataset_metadata,
        "samples": int(observations.shape[0]),
        "train_samples": int(len(train_indices)),
        "val_samples": int(len(val_indices)),
        "updates": updates,
        "last_loss": last_loss,
        "last_ce_loss": last_ce_loss,
        "last_soft_loss": last_soft_loss,
        "last_train_accuracy": last_accuracy,
        "val_accuracy": val_accuracy,
        "val_soft_loss": val_soft_loss,
        "seconds": elapsed,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    if head == "flat":
        save_checkpoint(model, output, metadata)
    elif head == "factorized":
        torch.save(
            {
                "format": "kingdomino-factorized-policy-v0",
                "state_dict": model.state_dict(),
                "metadata": metadata,
            },
            output,
        )
    else:
        torch.save(
            {
                "format": "kingdomino-candidate-policy-v0",
                "model_type": model_type,
                "feature_mode": feature_mode,
                "action_feature_size": candidate_feature_size(feature_mode),
                "state_dict": model.state_dict(),
                "metadata": metadata,
            },
            output,
        )
    return {"output": str(output), **metadata}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="ai/artifacts/datasets/search_teacher.npz")
    parser.add_argument("--output", default="ai/artifacts/distilled_candidate.pt")
    parser.add_argument("--head", choices=["flat", "factorized", "candidate"], default="candidate")
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--hidden-size", type=int, default=DEFAULT_HIDDEN_SIZE)
    parser.add_argument("--lr", type=float, default=2.5e-4)
    parser.add_argument("--objective", choices=["ce", "soft", "hybrid"], default="ce")
    parser.add_argument("--teacher-temperature", type=float, default=8.0)
    parser.add_argument("--soft-weight", type=float, default=0.5)
    parser.add_argument("--model-type", choices=["dot", "interaction"], default="dot", help="Candidate head architecture; ignored for non-candidate heads")
    parser.add_argument("--feature-mode", choices=FEATURE_MODES, default="static", help="Candidate feature mode; rich adds state-conditioned placement features")
    args = parser.parse_args()
    print(json.dumps(train_distilled(
        dataset=Path(args.dataset),
        output=Path(args.output),
        head=args.head,
        seed=args.seed,
        epochs=args.epochs,
        batch_size=args.batch_size,
        hidden_size=args.hidden_size,
        lr=args.lr,
        objective=args.objective,
        teacher_temperature=args.teacher_temperature,
        soft_weight=args.soft_weight,
        model_type=args.model_type,
        feature_mode=args.feature_mode,
    ), indent=2))


if __name__ == "__main__":
    main()
