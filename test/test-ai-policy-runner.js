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

it('browser AI policy should complete a legal two-player hotseat game', () => {
  const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
  game.setGroupedPlacementTurns(true);
  game.start(['Blue', 'Green']);

  let steps = 0;
  while (!game.isGameOver && steps < 300) {
    const activePlayer = game.state === GameState.DRAFT
      ? game.currentPickingPlayerIndex
      : game.currentPlacingPlayerIndex;
    const action = runner.chooseAction(game, activePlayer);
    assert(Boolean(action));

    if (action.type === 'pickDraft') {
      game.pickDraft(action.payload.index);
    } else if (action.type === 'skip') {
      const result = game.skipPlacementForPlayer(activePlayer);
      assert(result.ok);
    } else if (action.type === 'place') {
      const selected = game.setPlacementSelectionForPlayer(
        activePlayer,
        action.payload.dominoNumber,
        action.payload.orientation,
      );
      assert(selected.ok);
      const result = game.tryPlaceDominoAtForPlayer(
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

  assert(game.isGameOver);
  assert(steps === 96);
  assert(game.players.every((player) => player.board.score >= 0));
});
