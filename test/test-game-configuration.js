import { it, assert } from './test-framework.js';
import { GameConfiguration } from '../classes/game-configuration.js';

(function() {
    let config = new GameConfiguration(2);
    it('should create a default game configuration for two players', () => {
        assert(config.numPlayers === 2);
        assert(config.middleCastleRule === false);
        assert(config.expandedBoardSize === false);
    });
    config = new GameConfiguration(3);
    it('should create a default game configuration for three players', () => {
        assert(config.numPlayers === 3);
    });
    config = new GameConfiguration(4);
    it('should create a default game configuration for four players', () => {
        assert(config.numPlayers === 4);
    });
    config = new GameConfiguration(5);
    const config2 = new GameConfiguration(1);
    it('should handle nonsense for numPlayers', () => {
        assert(config.numPlayers === 4);
        assert(config2.numPlayers === 2);
    });
    config = new GameConfiguration(2, true);
    it('should toggle middle castle rule to true', () => {
        assert(config.middleCastleRule === true);
    });
    config = new GameConfiguration(2, false, true);
    it('should toggle expanded board size to true', () => {
        assert(config.expandedBoardSize === true);
    });
})();