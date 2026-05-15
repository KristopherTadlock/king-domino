"""Diagnostics for understanding where a policy loses strength."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from statistics import fmean, median

from .agents import agent_kinds, load_agent, make_env, step_legal
from .core import PHASE_DRAFT


def _safe_mean(values: list[float]) -> float:
    return fmean(values) if values else 0.0


def _safe_median(values: list[float]) -> float:
    return float(median(values)) if values else 0.0


def _choose_by_phase(env, player: int, *, policy_agent, reference_agent, mode: str) -> int:
    if mode == "policy_all":
        return int(policy_agent.choose(env, player))
    if mode == "policy_draft_reference_place":
        return int((policy_agent if env.phase == PHASE_DRAFT else reference_agent).choose(env, player))
    if mode == "reference_draft_policy_place":
        return int((reference_agent if env.phase == PHASE_DRAFT else policy_agent).choose(env, player))
    if mode == "reference_all":
        return int(reference_agent.choose(env, player))
    raise ValueError(f"unknown hybrid mode: {mode}")


def _play_hybrid_game(seed: int, policy_player: int, *, policy_agent, reference_agent, opponent_agent, mode: str, native: bool) -> dict:
    env = make_env(seed, native=native)
    steps = 0
    while not env.done:
        current = env.current_player
        if current is None:
            break
        if current == policy_player:
            action = _choose_by_phase(
                env,
                current,
                policy_agent=policy_agent,
                reference_agent=reference_agent,
                mode=mode,
            )
        else:
            action = int(opponent_agent.choose(env, current))
        _obs, _reward, done, info = step_legal(env, action, observe=False)
        if "error" in info:
            raise RuntimeError(f"{mode} produced illegal action at seed {seed}: {info['error']}")
        steps += 1
        if steps > 512:
            raise RuntimeError(f"{mode} exceeded step budget at seed {seed}")
        if done:
            break

    scores = env.scores()
    policy_score = scores[policy_player]
    opponent_score = scores[1 - policy_player]
    return {
        "win": policy_score > opponent_score,
        "tie": policy_score == opponent_score,
        "policy_score": float(policy_score),
        "opponent_score": float(opponent_score),
        "margin": float(policy_score - opponent_score),
    }


def _hybrid_breakdown(
    *,
    policy_agent,
    reference_agent,
    opponent_agent,
    games: int,
    seed: int,
    native: bool,
) -> dict:
    modes = (
        "policy_all",
        "policy_draft_reference_place",
        "reference_draft_policy_place",
        "reference_all",
    )
    results = {}
    pairs = max(0, games // 2)
    for mode in modes:
        rows = []
        for pair_index in range(pairs):
            game_seed = (seed + pair_index) & 0xFFFFFFFF
            rows.append(_play_hybrid_game(
                game_seed,
                0,
                policy_agent=policy_agent,
                reference_agent=reference_agent,
                opponent_agent=opponent_agent,
                mode=mode,
                native=native,
            ))
            rows.append(_play_hybrid_game(
                game_seed,
                1,
                policy_agent=policy_agent,
                reference_agent=reference_agent,
                opponent_agent=opponent_agent,
                mode=mode,
                native=native,
            ))
        total = len(rows)
        results[mode] = {
            "games": total,
            "win_rate": sum(1 for row in rows if row["win"]) / total if total else 0.0,
            "tie_rate": sum(1 for row in rows if row["tie"]) / total if total else 0.0,
            "avg_policy_score": _safe_mean([row["policy_score"] for row in rows]),
            "avg_opponent_score": _safe_mean([row["opponent_score"] for row in rows]),
            "avg_margin": _safe_mean([row["margin"] for row in rows]),
        }
    return results


def _phase_agreement(
    *,
    policy_agent,
    reference_agent,
    opponent_agent,
    games: int,
    seed: int,
    native: bool,
) -> dict:
    stats = defaultdict(int)
    rank_counter: dict[str, Counter] = defaultdict(Counter)
    heuristic_gaps: dict[str, list[float]] = defaultdict(list)
    candidate_counts: dict[str, list[int]] = defaultdict(list)

    for game_index in range(games):
        env = make_env((seed + game_index) & 0xFFFFFFFF, native=native)
        steps = 0
        while not env.done:
            current = env.current_player
            if current is None:
                break
            if current == 0:
                phase = "draft" if env.phase == PHASE_DRAFT else "place"
                legal = [int(action) for action in env.legal_actions()]
                policy_action = int(policy_agent.choose(env, current))
                reference_action = int(reference_agent.choose(env, current))
                stats[(phase, "states")] += 1
                stats[(phase, "agree_reference")] += int(policy_action == reference_action)
                candidate_counts[phase].append(len(legal))

                if hasattr(env, "heuristic_score") and policy_action in legal:
                    scores = [float(env.heuristic_score(current, action)) for action in legal]
                    ordered = sorted(range(len(legal)), key=lambda index: scores[index], reverse=True)
                    action_index = legal.index(policy_action)
                    rank = ordered.index(action_index)
                    rank_counter[phase][rank] += 1
                    if policy_action != reference_action:
                        heuristic_gaps[phase].append(scores[ordered[0]] - scores[action_index])
                action = policy_action
            else:
                action = int(opponent_agent.choose(env, current))

            _obs, _reward, done, info = step_legal(env, action, observe=False)
            if "error" in info:
                raise RuntimeError(f"diagnostic rollout produced illegal action at seed {seed + game_index}: {info['error']}")
            steps += 1
            if steps > 512:
                raise RuntimeError(f"diagnostic rollout exceeded step budget at seed {seed + game_index}")
            if done:
                break

    result = {}
    for phase in ("draft", "place"):
        total = stats[(phase, "states")]
        ranks = rank_counter[phase]
        rank_total = sum(ranks.values())
        result[phase] = {
            "states": total,
            "agreement_with_reference": stats[(phase, "agree_reference")] / total if total else 0.0,
            "avg_legal_candidates": _safe_mean([float(value) for value in candidate_counts[phase]]),
            "reference_rank_top1": ranks[0] / rank_total if rank_total else 0.0,
            "reference_rank_top3": sum(count for rank, count in ranks.items() if rank < 3) / rank_total if rank_total else 0.0,
            "common_reference_ranks": [[rank, count] for rank, count in ranks.most_common(8)],
            "mean_heuristic_gap_on_disagreement": _safe_mean(heuristic_gaps[phase]),
            "median_heuristic_gap_on_disagreement": _safe_median(heuristic_gaps[phase]),
        }
    return result


def run_diagnostic(
    *,
    policy_kind: str,
    policy: Path | None,
    reference_kind: str,
    reference_policy: Path | None,
    opponent_kind: str,
    opponent_policy: Path | None,
    games: int,
    seed: int,
    native: bool,
    max_candidates: int,
) -> dict:
    policy_agent = load_agent(policy_kind, policy=policy, seed=seed, max_candidates=max_candidates)
    reference_agent = load_agent(reference_kind, policy=reference_policy, seed=seed + 1, max_candidates=max_candidates)
    opponent_agent = load_agent(opponent_kind, policy=opponent_policy, seed=seed + 2, max_candidates=max_candidates)
    return {
        "policy_kind": policy_kind,
        "policy": str(policy) if policy else None,
        "reference_kind": reference_kind,
        "reference_policy": str(reference_policy) if reference_policy else None,
        "opponent_kind": opponent_kind,
        "opponent_policy": str(opponent_policy) if opponent_policy else None,
        "games": games,
        "seed": seed,
        "native": native,
        "phase_agreement": _phase_agreement(
            policy_agent=policy_agent,
            reference_agent=reference_agent,
            opponent_agent=opponent_agent,
            games=max(1, games // 2),
            seed=seed,
            native=native,
        ),
        "hybrid_breakdown": _hybrid_breakdown(
            policy_agent=policy_agent,
            reference_agent=reference_agent,
            opponent_agent=opponent_agent,
            games=games,
            seed=seed,
            native=native,
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy-kind", choices=tuple(agent_kinds()), default="candidate")
    parser.add_argument("--policy")
    parser.add_argument("--reference-kind", choices=tuple(agent_kinds()), default="greedy")
    parser.add_argument("--reference-policy")
    parser.add_argument("--opponent-kind", choices=tuple(agent_kinds()), default="greedy")
    parser.add_argument("--opponent-policy")
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=456)
    parser.add_argument("--max-candidates", type=int, default=128)
    parser.add_argument("--python-env", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run_diagnostic(
        policy_kind=args.policy_kind,
        policy=Path(args.policy) if args.policy else None,
        reference_kind=args.reference_kind,
        reference_policy=Path(args.reference_policy) if args.reference_policy else None,
        opponent_kind=args.opponent_kind,
        opponent_policy=Path(args.opponent_policy) if args.opponent_policy else None,
        games=args.games,
        seed=args.seed,
        native=not args.python_env,
        max_candidates=args.max_candidates,
    ), indent=2))


if __name__ == "__main__":
    main()
