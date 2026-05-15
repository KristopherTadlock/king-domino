import { GameConfiguration } from '../../classes/game-configuration.js';
import { WebGameManager } from '../../classes/web-game-manager.js';

const seed = Number.parseInt(process.argv[2] ?? '123', 10);
const game = new WebGameManager(new GameConfiguration(2, false, true), seed);
game.start(['A', 'B']);

const initial = {
  pickOrder: game.pickOrder,
  currentDraft: game.currentDraft.map((slot) => slot.domino.number),
};

for (let index = 0; index < 4; index += 1) {
  game.pickDraft(index);
}

const player = game.currentPlacingPlayerIndex;
const options = game.getCurrentPlacementOptionsForPlayer(player)
  .map((option) => ({
    dominoNumber: option.dominoNumber,
    orientation: option.orientation,
    x: option.x,
    y: option.y,
    anchorEnd: option.anchorEnd.description === 'right' ? 1 : 0,
  }))
  .sort((a, b) =>
    a.dominoNumber - b.dominoNumber
    || a.orientation - b.orientation
    || a.y - b.y
    || a.x - b.x
    || a.anchorEnd - b.anchorEnd
  );

console.log(JSON.stringify({
  seed,
  initial,
  placeOrder: game.placeOrder,
  currentPlacingPlayerIndex: player,
  options,
}));
