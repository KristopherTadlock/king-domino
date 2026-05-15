"""Run a teacher-distillation bakeoff across neural policy heads."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time

from .distill_train import train_distilled
from .fair_eval import fair_evaluate
from .teacher_dataset import generate_dataset


HEAD_TO_AGENT_KIND = {
    "flat": "flat",
    "candidate": "candidate",
    "factorized": "factorized",
}


def _policy_path(output_dir: Path, dataset: Path, head: str, objective: str, samples: int, seed: int) -> Path:
    return output_dir / f"distilled_{dataset.stem}_{head}_{objective}_{samples}_{seed}.pt"


def run_bakeoff(
    *,
    samples: int,
    seed: int,
    games: int,
    heads: list[str],
    dataset: Path,
    output_dir: Path,
    report: Path,
    epochs: int,
    batch_size: int,
    hidden_size: int,
    lr: float,
    objective: str,
    teacher_temperature: float,
    soft_weight: float,
    teacher_kind: str,
    teacher_policy: Path | None,
    search_depth: int,
    search_breadth: int,
    rollout: str,
    opponents: list[str],
    force_dataset: bool,
    force_train: bool,
) -> dict:
    started = time.perf_counter()
    output_dir.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    dataset_result = None

    if force_dataset or not dataset.exists():
        print(f"Generating {samples} {teacher_kind} teacher samples -> {dataset}", file=sys.stderr, flush=True)
        dataset_result = generate_dataset(
            output=dataset,
            samples=samples,
            seed=seed,
            teacher_kind=teacher_kind,
            teacher_policy=teacher_policy,
            rollout=rollout,
            search_depth=search_depth,
            search_breadth=search_breadth,
        )

    training = {}
    evaluations = {}
    pairs = games // 2
    for head in heads:
        policy_path = _policy_path(output_dir, dataset, head, objective, samples, seed)
        if force_train or not policy_path.exists():
            print(f"Training {head} head ({objective}) -> {policy_path}", file=sys.stderr, flush=True)
            training[head] = train_distilled(
                dataset=dataset,
                output=policy_path,
                head=head,
                seed=seed,
                epochs=epochs,
                batch_size=batch_size,
                hidden_size=hidden_size,
                lr=lr,
                objective=objective,
                teacher_temperature=teacher_temperature,
                soft_weight=soft_weight,
            )
        else:
            training[head] = {"output": str(policy_path), "reused": True}

        kind = HEAD_TO_AGENT_KIND[head]
        evaluations[head] = {}
        for opponent in opponents:
            print(f"Evaluating {head} vs {opponent} over {pairs * 2} games", file=sys.stderr, flush=True)
            opponent_policy = teacher_policy if opponent in ("heuristic", "search") else None
            evaluations[head][opponent] = fair_evaluate(
                policy_kind=kind,
                policy=policy_path,
                opponent_kind=opponent,
                opponent_policy=opponent_policy,
                pairs=pairs,
                seed=seed + 333,
                search_depth=search_depth,
                search_breadth=search_breadth,
            )

    best_by_greedy = None
    if "greedy" in opponents:
        best_by_greedy = max(
            heads,
            key=lambda head: (
                evaluations[head]["greedy"]["win_rate"],
                evaluations[head]["greedy"]["score_margin"]["mean"],
            ),
        )

    elapsed = max(time.perf_counter() - started, 1e-9)
    result = {
        "format": "kingdomino-distill-bakeoff-v0",
        "samples": samples,
        "seed": seed,
        "games": pairs * 2,
        "heads": heads,
        "opponents": opponents,
        "dataset": str(dataset),
        "dataset_result": dataset_result,
        "teacher_kind": teacher_kind,
        "teacher_policy": str(teacher_policy) if teacher_policy else None,
        "search_depth": search_depth,
        "search_breadth": search_breadth,
        "rollout": rollout,
        "epochs": epochs,
        "batch_size": batch_size,
        "hidden_size": hidden_size,
        "lr": lr,
        "objective": objective,
        "teacher_temperature": teacher_temperature,
        "soft_weight": soft_weight,
        "training": training,
        "evaluations": evaluations,
        "best_by_greedy": best_by_greedy,
        "seconds": elapsed,
    }
    report.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--heads", nargs="+", choices=tuple(HEAD_TO_AGENT_KIND), default=["flat", "candidate", "factorized"])
    parser.add_argument("--dataset", default="ai/artifacts/datasets/search_teacher_100k.npz")
    parser.add_argument("--output-dir", default="ai/artifacts")
    parser.add_argument("--report", default="ai/artifacts/distill_bakeoff_report.json")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=2.5e-4)
    parser.add_argument("--objective", choices=["ce", "soft", "hybrid"], default="ce")
    parser.add_argument("--teacher-temperature", type=float, default=8.0)
    parser.add_argument("--soft-weight", type=float, default=0.5)
    parser.add_argument("--teacher-kind", default="search", choices=["heuristic", "search"])
    parser.add_argument("--teacher-policy", default="ai/artifacts/heuristic_policy.json")
    parser.add_argument("--search-depth", type=int, default=2)
    parser.add_argument("--search-breadth", type=int, default=6)
    parser.add_argument("--rollout", choices=["teacher", "mixed", "random"], default="teacher")
    parser.add_argument("--opponents", nargs="+", choices=["random", "greedy", "delta", "heuristic"], default=["random", "greedy", "heuristic"])
    parser.add_argument("--force-dataset", action="store_true")
    parser.add_argument("--force-train", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run_bakeoff(
        samples=args.samples,
        seed=args.seed,
        games=args.games,
        heads=args.heads,
        dataset=Path(args.dataset),
        output_dir=Path(args.output_dir),
        report=Path(args.report),
        epochs=args.epochs,
        batch_size=args.batch_size,
        hidden_size=args.hidden_size,
        lr=args.lr,
        objective=args.objective,
        teacher_temperature=args.teacher_temperature,
        soft_weight=args.soft_weight,
        teacher_kind=args.teacher_kind,
        teacher_policy=Path(args.teacher_policy) if args.teacher_policy else None,
        search_depth=args.search_depth,
        search_breadth=args.search_breadth,
        rollout=args.rollout,
        opponents=args.opponents,
        force_dataset=args.force_dataset,
        force_train=args.force_train,
    ), indent=2))


if __name__ == "__main__":
    main()
