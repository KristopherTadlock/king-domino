# What is this project?

King domino is a board game where 2 - 4 players compete to build the best kingdom by drafting and placing dominos. A board is scored by finding all connectd areas, multiplying the number of tiles in the area by the number of crowns, and summing it all up. Who ever has the highest scoring kingdom wins!

## How to start the project

1. Clone the repository
2. Install dependencies with `npm install` [not neccesary since we commit node modules]
3. Start the development server with `npm start`

## How to play [in the works]

1. Click on a tile to select it
2. Click on a tile to rotate it
3. Click on a space to place the tile

## How to test

1. Run `npm test`
2. With the multiplayer server running on port 8081, run `npm run test:ws`
3. Run `npm run perf` to launch a temporary local server plus headless Chrome and measure the late-game placement interaction budget.
4. Run `npm run ai:eval -- --policy=sharp --opponent=challenger --games=500 --seed=123` to compare browser AI profiles with seat-swapped seeds.

The performance harness defaults to the `late-placement` scenario. It builds a deterministic late-game board, measures local placement cycling and rotation, and fails if those interactions accidentally rebuild the full board or exceed the current CPU budget. Frame cadence is reported as telemetry because headless software WebGL varies a lot by machine. Use `npm run perf -- --scenario=playthrough` for a broader draft/place playthrough trace that reports action timings without applying the late-placement budgets.

## Browser AI

Hotseat can run against the browser AI with `?hotseat=1&players=2&ai=1`. The lobby exposes the same path through Play vs AI, with `casual`, `challenger`, and `sharp` profiles. `casual` uses the in-game advisor, while `challenger` and `sharp` load the browser policy artifact and add difficulty-specific draft and placement heuristics.

The AI is quiet by default. Add `aiTrace=1` to keep structured traces available in the console through `kingdominoAiTrace()` and `kingdominoAiTraces()`. Add `aiDebug=1` to also print each decision. Traces include the chosen action, top candidates, model score, heuristic adjustment, score components, and a short reason.

For diagnostics, `npm run ai:eval` supports ablation suffixes:

```sh
npm run ai:eval -- --policy=sharp:model --opponent=challenger --games=100
npm run ai:eval -- --policy=sharp:draft --opponent=challenger --games=100
npm run ai:eval -- --policy=sharp:placement --opponent=challenger --games=100
```

## How to run the multiplayer harness

1. Start the multiplayer server with `PORT=8081 npm run start-mp`
2. Open `http://127.0.0.1:8081/multiplayer-harness.html`
3. Use New Room to reset both local browser clients into the same fresh room

## How to play online locally

1. Start the multiplayer server with `PORT=8081 npm run start-mp`
2. Open `http://127.0.0.1:8081`
3. Create an online game, copy the invite link, and send that link to the second player
4. Or paste a room code or invite link into the Join Game field

## How to contribute

1. Fork the repository
2. Create a new branch
3. Make your changes
4. Submit a pull request

## How to report a bug

1. Create an issue
2. Describe the bug
3. Describe how to reproduce the bug
4. Describe the expected behavior
5. Describe the actual behavior

## How to request a feature

1. Create an issue
2. Describe the feature
3. Describe the use case
4. Describe the expected behavior
5. Describe the actual behavior

## Hot to run bot

1. Run `npm run start-bot`
