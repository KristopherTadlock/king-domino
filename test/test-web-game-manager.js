import { it, assert } from './test-framework.js';
import { GameConfiguration } from '../classes/game-configuration.js';
import { WebGameManager } from '../classes/web-game-manager.js';

(function() {
  it('should pad missing web player names to configured player count', () => {
    const game = new WebGameManager(new GameConfiguration(2), 123);
    game.start(['Codex']);

    assert(game.players.length === 2);
    assert(game.players[0].name === 'Codex');
    assert(game.players[1].name === 'Player 2');
    assert(game.pickOrder.every((idx) => idx === 0 || idx === 1));
  });
})();
