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
- Observation contract v2, where empty cells are `0`, castles are visible as
  `1`, and terrain ids are shifted by one in board features.

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
.venv/bin/python -m ai.puffer_kingdomino.encoding_contract_test
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
.venv/bin/python -m ai.puffer_kingdomino.distill_train --dataset ai/artifacts/datasets/search_teacher.npz --output ai/artifacts/distilled_candidate_rich.pt --head candidate --model-type interaction --feature-mode rich --objective hybrid --epochs 4 --batch-size 256
.venv/bin/python -m ai.puffer_kingdomino.distill_train --dataset ai/artifacts/datasets/search_teacher.npz --output ai/artifacts/distilled_flat.pt --head flat --epochs 4 --batch-size 256
.venv/bin/python -m ai.puffer_kingdomino.fair_eval --policy-kind candidate --policy ai/artifacts/distilled_candidate.pt --opponent-kind greedy --games 1000 --seed 456
.venv/bin/python -m ai.puffer_kingdomino.ppo_smoke --steps 10000 --seed 123 --init-policy ai/artifacts/distilled_flat.pt --output ai/artifacts/ppo_smoke.pt --opponent-kind heuristic --opponent-policy ai/artifacts/heuristic_policy.json
.venv/bin/python -m ai.puffer_kingdomino.distill_bakeoff --samples 100000 --games 1000 --seed 123 --epochs 4
.venv/bin/python -m ai.puffer_kingdomino.teacher_dataset --output ai/artifacts/datasets/search_teacher_scores_mixed_obs_v2_100k.npz --samples 100000 --seed 123 --teacher-kind search --teacher-policy ai/artifacts/heuristic_policy.json --search-depth 2 --search-breadth 6 --rollout mixed
.venv/bin/python -m ai.puffer_kingdomino.distill_bakeoff --samples 100000 --games 1000 --seed 123 --epochs 4 --dataset ai/artifacts/datasets/search_teacher_scores_mixed_obs_v2_100k.npz --report ai/artifacts/distill_bakeoff_scores_mixed_obs_v2_report.json --rollout mixed --objective hybrid
.venv/bin/python -m ai.puffer_kingdomino.candidate_ppo --steps 300000 --seed 123 --init-policy ai/artifacts/distilled_search_teacher_scores_mixed_obs_v2_100k_candidate_dot_hybrid_100000_123.pt --output ai/artifacts/ppo_candidate_mixed_obs_v2_300k.pt --opponent-kind heuristic --opponent-policy ai/artifacts/heuristic_policy.json --eval-every 50000 --eval-games 200 --report ai/artifacts/ppo_candidate_mixed_obs_v2_300k.json
.venv/bin/python -m ai.puffer_kingdomino.candidate_ppo --steps 1000000 --seed 123 --init-policy ai/artifacts/distilled_search_teacher_scores_mixed_obs_v2_100k_candidate_dot_hybrid_100000_123.pt --output ai/artifacts/ppo_candidate_obs_v2_1m.pt --opponent-curriculum random greedy heuristic --opponent-policy ai/artifacts/heuristic_policy.json --value-warmup-steps 50000 --eval-every 50000 --eval-games 200 --eval-opponents random greedy heuristic --report ai/artifacts/ppo_candidate_obs_v2_1m.json
.venv/bin/python -m ai.puffer_kingdomino.policy_diagnostic --policy-kind candidate --policy ai/artifacts/distilled_search_teacher_scores_mixed_obs_v2_100k_candidate_dot_hybrid_100000_123.pt --reference-kind greedy --opponent-kind greedy --games 1000 --seed 456
```

The benchmark reports a recorded pre-optimization native baseline and the
current optimized rollout path. On the local reference run for this pass:

- recorded native baseline: about `31k` steps/sec
- native compatibility path: about `132k` steps/sec
- optimized native rollout: about `216k` steps/sec
- 64-env native rollout loop: about `214k` steps/sec

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
  It supports the historical dot scorer and an experimental
  `--model-type interaction` scorer.
- `factorized`: scores legal candidates from compact action-component logits.

Datasets and neural checkpoints now carry `observation_version=2`. This version
fixes an important representation bug from the earlier experiments: empty board
cells and castle cells were both encoded as zero, so neural policies could not
directly see the castle. Old v1 datasets/checkpoints are useful for historical
comparison only; regenerate teacher data before training new neural policies.

`encoding_contract_test` is a wider executable audit of the representation. It
checks every placement action encode/decode round trip, Python/native raw and
scaled observations, masks, legal-action buffers, candidate feature tables, and
a tiny generated teacher dataset. This audit caught a second subtle bug: the
fast native legal-action path could choose a different duplicate-equivalent
placement action id than the canonical Python/JS path because anchor candidates
were not sorted before deduplication. The native fast path now sorts candidates
using the canonical `(distance, y, x)` order. Any local datasets generated before
that fix, including early observation-v2 datasets, should be regenerated before
serious training.

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

### Distillation Bakeoff Notes

A 100k-sample depth-2 search-teacher bakeoff is now reproducible with
`distill_bakeoff`. Local reference runs with 1000 seat-swapped eval games showed
that the distilled policies are legal and beat random reliably, but are not yet
competitive with greedy:

- Teacher-rollout dataset: validation accuracy around `65-67%`; best greedy
  result was factorized at `6.3%` win rate, with a mean margin around `-37.7`.
- Mixed-rollout dataset: validation accuracy around `62-64%`; best greedy
  result was flat at `7.6%` win rate, with a mean margin around `-36.0`.
- A 20-epoch flat run on the mixed dataset did not improve gameplay
  (`6.6%` vs greedy), so this is not just undertraining.
- A 50k-step PPO smoke continuation from the best mixed flat checkpoint stayed
  in the same band (`6.6%` vs greedy, `81.6%` vs random).
- A v1 dataset now stores every legal candidate's teacher score/rank, enabling
  soft/hybrid distillation from the teacher preference landscape instead of only
  hard chosen-action labels.
- A 100k mixed-rollout hybrid run improved the best random result and score
  margin a little, but still only reached `7.5%` vs greedy with the flat head.
- PPO now scores full learner decision transitions, including the opponent
  response before the next learner turn. A 300k flat PPO continuation reached
  `7.8%` vs greedy and `83.0%` vs random.
- Candidate-action PPO runs over legal candidates directly and is faster
  locally, around `4.9k` learner decisions/sec in the 300k reference run, but
  the first 300k continuation did not improve over distillation (`6.9%` vs
  greedy, `79.3%` vs random).
- Candidate PPO now supports GAE, value-only warmup, linear opponent
  curriculum, periodic fair-eval checkpoints, best-checkpoint saving, and JSON
  run reports. This is the shape we want before spending on a 1M-step run.
- The first 1M-step candidate PPO run completed legally with zero illegal
  actions in about `318s` (`3.1k` learner decisions/sec). It used 50k value
  warmup, random/greedy/heuristic curriculum, and eval every 50k steps. The best
  checkpoint was at about 200k learner decisions and reached `7.3%` vs greedy,
  `78.5%` vs random, and `3.1%` vs the weighted heuristic over 1000-game fair
  evals. The final checkpoint was similar at `6.9%` vs greedy.
- Observation v2 was then introduced to make the castle visible in neural board
  features. A fresh 100k mixed search-teacher dataset generated at about `666`
  samples/sec before the canonical-action audit. The v2 dot candidate hybrid
  distillation reached `62.3%`
  validation accuracy and evaluated at `78.3%` vs random, `6.9%` vs old greedy,
  and `3.0%` vs weighted heuristic over 1000 seat-swapped games. A 10k candidate
  PPO continuation initialized from this v2 checkpoint completed with zero
  illegal actions. The fix was necessary for representation correctness, but it
  did not by itself break the greedy ceiling. Regenerate this dataset/checkpoint
  after the canonical-action fix before treating it as a serious training base.

The practical takeaway: plain hard-label behavioral cloning from a search
teacher is enough to learn "reasonable random-beating play", but not enough to
inherit the teacher's strategic strength. The next promising route is to train
from richer teacher information: score/rank regression or pairwise ranking over
legal candidates, then use PPO with a stronger value/advantage setup. The first
candidate PPO trainer is now in place, but its early results suggest we need
better reward/advantage estimation, a value warm start, and probably opponent
curriculum or self-play before additional million-step runs are likely to pay
off. Since the 1M run plateaued near the distilled baseline, the next likely
model-side step is a richer state encoder or decomposed draft/place heads rather
than simply extending this same run.

`policy_diagnostic` breaks policy strength down by phase. The repeated
`~7%`-vs-greedy result appears to be a placement-policy ceiling, not an eval
artifact:

- Greedy vs greedy is balanced under seat-swapped eval.
- The weighted heuristic still beats greedy cleanly.
- Random is only about `1%` vs greedy, so `~7%` is not a floor.
- Distilled and PPO candidate policies match greedy's draft pick about `99.6%`
  of the time.
- The same policies match greedy placement only about `33%` of the time and put
  the selected placement in greedy's top three about `62%` of the time.
- Replacing only the neural draft with greedy barely matters; replacing only the
  neural placement with greedy moves the policy back near greedy-vs-greedy.

Rich candidate features are the first fix for that ceiling. The historical
candidate head used only static action-id features: draft slot, orientation,
coordinate, anchor end, and distance. `--feature-mode rich` adds
state-conditioned candidate features for placement and drafting:

- current phase/player/score context
- domino terrain and crown features
- draft-time placement mobility for each draft candidate
- immediate placement score delta
- local same-terrain and castle contacts
- connected-region size and crown context
- board expansion and distance from the castle

This gives the candidate policy direct access to the placement constraints that
should eventually influence drafting. A fresh 20k mixed depth-2 search-teacher
probe after the canonical-action fix produced an interaction candidate policy
with about `83%` validation top-choice accuracy. In a small 100-game diagnostic
against greedy, placement agreement rose to about `59%`, greedy-draft plus rich
placement won about `62%`, and the full rich policy won about `61%`. A separate
200-game seat-swapped eval from seed `789` landed at `55%` vs greedy with a
mean score margin of `+3.8`. That is not yet a final statistically stable
policy, but it strongly suggests the previous plateau was representation-bound.

The current rich feature builder is Python-side and computes local placement
consequences from observations. It is good enough for proof and short PPO
smokes, but it is slower than static features. Before a large rich PPO run, move
the hot feature calculations into native/vectorized code or add a cached dataset
feature path.

This points to the current action representation and candidate scorer as the
systemic bottleneck. Placement candidates only expose generic action ids
(`draft slot`, `orientation`, `x`, `y`, `anchor end`) while the model must infer
local terrain/crown consequences indirectly from a flat board vector. The next
serious neural step should add placement-specific candidate features or a local
board/action encoder: placed terrain/crowns, matching-edge counts, immediate
score delta, board expansion, castle contact, region size/crown potential, and
possibly separate draft/place heads.

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
