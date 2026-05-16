import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { it, assert } from './test-framework.js';
import { AIPolicyRunner } from '../classes/ai-policy-runner.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { GameState } from '../classes/enums/game-state.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { WebGameManager } from '../classes/web-game-manager.js';

globalThis.fetch = async (url) => {
  try {
    const file = resolve(process.cwd(), String(url).replace(/^\//, ''));
    const text = await readFile(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  } catch {
    return { ok: false, status: 404, json: async () => null };
  }
};

const runner = new AIPolicyRunner();
await runner.load();

function runBrowserAiGame(seed, difficulty = 'challenger') {
  runner.setDifficulty(difficulty);
  const seededGame = new WebGameManager(new GameConfiguration(2, false, true), seed);
  seededGame.setGroupedPlacementTurns(true);
  seededGame.start(['Blue', 'Green']);

  let steps = 0;
  while (!seededGame.isGameOver && steps < 300) {
    const activePlayer = seededGame.state === GameState.DRAFT
      ? seededGame.currentPickingPlayerIndex
      : seededGame.currentPlacingPlayerIndex;
    const action = runner.chooseAction(seededGame, activePlayer);
    assert(Boolean(action));

    if (action.type === 'pickDraft') {
      seededGame.pickDraft(action.payload.index);
    } else if (action.type === 'skip') {
      const result = seededGame.skipPlacementForPlayer(activePlayer);
      assert(result.ok);
    } else if (action.type === 'place') {
      const selected = seededGame.setPlacementSelectionForPlayer(
        activePlayer,
        action.payload.dominoNumber,
        action.payload.orientation,
      );
      assert(selected.ok);
      const result = seededGame.tryPlaceDominoAtForPlayer(
        activePlayer,
        action.payload.x,
        action.payload.y,
        action.payload.anchorEnd === 'RIGHT' ? DominoEnd.RIGHT : DominoEnd.LEFT,
      );
      assert(result.ok);
    } else {
      assert(false);
    }

    steps += 1;
  }

  return { game: seededGame, steps };
}

it('browser AI policy should complete a legal two-player hotseat game', () => {
  const { game, steps } = runBrowserAiGame(123);
  assert(game.isGameOver);
  assert(steps === 96);
  assert(game.players.every((player) => player.board.score >= 0));
});

it('browser AI difficulty modes should each complete legal games', () => {
  for (const difficulty of ['casual', 'challenger', 'sharp']) {
    const { game, steps } = runBrowserAiGame(124, difficulty);
    assert(runner.difficulty === difficulty);
    assert(game.isGameOver);
    assert(steps === 96);
    assert(game.players.every((player) => player.board.score >= 0));
  }
});

it('browser AI decision trace explains draft and placement choices when enabled', () => {
  runner.setDifficulty('sharp');
  runner.setAblationMode('full');
  runner.setTraceEnabled(true);
  const game = new WebGameManager(new GameConfiguration(2, false, true), 125);
  game.setGroupedPlacementTurns(true);
  game.start(['Blue', 'Green']);

  const draftAction = runner.chooseAction(game, game.currentPickingPlayerIndex);
  assert(draftAction?.type === 'pickDraft');
  assert(runner.lastDecisionTrace?.phase === 'draft');
  assert(runner.lastDecisionTrace?.candidates?.length > 0);
  game.pickDraft(draftAction.payload.index);
  while (game.state === GameState.DRAFT) {
    const playerIndex = game.currentPickingPlayerIndex;
    const action = runner.chooseAction(game, playerIndex);
    game.pickDraft(action.payload.index);
  }

  const playerIndex = game.currentPlacingPlayerIndex;
  const placeAction = runner.chooseAction(game, playerIndex);
  assert(placeAction?.type === 'place' || placeAction?.type === 'skip');
  assert(runner.lastDecisionTrace?.phase === 'place');
  assert(runner.lastDecisionTrace?.chosen?.type === placeAction.type);
  assert(runner.drainDecisionTraces().length >= 2);
  runner.setTraceEnabled(false);
});

it('browser AI ablation mode can disable tactical adjustments', () => {
  runner.setDifficulty('sharp');
  runner.setAblationMode('model');
  runner.setTraceEnabled(true);
  const game = new WebGameManager(new GameConfiguration(2, false, true), 126);
  game.setGroupedPlacementTurns(true);
  game.start(['Blue', 'Green']);

  const action = runner.chooseAction(game, game.currentPickingPlayerIndex);
  assert(action?.type === 'pickDraft');
  assert(runner.ablationMode === 'model');
  assert(runner.lastDecisionTrace?.candidates?.every((candidate) => candidate.adjustment === 0));

  runner.setAblationMode('full');
  runner.setTraceEnabled(false);
});
