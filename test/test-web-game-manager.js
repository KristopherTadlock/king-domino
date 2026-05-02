import { it, assert } from './test-framework.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { WebGameManager } from '../classes/web-game-manager.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { EdgeOffset } from '../classes/enums/edges.js';

function projectedPlacementKey(game, option) {
  return [
    option.dominoNumber,
    ...projectedPlacementCells(game, option).map((cell) => `${cell.x},${cell.y}:${cell.landscape}:${cell.crowns}`),
  ].join('|');
}

function projectedPlacementCells(game, option) {
  const drafted = game.currentDraft.find((slot) => slot.domino.number === option.dominoNumber);
  const domino = drafted.domino;
  const originalOrientation = domino.orientation;

  try {
    while (domino.orientation !== option.orientation) domino.rotate();

    const connectedEdge = domino.getConnectedEdge(option.anchorEnd);
    const offset = EdgeOffset.MAP_EDGE_TO_OFFSET(connectedEdge);
    const anchorCoord = { x: option.x, y: option.y };
    const otherCoord = { x: option.x + offset.x, y: option.y + offset.y };
    const leftCoord = option.anchorEnd === DominoEnd.LEFT ? anchorCoord : otherCoord;
    const rightCoord = option.anchorEnd === DominoEnd.RIGHT ? anchorCoord : otherCoord;

    const cells = [
      {
        x: leftCoord.x,
        y: leftCoord.y,
        landscape: domino.leftEnd.landscape.description,
        crowns: domino.leftEnd.crowns,
      },
      {
        x: rightCoord.x,
        y: rightCoord.y,
        landscape: domino.rightEnd.landscape.description,
        crowns: domino.rightEnd.crowns,
      },
    ].sort((a, b) => a.x - b.x || a.y - b.y);

    return cells;
  } finally {
    while (domino.orientation !== originalOrientation) domino.rotate();
  }
}

function countPlacementOptionsByCell(game, options) {
  const byCell = new Map();
  for (const option of options) {
    for (const cell of projectedPlacementCells(game, option)) {
      const key = `${cell.x},${cell.y}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(option);
    }
  }
  return byCell;
}

(function() {
  it('should pad missing web player names to configured player count', () => {
    const game = new WebGameManager(new GameConfiguration(2), 123);
    game.start(['Codex']);

    assert(game.players.length === 2);
    assert(game.players[0].name === 'Codex');
    assert(game.players[1].name === 'Player 2');
    assert(game.pickOrder.every((idx) => idx === 0 || idx === 1));
  });

  it('should expose valid placement options across choices and rotations without mutating selection', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);

    let guard = 0;
    while (
      (game.round < 10 || game.state.description !== 'place') &&
      !game.isGameOver &&
      guard < 200
    ) {
      guard += 1;

      if (game.state.description === 'draft') {
        const index = game.currentDraft.findIndex((slot) => slot.player == null);
        game.pickDraft(index);
      } else {
        const options = game.getCurrentPlacementOptions();
        if (!options.length) {
          game.skipCurrentPlacement();
          continue;
        }

        const option = options[0];
        game.selectCurrentPlacementDomino(option.dominoNumber);
        for (let i = 0; i < option.rotationSteps; i++) game.rotateCurrentDomino();
        game.tryPlaceCurrentDominoAt(option.x, option.y, option.anchorEnd);
      }
    }

    assert(game.round === 10);
    assert(game.state.description === 'place');
    assert(game.currentPlacingDraftedTile.domino.number === 7);

    const beforeNumber = game.currentPlacingDraftedTile.domino.number;
    const beforeOrientation = game.currentPlacingDraftedTile.domino.orientation;
    const options = game.getCurrentPlacementOptions();
    const optionNumbers = new Set(options.map((option) => option.dominoNumber));
    const rotatedCurrentDominoOption = options.some((option) =>
      option.dominoNumber === 7 && option.rotationSteps !== 0
    );

    assert(options.length > 0);
    assert(rotatedCurrentDominoOption);
    assert(optionNumbers.has(21));
    assert(new Set(options.map((option) => projectedPlacementKey(game, option))).size === options.length);
    assert(game.currentPlacingDraftedTile.domino.number === beforeNumber);
    assert(game.currentPlacingDraftedTile.domino.orientation === beforeOrientation);
    assert(game.canSkipCurrentPlacement() === false);
  });

  it('should keep both drafted domino choices in castle-adjacent placement cells', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);
    for (const index of [0, 1, 2, 3]) game.pickDraft(index);

    assert(game.state.description === 'place');
    assert(game.getCurrentPlacingChoices().map((choice) => choice.domino.number).join(',') === '15,40');

    const options = game.getCurrentPlacementOptions();
    const byCell = countPlacementOptionsByCell(game, options);

    for (const cell of ['-1,0', '0,-1', '0,1', '1,0']) {
      const cellOptions = byCell.get(cell) ?? [];
      assert(cellOptions.length === 8);
      assert(cellOptions.filter((option) => option.dominoNumber === 15).length === 4);
      assert(cellOptions.filter((option) => option.dominoNumber === 40).length === 4);
    }
  });
})();
