import { it, assert } from './test-framework.js';
import { GameAdvisor } from '../classes/game-advisor.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { WebGameManager } from '../classes/web-game-manager.js';
import { DominoPoolManager } from '../classes/domino-pool-manager.js';
import { GameState } from '../classes/enums/game-state.js';
import { Landscapes } from '../classes/enums/landscapes.js';

function domino(number) {
  const found = DominoPoolManager.getStartingDominoPool().find((d) => d.number === number);
  if (!found) throw new Error(`Missing domino ${number}`);
  return found;
}

function slot(number, player = null) {
  return { domino: domino(number), player, placed: false };
}

function fakeDraftGame(currentDraft, board = {}) {
  return {
    state: GameState.DRAFT,
    isGameOver: false,
    currentPickingPlayerIndex: 0,
    currentDraft,
    players: [
      {
        name: 'Codex',
        board: {
          board: {
            '0,0': { landscape: Landscapes.CASTLE, crowns: 0 },
            ...board,
          },
        },
      },
    ],
  };
}

(function() {
  it('should rank only available draft moves with deterministic scores', () => {
    const advisor = new GameAdvisor();
    const game = fakeDraftGame([slot(12), slot(31), slot(42, 0), slot(48)]);

    const ranked = advisor.rankDraftMoves(game);

    assert(ranked.length === 3);
    assert(ranked.every((move) => move.playerIndex === 0));
    assert(ranked.every((move) => game.currentDraft[move.index].player == null));
    assert(ranked[0].score >= ranked[1].score);
    assert(ranked[1].score >= ranked[2].score);
    assert(typeof ranked[0].phrase === 'string' && ranked[0].phrase.length > 0);
    assert(typeof ranked[0].explanation === 'string' && ranked[0].explanation.length > ranked[0].phrase.length);
    assert(advisor.suggestDraftMove(game).index === ranked[0].index);
  });

  it('should value crowns on terrain already growing on the player board', () => {
    const advisor = new GameAdvisor();
    const waterBoard = {
      '1,0': { landscape: Landscapes.WATER, crowns: 1 },
      '2,0': { landscape: Landscapes.WATER, crowns: 0 },
      '3,0': { landscape: Landscapes.WATER, crowns: 0 },
      '4,0': { landscape: Landscapes.WATER, crowns: 0 },
    };
    const game = fakeDraftGame([slot(29), slot(31), slot(24), slot(25)], waterBoard);

    const ranked = advisor.rankDraftMoves(game);

    assert(ranked[0].dominoNumber === 31);
    assert(ranked[0].summary.includes('Fits your board'));
    assert(ranked[0].phrase === 'More water');
    assert(ranked[0].explanation.includes('water'));
  });

  it('should expose placement rankings through the same advisor shape', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);
    for (const index of [0, 1, 2, 3]) game.pickDraft(index);

    const advisor = new GameAdvisor();
    const ranked = advisor.rankPlacementMoves(game, game.currentPlacingPlayerIndex);

    assert(ranked.length > 0);
    assert(ranked[0].score >= ranked[ranked.length - 1].score);
    assert(advisor.suggestPlacementMove(game, game.currentPlacingPlayerIndex).dominoNumber === ranked[0].dominoNumber);
    assert(ranked[0].reasons.some((reason) => reason.label === 'Best initial placement'));
  });

  it('should return no suggestion outside of active draft and placement phases', () => {
    const advisor = new GameAdvisor();
    const game = fakeDraftGame([slot(31)]);

    game.isGameOver = true;

    assert(advisor.suggestDraftMove(game) === null);
    assert(advisor.suggestPlacementMove(game) === null);
  });
})();
