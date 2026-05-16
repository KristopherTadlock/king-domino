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
    policyAblation: 'full',
    opponentAblation: 'full',
    compare: null,
    games: 500,
    seed: 123,
    samples: 0,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, rawKey, value] = match;
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === 'games' || key === 'seed' || key === 'samples') args[key] = Number.parseInt(value, 10);
    else args[key] = value;
  }
  args.games = Number.isFinite(args.games) && args.games > 0 ? args.games : 500;
  args.seed = Number.isFinite(args.seed) ? args.seed : 123;
  args.samples = Number.isFinite(args.samples) && args.samples > 0 ? args.samples : 0;
  return args;
}

function parseAgentSpec(kind, ablation = 'full') {
  const [base, inlineAblation] = String(kind ?? '').split(':');
  return {
    kind: base || 'sharp',
    ablation: inlineAblation || ablation || 'full',
  };
}

async function createAgent(kind, seed, options = {}) {
  const spec = parseAgentSpec(kind, options.ablation);
  if (spec.kind === 'random') {
    const rng = mulberry32(seed >>> 0);
    return {
      kind: spec.kind,
      ablation: spec.ablation,
      chooseAction(game, playerIndex) {
        const actions = legalGameActions(game, playerIndex);
        if (!actions.length) return null;
        return actions[Math.floor(rng() * actions.length)];
      },
      lastTrace() {
        return null;
      },
    };
  }

  const runner = new AIPolicyRunner();
  runner.setAblationMode(spec.ablation);
  runner.setTraceEnabled(Boolean(options.trace));
  if (spec.kind === 'heuristic') {
    runner.setDifficulty('challenger');
    await runner.load('ai/artifacts/heuristic_policy.json');
  } else {
    runner.setDifficulty(spec.kind);
    await runner.load();
  }
  return {
    kind: spec.kind,
    ablation: runner.ablationMode,
    chooseAction(game, playerIndex) {
      return runner.chooseAction(game, playerIndex);
    },
    lastTrace() {
      return runner.lastDecisionTrace;
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

function actionKey(action) {
  if (!action) return 'null';
  if (action.type === 'pickDraft') return `draft:${action.payload?.index}`;
  if (action.type === 'skip') return 'skip';
  if (action.type === 'place') {
    return [
      'place',
      action.payload?.dominoNumber,
      action.payload?.orientation,
      action.payload?.x,
      action.payload?.y,
      action.payload?.anchorEnd,
    ].join(':');
  }
  return action.type ?? 'unknown';
}

function terrainId(landscape) {
  const key = landscape?.description ?? String(landscape);
  return {
    castle: 0,
    wheat: 1,
    pasture: 2,
    water: 3,
    bog: 4,
    forest: 5,
    mine: 6,
  }[key] ?? 0;
}

function cellsForAction(game, playerIndex, action) {
  if (action?.type !== 'place') return [];
  const domino = (game.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? [])
    .find((choice) => choice?.domino?.number === action.payload?.dominoNumber)
    ?.domino;
  if (!domino) return [];
  const orientation = ((Number(action.payload.orientation) % 360) + 360) % 360;
  const offset = {
    0: { x: 1, y: 0 },
    90: { x: 0, y: -1 },
    180: { x: -1, y: 0 },
    270: { x: 0, y: 1 },
  }[orientation] ?? { x: 1, y: 0 };
  const anchor = { x: action.payload.x, y: action.payload.y };
  const other = { x: anchor.x + offset.x, y: anchor.y + offset.y };
  const left = { landscape: domino.leftEnd.landscape, crowns: domino.leftEnd.crowns };
  const right = { landscape: domino.rightEnd.landscape, crowns: domino.rightEnd.crowns };
  return action.payload.anchorEnd === 'RIGHT'
    ? [
      { ...other, ...left },
      { ...anchor, ...right },
    ]
    : [
      { ...anchor, ...left },
      { ...other, ...right },
    ];
}

function scoreBoard(board, extraCells = []) {
  const tiles = new Map();
  for (const [key, tile] of Object.entries(board ?? {})) {
    tiles.set(key, { terrain: terrainId(tile.landscape), crowns: tile.crowns ?? 0 });
  }
  for (const cell of extraCells) {
    tiles.set(`${cell.x},${cell.y}`, { terrain: terrainId(cell.landscape), crowns: cell.crowns ?? 0 });
  }

  const visited = new Set();
  let total = 0;
  for (const [key, tile] of tiles.entries()) {
    if (visited.has(key) || tile.terrain <= 0) continue;
    const stack = [key];
    visited.add(key);
    let count = 0;
    let crowns = 0;
    while (stack.length) {
      const currentKey = stack.pop();
      const current = tiles.get(currentKey);
      count += 1;
      crowns += current.crowns ?? 0;
      const [x, y] = currentKey.split(',').map((value) => Number.parseInt(value, 10));
      for (const neighborKey of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
        if (visited.has(neighborKey)) continue;
        const neighbor = tiles.get(neighborKey);
        if (!neighbor || neighbor.terrain !== tile.terrain) continue;
        visited.add(neighborKey);
        stack.push(neighborKey);
      }
    }
    total += count * crowns;
  }
  return total;
}

function placementDelta(game, playerIndex, action) {
  if (action?.type === 'skip') return 0;
  const cells = cellsForAction(game, playerIndex, action);
  if (!cells.length) return null;
  const board = game.players?.[playerIndex]?.board?.board ?? {};
  return scoreBoard(board, cells) - scoreBoard(board);
}

function bestPlacementDelta(game, playerIndex) {
  const actions = legalGameActions(game, playerIndex).filter((action) => action.type === 'place');
  if (!actions.length) return null;
  let best = -Infinity;
  for (const action of actions) {
    const delta = placementDelta(game, playerIndex, action);
    if (delta != null) best = Math.max(best, delta);
  }
  return Number.isFinite(best) ? best : null;
}

function createDiagnostics() {
  return {
    policyTurns: 0,
    draft: {
      count: 0,
      legalChoices: 0,
      adjustment: 0,
      ownValue: 0,
      bestOpponentValue: 0,
      denialPressure: 0,
    },
    placement: {
      count: 0,
      legalChoices: 0,
      skips: 0,
      immediateDelta: 0,
      bestImmediateDelta: 0,
      immediateDeltaGap: 0,
      bestDeltaPicks: 0,
      adjustment: 0,
      rawShape: 0,
      growthPenalty: 0,
      constraintPressure: 0,
      isolatedCrownPenalty: 0,
      remainingMobilityCount: 0,
      remainingDeadTiles: 0,
      remainingBestScoreDelta: 0,
      openAnchorCount: 0,
      valuableAnchorCount: 0,
    },
    comparison: {
      count: 0,
      differences: 0,
      draftCount: 0,
      draftDifferences: 0,
      placementCount: 0,
      placementDifferences: 0,
      placementDeltaVsComparison: 0,
    },
  };
}

function recordPolicyDecision(diagnostics, game, playerIndex, action, trace, compareAction) {
  diagnostics.policyTurns += 1;
  const phase = game.state === GameState.DRAFT ? 'draft' : 'placement';
  const legalCount = legalGameActions(game, playerIndex).length;
  const chosenCandidate = trace?.candidates?.find((candidate) =>
    actionKey({ type: candidate.action?.type, payload: candidate.action }) === actionKey(action)
  ) ?? trace?.candidates?.[0] ?? null;
  const components = chosenCandidate?.components ?? {};

  if (compareAction) {
    const differs = actionKey(action) !== actionKey(compareAction);
    diagnostics.comparison.count += 1;
    diagnostics.comparison.differences += differs ? 1 : 0;
    if (phase === 'draft') {
      diagnostics.comparison.draftCount += 1;
      diagnostics.comparison.draftDifferences += differs ? 1 : 0;
    } else {
      diagnostics.comparison.placementCount += 1;
      diagnostics.comparison.placementDifferences += differs ? 1 : 0;
      const chosenDelta = placementDelta(game, playerIndex, action);
      const compareDelta = placementDelta(game, playerIndex, compareAction);
      if (chosenDelta != null && compareDelta != null) {
        diagnostics.comparison.placementDeltaVsComparison += chosenDelta - compareDelta;
      }
    }
  }

  if (phase === 'draft') {
    diagnostics.draft.count += 1;
    diagnostics.draft.legalChoices += legalCount;
    diagnostics.draft.adjustment += chosenCandidate?.adjustment ?? 0;
    diagnostics.draft.ownValue += components.ownValue ?? 0;
    diagnostics.draft.bestOpponentValue += components.bestOpponentValue ?? 0;
    diagnostics.draft.denialPressure += components.denialPressure ?? 0;
    return;
  }

  diagnostics.placement.count += 1;
  diagnostics.placement.legalChoices += legalCount;
  if (action?.type === 'skip') diagnostics.placement.skips += 1;
  diagnostics.placement.adjustment += chosenCandidate?.adjustment ?? 0;
  diagnostics.placement.rawShape += components.raw ?? 0;
  diagnostics.placement.growthPenalty += components.growthPenalty ?? 0;
  diagnostics.placement.constraintPressure += components.constraintPressure ?? 0;
  diagnostics.placement.isolatedCrownPenalty += components.isolatedCrownPenalty ?? 0;
  diagnostics.placement.remainingMobilityCount += components.remainingMobilityCount ?? 0;
  diagnostics.placement.remainingDeadTiles += components.remainingDeadTiles ?? 0;
  diagnostics.placement.remainingBestScoreDelta += components.remainingBestScoreDelta ?? 0;
  diagnostics.placement.openAnchorCount += components.openAnchorCount ?? 0;
  diagnostics.placement.valuableAnchorCount += components.valuableAnchorCount ?? 0;

  const chosenDelta = placementDelta(game, playerIndex, action);
  const bestDelta = bestPlacementDelta(game, playerIndex);
  if (chosenDelta != null && bestDelta != null) {
    diagnostics.placement.immediateDelta += chosenDelta;
    diagnostics.placement.bestImmediateDelta += bestDelta;
    diagnostics.placement.immediateDeltaGap += bestDelta - chosenDelta;
    if (chosenDelta === bestDelta) diagnostics.placement.bestDeltaPicks += 1;
  }
}

function compactTrace(trace, action, compareAction, game, playerIndex) {
  const chosenDelta = placementDelta(game, playerIndex, action);
  const compareDelta = compareAction ? placementDelta(game, playerIndex, compareAction) : null;
  const compactCandidates = (trace?.candidates ?? []).slice(0, 3).map((candidate) => ({
    rank: candidate.rank,
    action: candidate.action,
    modelScore: candidate.modelScore,
    adjustment: candidate.adjustment,
    totalScore: candidate.totalScore,
    reason: candidate.reason,
    components: {
      scoreDelta: candidate.components?.scoreDelta,
      raw: candidate.components?.raw,
      ownValue: candidate.components?.ownValue,
      bestOpponentValue: candidate.components?.bestOpponentValue,
      denialPressure: candidate.components?.denialPressure,
      growthPenalty: candidate.components?.growthPenalty,
      constraintPressure: candidate.components?.constraintPressure,
      isolatedCrownPenalty: candidate.components?.isolatedCrownPenalty,
      remainingMobilityCount: candidate.components?.remainingMobilityCount,
      remainingDeadTiles: candidate.components?.remainingDeadTiles,
      remainingBestScoreDelta: candidate.components?.remainingBestScoreDelta,
      openAnchorCount: candidate.components?.openAnchorCount,
      valuableAnchorCount: candidate.components?.valuableAnchorCount,
    },
  }));
  return {
    phase: game.state === GameState.DRAFT ? 'draft' : 'placement',
    chosen: actionKey(action),
    compare: compareAction ? actionKey(compareAction) : null,
    chosenDelta,
    compareDelta,
    traceChosen: trace?.chosen ?? null,
    candidates: compactCandidates,
  };
}

async function playGame(seed, agents, policySeat, options = {}) {
  const game = new WebGameManager(new GameConfiguration(2, false, true), seed);
  game.setGroupedPlacementTurns(true);
  game.start(['Policy', 'Opponent']);

  const diagnostics = createDiagnostics();
  const policyDecisionSamples = [];
  let steps = 0;
  let illegal = 0;
  while (!game.isGameOver && steps < 300) {
    const playerIndex = activePlayerIndex(game);
    const isPolicyTurn = playerIndex === policySeat;
    const compareAction = isPolicyTurn && options.compareAgent
      ? options.compareAgent.chooseAction(game, playerIndex)
      : null;
    const action = agents[playerIndex].chooseAction(game, playerIndex);
    const trace = isPolicyTurn ? agents[playerIndex].lastTrace?.() : null;
    if (isPolicyTurn) {
      recordPolicyDecision(diagnostics, game, playerIndex, action, trace, compareAction);
      if (options.samples > 0 && policyDecisionSamples.length < 16) {
        policyDecisionSamples.push(compactTrace(trace, action, compareAction, game, playerIndex));
      }
    }
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
    diagnostics,
    policyDecisionSamples,
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
  const diagnostics = summarizeDiagnostics(completed.map((result) => result.diagnostics));
  const lossSamples = results
    .filter((result) => result.result === 'loss' && result.policyDecisionSamples?.length)
    .slice(0, 3)
    .map((result) => ({
      seed: result.seed,
      policySeat: result.policySeat,
      scores: result.scores,
      margin: result.margin,
      decisions: result.policyDecisionSamples,
    }));
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
    diagnostics,
    lossSamples,
  };
}

function summarizeDiagnostics(items) {
  const total = createDiagnostics();
  for (const item of items) {
    if (!item) continue;
    total.policyTurns += item.policyTurns ?? 0;
    for (const key of Object.keys(total.draft)) total.draft[key] += item.draft?.[key] ?? 0;
    for (const key of Object.keys(total.placement)) total.placement[key] += item.placement?.[key] ?? 0;
    for (const key of Object.keys(total.comparison)) total.comparison[key] += item.comparison?.[key] ?? 0;
  }
  const avg = (sum, count) => (count ? sum / count : 0);
  return {
    policyTurns: total.policyTurns,
    draft: {
      count: total.draft.count,
      averageLegalChoices: avg(total.draft.legalChoices, total.draft.count),
      averageAdjustment: avg(total.draft.adjustment, total.draft.count),
      averageOwnValue: avg(total.draft.ownValue, total.draft.count),
      averageBestOpponentValue: avg(total.draft.bestOpponentValue, total.draft.count),
      averageDenialPressure: avg(total.draft.denialPressure, total.draft.count),
    },
    placement: {
      count: total.placement.count,
      averageLegalChoices: avg(total.placement.legalChoices, total.placement.count),
      skipRate: avg(total.placement.skips, total.placement.count),
      averageImmediateDelta: avg(total.placement.immediateDelta, total.placement.count),
      averageBestImmediateDelta: avg(total.placement.bestImmediateDelta, total.placement.count),
      averageImmediateDeltaGap: avg(total.placement.immediateDeltaGap, total.placement.count),
      bestImmediateDeltaPickRate: avg(total.placement.bestDeltaPicks, total.placement.count),
      averageAdjustment: avg(total.placement.adjustment, total.placement.count),
      averageRawShape: avg(total.placement.rawShape, total.placement.count),
      averageGrowthPenalty: avg(total.placement.growthPenalty, total.placement.count),
      averageConstraintPressure: avg(total.placement.constraintPressure, total.placement.count),
      averageIsolatedCrownPenalty: avg(total.placement.isolatedCrownPenalty, total.placement.count),
      averageRemainingMobilityCount: avg(total.placement.remainingMobilityCount, total.placement.count),
      averageRemainingDeadTiles: avg(total.placement.remainingDeadTiles, total.placement.count),
      averageRemainingBestScoreDelta: avg(total.placement.remainingBestScoreDelta, total.placement.count),
      averageOpenAnchorCount: avg(total.placement.openAnchorCount, total.placement.count),
      averageValuableAnchorCount: avg(total.placement.valuableAnchorCount, total.placement.count),
    },
    comparison: {
      count: total.comparison.count,
      differenceRate: avg(total.comparison.differences, total.comparison.count),
      draftDifferenceRate: avg(total.comparison.draftDifferences, total.comparison.draftCount),
      placementDifferenceRate: avg(total.comparison.placementDifferences, total.comparison.placementCount),
      averagePlacementDeltaVsComparison: avg(
        total.comparison.placementDeltaVsComparison,
        total.comparison.placementCount,
      ),
    },
  };
}

export async function runFairEval(options = {}) {
  const policySpec = parseAgentSpec(options.policy ?? 'sharp', options.policyAblation);
  const opponentSpec = parseAgentSpec(options.opponent ?? 'challenger', options.opponentAblation);
  const policy = policySpec.ablation === 'full' ? policySpec.kind : `${policySpec.kind}:${policySpec.ablation}`;
  const opponent = opponentSpec.ablation === 'full' ? opponentSpec.kind : `${opponentSpec.kind}:${opponentSpec.ablation}`;
  const games = Number.isFinite(options.games) ? options.games : 500;
  const seed = Number.isFinite(options.seed) ? options.seed : 123;
  const samples = Number.isFinite(options.samples) ? options.samples : 0;
  const pairCount = Math.ceil(games / 2);
  const results = [];
  const policyAgent = await createAgent(policySpec.kind, seed ^ 0x9e3779b9, {
    ablation: policySpec.ablation,
    trace: true,
  });
  const opponentAgent = await createAgent(opponentSpec.kind, seed ^ 0x85ebca6b, {
    ablation: opponentSpec.ablation,
    trace: false,
  });
  const compareSpec = options.compare
    ? parseAgentSpec(options.compare, 'full')
    : opponentSpec.kind === 'random'
      ? null
      : opponentSpec;
  const compareAgent = compareSpec
    ? await createAgent(compareSpec.kind, seed ^ 0xc2b2ae35, {
      ablation: compareSpec.ablation,
      trace: false,
    })
    : null;

  for (let pair = 0; pair < pairCount; pair += 1) {
    const gameSeed = (seed + pair) >>> 0;
    results.push(await playGame(gameSeed, [policyAgent, opponentAgent], 0, { compareAgent, samples }));

    results.push(await playGame(gameSeed, [opponentAgent, policyAgent], 1, { compareAgent, samples }));
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
  console.log(`Placement delta gap: ${summary.diagnostics.placement.averageImmediateDeltaGap.toFixed(2)}; best-delta pick rate: ${pct(summary.diagnostics.placement.bestImmediateDeltaPickRate)}`);
  if (summary.diagnostics.comparison.count) {
    console.log(`Decision diff vs compare: ${pct(summary.diagnostics.comparison.differenceRate)}; placement delta vs compare: ${summary.diagnostics.comparison.averagePlacementDeltaVsComparison.toFixed(2)}`);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs(process.argv.slice(2));
  const summary = await runFairEval(args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
}
