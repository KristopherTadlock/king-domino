# Puffer Kingdomino

This package is the first vertical slice toward a native-trained Kingdomino AI
opponent.

Current state:

- 2-player rules core.
- Real 48-domino deck.
- Deterministic seed/shuffle matching the JS game.
- 7x7 board constraint.
- Drafting, placement, skip, scoring, legal action masks.
- Random rollout, JS/native parity, train, eval, export, and benchmark
  entrypoints.
- Cython native environment with compact board/deck/draft arrays.
- PufferLib adapter smoke test for the current action/observation contract.
- Torch checkpoint at `ai/artifacts/latest.pt`.
- Browser-loadable exported policy at `ai/artifacts/browser_policy.json`.
- Weighted heuristic policy at `ai/artifacts/heuristic_policy.json`.
- Profiling benchmark for Python, native compatibility, optimized native, and
  multi-env native rollout paths.
- Seat-swapped fair evaluation for random, greedy, delta-greedy, weighted
  heuristic, search teacher, and neural checkpoints.
- Search-teacher dataset generation, neural distillation, and a masked PPO
  smoke loop.

The Torch trainer uses imitation learning from native experts. This is not full
PPO yet, but it is a real Torch train/eval/export path and uses the same
observation/action-mask contract that PPO will use next. The first policy that
beats the greedy baseline is a small weighted heuristic trained by black-box
search over native rollout outcomes.

## Commands

```sh
.venv/bin/python -m ai.puffer_kingdomino.puffer_smoke --steps 200 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.random_rollout --games 1000 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.parity_test
.venv/bin/python -m ai.puffer_kingdomino.benchmark --steps 100000 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.train --steps 1000000 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.train --steps 20000 --seed 123 --output /tmp/kingdomino-profile.pt --profile
.venv/bin/python -m ai.puffer_kingdomino.factor_train --steps 50000 --seed 123 --output /tmp/kingdomino-factor.pt
.venv/bin/python -m ai.puffer_kingdomino.factor_eval --policy /tmp/kingdomino-factor.pt --games 200 --seed 456
.venv/bin/python -m ai.puffer_kingdomino.factor_train --steps 200000 --seed 123 --output /tmp/kingdomino-factor-dagger.pt --roll-in mixed
.venv/bin/python -m ai.puffer_kingdomino.imitation_eval --policy ai/artifacts/latest.pt --kind flat --states 10000 --seed 789
.venv/bin/python -m ai.puffer_kingdomino.heuristic_train --output ai/artifacts/heuristic_policy.json --seed 123
.venv/bin/python -m ai.puffer_kingdomino.heuristic_eval --policy ai/artifacts/heuristic_policy.json --games 200 --seed 456 --opponent greedy
.venv/bin/python -m ai.puffer_kingdomino.eval --policy ai/artifacts/latest.pt --games 200 --seed 456
.venv/bin/python -m ai.puffer_kingdomino.eval --policy ai/artifacts/latest.pt --games 200 --seed 456 --opponent greedy
.venv/bin/python -m ai.puffer_kingdomino.export_policy --policy ai/artifacts/latest.pt --output ai/artifacts/browser_policy.json
.venv/bin/python -m ai.puffer_kingdomino.fair_eval --policy-kind heuristic --policy ai/artifacts/heuristic_policy.json --opponent-kind greedy --games 1000 --seed 456
.venv/bin/python -m ai.puffer_kingdomino.fair_eval --policy-kind search --policy ai/artifacts/heuristic_policy.json --opponent-kind heuristic --opponent-policy ai/artifacts/heuristic_policy.json --games 200 --seed 456 --search-depth 2 --search-breadth 6
.venv/bin/python -m ai.puffer_kingdomino.teacher_dataset --output ai/artifacts/datasets/search_teacher.npz --samples 20000 --seed 123 --teacher-kind search --teacher-policy ai/artifacts/heuristic_policy.json --search-depth 2 --search-breadth 6
.venv/bin/python -m ai.puffer_kingdomino.distill_train --dataset ai/artifacts/datasets/search_teacher.npz --output ai/artifacts/distilled_candidate.pt --head candidate --epochs 4 --batch-size 256
.venv/bin/python -m ai.puffer_kingdomino.distill_train --dataset ai/artifacts/datasets/search_teacher.npz --output ai/artifacts/distilled_flat.pt --head flat --epochs 4 --batch-size 256
.venv/bin/python -m ai.puffer_kingdomino.fair_eval --policy-kind candidate --policy ai/artifacts/distilled_candidate.pt --opponent-kind greedy --games 1000 --seed 456
.venv/bin/python -m ai.puffer_kingdomino.ppo_smoke --steps 10000 --seed 123 --init-policy ai/artifacts/distilled_flat.pt --output ai/artifacts/ppo_smoke.pt --opponent-kind heuristic --opponent-policy ai/artifacts/heuristic_policy.json
```

The benchmark reports a recorded pre-optimization native baseline and the
current optimized rollout path. On the local reference run for this pass:

- recorded native baseline: about `31k` steps/sec
- native compatibility path: about `139k` steps/sec
- optimized native rollout: about `224k` steps/sec
- 64-env native rollout loop: about `212k` steps/sec

The training path now uses reusable native observation buffers and can report a
rough timing breakdown with `--profile`. In the local training-loop pass,
observation creation dropped from roughly half the loop to a low single-digit
percentage; the remaining bottleneck is the Torch update over the flat
`5413`-action head. Puffer observations also write directly into their backing
buffer now, including the action mask.

There are also two prototype compact-head trainers:

- `candidate_train`: scores the currently legal candidate actions with learned
  action features.
- `factor_train`: predicts a small set of action-component logits and scores
  legal flat actions by summing their components.

The factorized prototype is the better next direction so far. In a local 50k
imitation run it reached about `30k` training steps/sec and `82.5%` win rate
against random, close to the flat-head policy's early quality while using a much
smaller action head.

The factorized trainer also supports DAgger-style roll-in with `--roll-in
mixed` or `--roll-in student`: states are labeled by the greedy expert while the
student can create part or all of the trajectory. Early DAgger runs recovered
the current flat policy's random-opponent quality, but still did not meaningfully
challenge greedy. The `imitation_eval` command measures teacher-forced agreement
with the greedy expert, which helps separate imitation fidelity from compounding
rollout errors.

The weighted heuristic path uses exact native placement score deltas plus a few
small draft and placement shaping features. A local search run saved
`ai/artifacts/heuristic_policy.json` and verified it at `63%` win rate against
the native greedy baseline over 200 games with seed `456` (`107.3` average score
vs `98.1`). This gives us a strong non-neural target to distill from or beat
with PPO next.

## Fair Evaluation

`fair_eval` plays each seed twice: once with the policy in seat 0 and once with
the seats swapped. It reports wins, losses, ties, average scores, score margin,
standard error, and a 95% confidence interval for win rate. This matters because
the draft order and seed can otherwise make a small policy look better or worse
than it is.

Current reference results from this milestone:

- Weighted heuristic vs old greedy, 1000 seat-swapped games, seed `456`:
  `62.8%` win rate, `1.5%` ties, average score `108.3` vs `97.5`, mean margin
  `+10.7`, 95% win-rate CI about `[59.8%, 65.8%]`.
- Search teacher depth `2`, breadth `6` vs weighted heuristic, 200
  seat-swapped games, seed `456`: `58.0%` win rate, average score `108.8` vs
  `105.2`, mean margin `+3.6`, 95% win-rate CI about `[51.2%, 64.8%]`.

The search teacher uses the weighted heuristic to rank candidates and evaluate
rollouts, then searches shallow continuations for the acting player. The first
important fix was to preserve the weighted heuristic as a tie/shape term during
drafting; without that, draft moves often looked identical because immediate
score deltas are zero.

## Distillation And PPO

`teacher_dataset` records supervised samples from a teacher policy:

- normalized observation
- compact legal action candidate list and mask
- chosen teacher action
- target candidate index
- teacher score/rank when available
- phase, player, seed, and generation metadata

`distill_train` trains one of three heads from that dataset:

- `flat`: the exportable `5413`-action masked MLP.
- `candidate`: scores only the current legal candidates with action features.
- `factorized`: scores legal candidates from compact action-component logits.

The candidate and factorized heads are better research targets for PPO because
they avoid spending most model capacity and update time on invalid flat actions.
The flat head remains useful because it is the current browser-exportable neural
format.

`ppo_smoke` is a deliberately small clipped-PPO legality test. It supports
initializing from a flat distilled checkpoint, samples only legal masked actions,
rolls out a configurable opponent, applies PPO updates, and saves a flat
checkpoint. It is not expected to be the final high-quality PPO trainer; its job
is to prove that the PPO control loop can run without illegal moves or crashes.

Current recommendation:

- Use the weighted heuristic in the browser until a distilled or PPO policy
  beats it under fair evaluation.
- Use the depth-2 search teacher to generate supervised data.
- Use candidate/factorized distillation to choose the next PPO architecture.
- Keep flat distillation around as the browser-export and PPO-smoke bridge.

For browser play against the current executable policy:

```sh
node server.js
```

Then open:

```text
http://127.0.0.1:8080/?hotseat=1&seed=123&p1=Human&p2=AI&ai=1
```

The browser runner loads `heuristic_policy.json` first, then falls back to the
older neural `browser_policy.json` if the heuristic artifact is missing.

## Action Space

- `0..3`: draft slots.
- placement actions: draft slot, orientation, anchor coordinate, anchor end.
- final action: skip, legal only when no placement option exists.

The action mask is part of every observation.

## Known Gaps

- Serious PPO is still outstanding. The current PPO path is a smoke trainer for
  legality and checkpoint flow, not a tuned RL trainer.
- The first PufferLib adapter is wired as a single learning agent against a
  random opponent.
- The Torch neural policies beat random play but are not yet competitive with
  greedy; the saveable weighted heuristic policy is the first beating-greedy
  milestone.
- 3-player and 4-player modes are intentionally out of scope for this milestone.
