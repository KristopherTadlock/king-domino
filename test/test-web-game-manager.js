import { it, assert } from './test-framework.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { WebGameManager } from '../classes/web-game-manager.js';
import { DominoPoolManager } from '../classes/domino-pool-manager.js';
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

function placeFirstAvailableDomino(game) {
  const options = game.getCurrentPlacementOptions();
  if (!options.length) return game.skipCurrentPlacement();

  const option = options[0];
  game.setCurrentPlacementSelection(option.dominoNumber, option.orientation);
  return game.tryPlaceCurrentDominoAt(option.x, option.y, option.anchorEnd);
}

function placeFirstAvailableDominoForPlayer(game, playerIndex) {
  const options = game.getCurrentPlacementOptionsForPlayer(playerIndex);
  if (!options.length) return game.skipPlacementForPlayer(playerIndex);

  const option = options[0];
  game.setPlacementSelectionForPlayer(playerIndex, option.dominoNumber, option.orientation);
  return game.tryPlaceDominoAtForPlayer(playerIndex, option.x, option.y, option.anchorEnd);
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

  it('should expose remaining domino numbers for deck planning UI', () => {
    const game = new WebGameManager(new GameConfiguration(2), 123);
    game.start(['Codex', 'Helper']);

    const draftNumbers = game.currentDraft.map((slot) => slot.domino.number);
    const remainingNumbers = game.remainingDominoNumbers;
    const deckNumbers = DominoPoolManager.getStartingDominoPool().map((domino) => domino.number);
    const visibleNumbers = new Set([...draftNumbers, ...remainingNumbers]);

    assert(draftNumbers.length === 4);
    assert(remainingNumbers.length === deckNumbers.length - draftNumbers.length);
    assert(draftNumbers.every((number) => !remainingNumbers.includes(number)));
    assert(deckNumbers.every((number) => visibleNumbers.has(number)));
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

  it('should set placement selection by absolute domino and orientation', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);
    for (const index of [0, 1, 2, 3]) game.pickDraft(index);

    const options = game.getCurrentPlacementOptions();
    const current = game.currentPlacingDraftedTile;
    const rotated = options.find((option) =>
      option.dominoNumber === current.domino.number
      && option.orientation !== current.domino.orientation
    ) ?? options.find((option) => option.orientation !== current.domino.orientation);

    assert(rotated);

    const first = game.setCurrentPlacementSelection(rotated.dominoNumber, rotated.orientation);
    assert(first.ok);
    assert(game.currentPlacingDraftedTile.domino.number === rotated.dominoNumber);
    assert(game.currentPlacingDraftedTile.domino.orientation === rotated.orientation);

    const second = game.setCurrentPlacementSelection(rotated.dominoNumber, rotated.orientation);
    assert(second.ok);
    assert(game.currentPlacingDraftedTile.domino.number === rotated.dominoNumber);
    assert(game.currentPlacingDraftedTile.domino.orientation === rotated.orientation);

    const other = options.find((option) =>
      option.dominoNumber !== rotated.dominoNumber
      && option.orientation !== rotated.orientation
    ) ?? options.find((option) => option.dominoNumber !== rotated.dominoNumber);

    assert(other);

    const third = game.setCurrentPlacementSelection(other.dominoNumber, other.orientation);
    assert(third.ok);
    assert(game.currentPlacingDraftedTile.domino.number === other.dominoNumber);
    assert(game.currentPlacingDraftedTile.domino.orientation === other.orientation);
  });

  it('should allow multiplayer players to place out of placement order', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);
    for (const index of [0, 1, 2, 3]) game.pickDraft(index);

    assert(game.state.description === 'place');
    assert(game.currentPlacingPlayerIndex === 0);
    assert(game.getCurrentPlacingChoicesForPlayer(0).length === 2);
    assert(game.getCurrentPlacingChoicesForPlayer(1).length === 2);

    const option = game.getCurrentPlacementOptionsForPlayer(1)[0];
    assert(option);
    game.setPlacementSelectionForPlayer(1, option.dominoNumber, option.orientation);
    const result = game.tryPlaceDominoAtForPlayer(1, option.x, option.y, option.anchorEnd);

    assert(result.ok);
    assert(game.state.description === 'place');
    assert(game.currentPlacingPlayerIndex === 0);
    assert(game.getCurrentPlacingChoicesForPlayer(0).length === 2);
    assert(game.getCurrentPlacingChoicesForPlayer(1).length === 1);
  });

  it('should start the next draft after all non-blocking placements finish', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);
    for (const index of [0, 1, 2, 3]) game.pickDraft(index);

    for (const playerIndex of [1, 0, 1, 0]) {
      assert(game.state.description === 'place');
      const result = placeFirstAvailableDominoForPlayer(game, playerIndex);
      assert(result.ok);
    }

    assert(game.state.description === 'draft');
    assert(game.round === 2);
  });

  it('should discard the unclaimed draft tile in three-player games', () => {
    const game = new WebGameManager(new GameConfiguration(3, false, false), 123);
    game.start(['Codex', 'Helper', 'Scout']);

    assert(game.players.length === 3);
    assert(game.players.every((player) => player.board.maxBoardSize === 5));
    assert(game.pickOrder.length === 3);
    assert(new Set(game.pickOrder).size === 3);

    for (const index of [0, 1, 2]) game.pickDraft(index);

    assert(game.state.description === 'place');
    assert(game.currentDraft.filter((slot) => slot.player != null).length === 3);
    assert(game.currentDraft.filter((slot) => slot.player == null && slot.placed).length === 1);
    assert(game.placeOrder.length === 3);
    assert(new Set(game.placeOrder).size === 3);

    for (const playerIndex of game.placeOrder) {
      assert(game.getCurrentPlacingChoicesForPlayer(playerIndex).length === 1);
      const result = placeFirstAvailableDominoForPlayer(game, playerIndex);
      assert(result.ok);
    }

    assert(game.state.description === 'draft');
    assert(game.round === 2);
    assert(game.pickOrder.length === 3);
  });

  it('should support one draft pick and placement per player in four-player games', () => {
    const game = new WebGameManager(new GameConfiguration(4, false, false), 123);
    game.start(['Codex', 'Helper', 'Scout', 'Guide']);

    assert(game.players.length === 4);
    assert(game.players.every((player) => player.board.maxBoardSize === 5));
    assert(game.pickOrder.length === 4);
    assert(new Set(game.pickOrder).size === 4);

    for (const index of [0, 1, 2, 3]) game.pickDraft(index);

    assert(game.state.description === 'place');
    assert(game.currentDraft.every((slot) => slot.player != null));
    assert(game.placeOrder.length === 4);
    assert(new Set(game.placeOrder).size === 4);

    for (const playerIndex of game.placeOrder) {
      assert(game.getCurrentPlacingChoicesForPlayer(playerIndex).length === 1);
      const result = placeFirstAvailableDominoForPlayer(game, playerIndex);
      assert(result.ok);
    }

    assert(game.state.description === 'draft');
    assert(game.round === 2);
    assert(game.pickOrder.length === 4);
  });

  it('should expose forced draft picks when the other two-player king has no choice left', () => {
    const game = new WebGameManager(new GameConfiguration(2, false, true), 123);
    game.start(['Codex', 'Helper']);

    for (const index of [0, 2, 1, 3]) game.pickDraft(index);
    while (game.state.description === 'place') {
      const result = placeFirstAvailableDomino(game);
      assert(result.ok);
    }

    assert(game.state.description === 'draft');
    assert(game.pickOrder.join(',') === '0,0,1,1');
    assert(game.forcedDraftIndex === null);

    game.pickDraft(0);
    assert(game.forcedDraftIndex === null);

    game.pickDraft(1);
    assert(game.currentPickingPlayerIndex === 1);
    assert(game.forcedDraftIndex === 2);

    game.pickDraft(game.forcedDraftIndex);
    assert(game.forcedDraftIndex === 3);
  });
})();
