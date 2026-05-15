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
- Profiling benchmark for Python, native compatibility, optimized native, and
  multi-env native rollout paths.

The current trainer uses imitation learning from the native greedy expert. This
is not full PPO yet, but it is a real Torch train/eval/export path and uses the
same observation/action-mask contract that PPO will use next.

## Commands

```sh
.venv/bin/python -m ai.puffer_kingdomino.puffer_smoke --steps 200 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.random_rollout --games 1000 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.parity_test
.venv/bin/python -m ai.puffer_kingdomino.benchmark --steps 100000 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.train --steps 1000000 --seed 123
.venv/bin/python -m ai.puffer_kingdomino.train --steps 20000 --seed 123 --output /tmp/kingdomino-profile.pt --profile
.venv/bin/python -m ai.puffer_kingdomino.eval --policy ai/artifacts/latest.pt --games 200 --seed 456
.venv/bin/python -m ai.puffer_kingdomino.eval --policy ai/artifacts/latest.pt --games 200 --seed 456 --opponent greedy
.venv/bin/python -m ai.puffer_kingdomino.export_policy --policy ai/artifacts/latest.pt --output ai/artifacts/browser_policy.json
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

For browser play against the current executable policy:

```sh
node server.js
```

Then open:

```text
http://127.0.0.1:8080/?hotseat=1&seed=123&p1=Human&p2=AI&ai=1
```

## Action Space

- `0..3`: draft slots.
- placement actions: draft slot, orientation, anchor coordinate, anchor end.
- final action: skip, legal only when no placement option exists.

The action mask is part of every observation.

## Known Gaps

- Full PPO is still outstanding. The current learning path is Torch imitation
  of the native greedy expert.
- The first PufferLib adapter is wired as a single learning agent against a
  random opponent.
- The trained policy beats random play but is not yet competitive with the
  greedy expert.
- 3-player and 4-player modes are intentionally out of scope for this milestone.
