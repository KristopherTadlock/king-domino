import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIPolicyRunner } from '../classes/ai-policy-runner.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { GameState } from '../classes/enums/game-state.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { WebGameManager } from '../classes/web-game-manager.js';
import { mulberry32 } from '../classes/utils/rng.js';

globalThis.fetch = async (url) => {
  try {
    const file = resolve(process.cwd(), String(url).replace(/^\//, ''));
    const text = await readFile(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

function parseArgs(argv) {
  const args = {
    policy: 'sharp',
    opponent: 'challenger',
    games: 500,
    seed: 123,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'games' || key === 'seed') args[key] = Number.parseInt(value, 10);
    else args[key] = value;
  }
  args.games = Number.isFinite(args.games) && args.games > 0 ? args.games : 500;
  args.seed = Number.isFinite(args.seed) ? args.seed : 123;
  return args;
}

async function createAgent(kind, seed) {
  if (kind === 'random') {
    const rng = mulberry32(seed >>> 0);
    return {
      kind,
      chooseAction(game, playerIndex) {
        const actions = legalGameActions(game, playerIndex);
        if (!actions.length) return null;
        return actions[Math.floor(rng() * actions.length)];
      },
    };
  }

  const runner = new AIPolicyRunner();
  if (kind === 'heuristic') {
    runner.setDifficulty('challenger');
    await runner.load('ai/artifacts/heuristic_policy.json');
  } else {
    runner.setDifficulty(kind);
    await runner.load();
  }
  return {
    kind,
    chooseAction(game, playerIndex) {
      return runner.chooseAction(game, playerIndex);
    },
  };
}

function legalGameActions(game, playerIndex) {
  if (game.state === GameState.DRAFT) {
    if (game.currentPickingPlayerIndex !== playerIndex) return [];
    return (game.currentDraft ?? [])
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot?.player == null && !slot?.placed)
      .map(({ index }) => ({ type: 'pickDraft', payload: { index, ai: true } }));
  }

  if (game.state !== GameState.PLACE) return [];
  const actions = (game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? []).map((option) => ({
    type: 'place',
    payload: {
      ai: true,
      dominoNumber: option.dominoNumber,
      orientation: option.orientation,
      x: option.x,
      y: option.y,
      anchorEnd: option.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT',
      placeId: `eval-${playerIndex}-${option.dominoNumber}-${option.orientation}-${option.x}-${option.y}`,
    },
  }));
  if (!actions.length && game.canSkipPlacementForPlayer?.(playerIndex)) {
    actions.push({ type: 'skip', payload: { ai: true } });
  }
  return actions;
}

function applyAction(game, playerIndex, action) {
  if (!action) return false;
  if (action.type === 'pickDraft') {
    game.pickDraft(action.payload.index);
    return true;
  }
  if (action.type === 'skip') {
    return Boolean(game.skipPlacementForPlayer(playerIndex)?.ok);
  }
  if (action.type === 'place') {
    const selected = game.setPlacementSelectionForPlayer(
      playerIndex,
      action.payload.dominoNumber,
      action.payload.orientation,
    );
    if (!selected.ok) return false;
    return Boolean(game.tryPlaceDominoAtForPlayer(
      playerIndex,
      action.payload.x,
      action.payload.y,
      action.payload.anchorEnd === 'RIGHT' ? DominoEnd.RIGHT : DominoEnd.LEFT,
    )?.ok);
  }
  return false;
}

function activePlayerIndex(game) {
  return game.state === GameState.DRAFT
    ? game.currentPickingPlayerIndex
    : game.currentPlacingPlayerIndex;
}

async function playGame(seed, agents, policySeat) {
  const game = new WebGameManager(new GameConfiguration(2, false, true), seed);
  game.setGroupedPlacementTurns(true);
  game.start(['Policy', 'Opponent']);

  let steps = 0;
  let illegal = 0;
  while (!game.isGameOver && steps < 300) {
    const playerIndex = activePlayerIndex(game);
    const action = agents[playerIndex].chooseAction(game, playerIndex);
    if (!applyAction(game, playerIndex, action)) {
      illegal += 1;
      break;
    }
    steps += 1;
  }

  const scores = game.players.map((player) => player.board.score ?? 0);
  const margin = scores[policySeat] - scores[1 - policySeat];
  return {
    seed,
    steps,
    illegal,
    completed: game.isGameOver,
    scores,
    policySeat,
    margin,
    result: margin > 0 ? 'win' : margin < 0 ? 'loss' : 'tie',
  };
}

function summarize(results, policy, opponent, seed) {
  const completed = results.filter((result) => result.completed && !result.illegal);
  const wins = completed.filter((result) => result.result === 'win').length;
  const losses = completed.filter((result) => result.result === 'loss').length;
  const ties = completed.filter((result) => result.result === 'tie').length;
  const illegal = results.reduce((sum, result) => sum + result.illegal, 0);
  const margins = completed.map((result) => result.margin);
  const policyScores = completed.map((result) => result.scores[result.policySeat]);
  const opponentScores = completed.map((result) => result.scores[1 - result.policySeat]);
  const mean = (values) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const winRate = completed.length ? wins / completed.length : 0;
  const variance = completed.length
    ? winRate * (1 - winRate) / completed.length
    : 0;
  const standardError = Math.sqrt(variance);
  return {
    policy,
    opponent,
    seed,
    requestedGames: results.length,
    completedGames: completed.length,
    wins,
    losses,
    ties,
    winRate,
    tieRate: completed.length ? ties / completed.length : 0,
    averagePolicyScore: mean(policyScores),
    averageOpponentScore: mean(opponentScores),
    averageMargin: mean(margins),
    illegalOrCrashCount: illegal + results.filter((result) => !result.completed).length,
    winRateStandardError: standardError,
    winRateApprox95Ci: standardError * 1.96,
  };
}

export async function runFairEval(options = {}) {
  const policy = options.policy ?? 'sharp';
  const opponent = options.opponent ?? 'challenger';
  const games = Number.isFinite(options.games) ? options.games : 500;
  const seed = Number.isFinite(options.seed) ? options.seed : 123;
  const pairCount = Math.ceil(games / 2);
  const results = [];
  const policyAgent = await createAgent(policy, seed ^ 0x9e3779b9);
  const opponentAgent = await createAgent(opponent, seed ^ 0x85ebca6b);

  for (let pair = 0; pair < pairCount; pair += 1) {
    const gameSeed = (seed + pair) >>> 0;
    results.push(await playGame(gameSeed, [policyAgent, opponentAgent], 0));

    results.push(await playGame(gameSeed, [opponentAgent, policyAgent], 1));
  }

  return summarize(results.slice(0, pairCount * 2), policy, opponent, seed);
}

function printSummary(summary) {
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  console.log(`Policy ${summary.policy} vs ${summary.opponent}`);
  console.log(`Games: ${summary.completedGames}/${summary.requestedGames} completed, illegal/crash: ${summary.illegalOrCrashCount}`);
  console.log(`Record: ${summary.wins}-${summary.losses}-${summary.ties}`);
  console.log(`Win rate: ${pct(summary.winRate)} ± ${pct(summary.winRateApprox95Ci)} approx 95% CI`);
  console.log(`Average score: ${summary.averagePolicyScore.toFixed(1)} vs ${summary.averageOpponentScore.toFixed(1)}`);
  console.log(`Average margin: ${summary.averageMargin.toFixed(1)}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  const summary = await runFairEval(args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
}
