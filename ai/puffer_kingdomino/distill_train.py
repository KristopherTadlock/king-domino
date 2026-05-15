"""Distill teacher datasets into neural Kingdomino policies."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

import numpy as np
import torch
from torch import nn

from .candidate_policy import (
    CandidateScoringPolicy,
    FactorizedActionPolicy,
    action_feature_table,
    action_part_table,
    factorized_candidate_logits,
)
from .core import ACTION_COUNT
from .policy import DEFAULT_HIDDEN_SIZE, MaskedMLPPolicy, save_checkpoint


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
) -> dict:
    torch.manual_seed(seed)
    started = time.perf_counter()
    data, dataset_metadata = _load_dataset(dataset)
    observations = data["observations"].astype(np.float32, copy=False)
    legal_actions = data["legal_actions"].astype(np.int64, copy=False)
    legal_mask = data["legal_mask"].astype(np.bool_, copy=False)
    target_actions = data["target_actions"].astype(np.int64, copy=False)
    target_indices = data["target_indices"].astype(np.int64, copy=False)
    train_indices, val_indices = _split_indices(observations.shape[0], seed)

    if head == "flat":
        model = MaskedMLPPolicy(hidden_size=hidden_size)
    elif head == "factorized":
        model = FactorizedActionPolicy(hidden_size=hidden_size)
    elif head == "candidate":
        model = CandidateScoringPolicy(hidden_size=hidden_size)
    else:
        raise ValueError(f"unknown head: {head}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    action_features = torch.from_numpy(action_feature_table()) if head == "candidate" else None
    action_parts = torch.from_numpy(action_part_table()) if head == "factorized" else None
    updates = 0
    last_loss = 0.0
    last_accuracy = 0.0

    for _epoch in range(max(1, epochs)):
        shuffled = train_indices.copy()
        np.random.default_rng(seed + _epoch).shuffle(shuffled)
        for start in range(0, len(shuffled), batch_size):
            batch = shuffled[start:start + batch_size]
            obs_tensor = torch.from_numpy(observations[batch])
            action_tensor = torch.from_numpy(legal_actions[batch])
            mask_tensor = torch.from_numpy(legal_mask[batch])
            if head == "flat":
                target_tensor = torch.from_numpy(target_actions[batch])
                logits = _flat_logits(model, obs_tensor, action_tensor, mask_tensor)
            elif head == "factorized":
                target_tensor = torch.from_numpy(target_indices[batch])
                logits = factorized_candidate_logits(model(obs_tensor), action_parts[action_tensor]).masked_fill(~mask_tensor, -1e9)
            else:
                target_tensor = torch.from_numpy(target_indices[batch])
                logits = model(obs_tensor, action_features[action_tensor]).masked_fill(~mask_tensor, -1e9)
            loss = loss_fn(logits, target_tensor)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            updates += 1
            last_loss = float(loss.item())
            last_accuracy = _accuracy(logits.detach(), target_tensor)

    with torch.no_grad():
        val_accuracy = 0.0
        if len(val_indices):
            accuracies = []
            for start in range(0, len(val_indices), batch_size):
                batch = val_indices[start:start + batch_size]
                obs_tensor = torch.from_numpy(observations[batch])
                action_tensor = torch.from_numpy(legal_actions[batch])
                mask_tensor = torch.from_numpy(legal_mask[batch])
                if head == "flat":
                    target_tensor = torch.from_numpy(target_actions[batch])
                    logits = _flat_logits(model, obs_tensor, action_tensor, mask_tensor)
                elif head == "factorized":
                    target_tensor = torch.from_numpy(target_indices[batch])
                    logits = factorized_candidate_logits(model(obs_tensor), action_parts[action_tensor]).masked_fill(~mask_tensor, -1e9)
                else:
                    target_tensor = torch.from_numpy(target_indices[batch])
                    logits = model(obs_tensor, action_features[action_tensor]).masked_fill(~mask_tensor, -1e9)
                accuracies.append(_accuracy(logits, target_tensor))
            val_accuracy = float(np.mean(accuracies)) if accuracies else 0.0

    elapsed = max(time.perf_counter() - started, 1e-9)
    metadata = {
        "backend": f"torch-{head}-teacher-distill-v0",
        "head": head,
        "seed": seed,
        "epochs": epochs,
        "batch_size": batch_size,
        "hidden_size": hidden_size,
        "lr": lr,
        "dataset": str(dataset),
        "dataset_metadata": dataset_metadata,
        "samples": int(observations.shape[0]),
        "train_samples": int(len(train_indices)),
        "val_samples": int(len(val_indices)),
        "updates": updates,
        "last_loss": last_loss,
        "last_train_accuracy": last_accuracy,
        "val_accuracy": val_accuracy,
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
                "model_type": "dot",
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
    ), indent=2))


if __name__ == "__main__":
    main()
