import { it, assert } from './test-framework.js';
import { Domino } from "../classes/domino.js";
import { DominoTile } from "../classes/domino-tile.js";
import { Landscapes } from "../classes/enums/landscapes.js";
import { Edges } from '../classes/enums/edges.js';
import { GameBoardManager } from '../classes/game-board-manager.js';
import { DominoEnd } from '../classes/enums/domino-end.js';
import { GameConfiguration } from '../classes/game-configuration.js';

//scenario 1
(function() {
    const config = new GameConfiguration(2, false, false);
    const gmb = new GameBoardManager(config);
    const domino1 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            1
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    const domino2 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            1
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    const domino3 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    const domino4 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    const domino5 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    const domino6 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    const domino7 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            1
        ),
        new DominoTile(
            Landscapes.WATER,
            0
        ),
        1
    );
    const domino8 = new Domino(
        new DominoTile(
            Landscapes.WATER,
            1
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    it('should compute a score of zero for an empty board', () => {
        assert(gmb.score === 0);
    });
    // test\scoring-scenarios\scenario-1\1.jpg
    gmb.placeDomino(domino1, gmb.board['0,0'], Edges.RIGHT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 1.1', () => {
        assert(gmb.score === 1);
    });
    // test\scoring-scenarios\scenario-1\2.jpg
    domino2.rotate();
    domino2.rotate();
    gmb.placeDomino(domino2, gmb.board['0,0'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 1.2', () => {
        assert(gmb.score === 2);
    });
    // test\scoring-scenarios\scenario-1\3.jpg
    gmb.placeDomino(domino3, gmb.board['0,0'], Edges.TOP, DominoEnd.LEFT);
    gmb.placeDomino(domino4, gmb.board['-1,0'], Edges.TOP, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 1.3', () => {
        assert(gmb.score === 7);
    });
    // test\scoring-scenarios\scenario-1\4.jpg
    gmb.placeDomino(domino5, gmb.board['-1,0'], Edges.BOTTOM, DominoEnd.RIGHT);
    gmb.placeDomino(domino6, gmb.board['0,0'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 1.4', () => {
        assert(gmb.score === 11);
    });
    // test\scoring-scenarios\scenario-1\5.jpg
    gmb.placeDomino(domino7, gmb.board['-1,1'], Edges.TOP, DominoEnd.RIGHT);
    gmb.placeDomino(domino8, gmb.board['0,1'], Edges.TOP, DominoEnd.LEFT);
    it('should compute the correct score for scenario 1.5', () => {
        assert(gmb.score === 24);
    });
})();

//scenario 2
(function() {
    const config = new GameConfiguration(2, true, false);
    const gmb = new GameBoardManager(config);
    it('should compute a score of 10 for an empty board with the middle castle rule', () => {
        assert(gmb.score === 10);
    });
    // test\scoring-scenarios\scenario-2\1.jpg
    const domino1 = new Domino(
        new DominoTile(
            Landscapes.WATER,
            1
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    gmb.placeDomino(domino1, gmb.board['0,0'], Edges.RIGHT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.1', () => {
        assert(gmb.score === 1);
    });
    // test\scoring-scenarios\scenario-2\2.jpg
    const domino2 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        new DominoTile(
            Landscapes.PASTURE,
            1
        ),
        1
    );
    gmb.placeDomino(domino2, gmb.board['0,0'], Edges.LEFT, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 2.2', () => {
        assert(gmb.score === 12);
    });
    // test\scoring-scenarios\scenario-2\3.jpg
    const domino3 = new Domino(
        new DominoTile(
            Landscapes.WATER,
            1
        ),
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        1
    );
    gmb.placeDomino(domino3, gmb.board['1,0'], Edges.TOP, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.3', () => {
        assert(gmb.score === 5);
    });
    // test\scoring-scenarios\scenario-2\4.jpg
    const domino4 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            1
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    domino4.rotate();
    gmb.placeDomino(domino4, gmb.board['2,0'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.4', () => {
        assert(gmb.score === 8);
    });
    // test\scoring-scenarios\scenario-2\5.jpg
    const domino5 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            1
        ),
        new DominoTile(
            Landscapes.MINE,
            0
        ),
        1
    );
    gmb.placeDomino(domino5, gmb.board['-2,0'], Edges.TOP, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.5', () => {
        assert(gmb.score === 10);
    });
    // test\scoring-scenarios\scenario-2\6.jpg
    const domino6 = new Domino(
        new DominoTile(
            Landscapes.WATER,
            0
        ),
        new DominoTile(
            Landscapes.PASTURE,
            2
        ),
        1
    );
    domino6.rotate();
    domino6.rotate();
    gmb.placeDomino(domino6, gmb.board['0,0'], Edges.BOTTOM, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 2.6', () => {
        assert(gmb.score === 14);
    });
    // test\scoring-scenarios\scenario-2\7.jpg
    const domino7 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            1
        ),
        new DominoTile(
            Landscapes.PASTURE,
            0
        ),
        1
    );
    gmb.placeDomino(domino7, gmb.board['-2,0'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.7', () => {
        assert(gmb.score === 24);
    });
    // test\scoring-scenarios\scenario-2\8.jpg
    const domino8 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            1
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    domino8.rotate();
    domino8.rotate();
    gmb.placeDomino(domino8, gmb.board['2,1'], Edges.TOP, DominoEnd.LEFT);
    const domino9 = new Domino(
        new DominoTile(
            Landscapes.MINE,
            1
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    domino9.rotate();
    domino9.rotate();
    domino9.rotate();
    gmb.placeDomino(domino9, gmb.board['0,0'], Edges.TOP, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.8', () => {
        assert(gmb.score === 41);
    });
    // test\scoring-scenarios\scenario-2\9.jpg
    const domino10 = new Domino(
        new DominoTile(
            Landscapes.WATER,
            0
        ),
        new DominoTile(
            Landscapes.PASTURE,
            1
        ),
        1
    );
    domino10.rotate();
    domino10.rotate();
    gmb.placeDomino(domino10, gmb.board['0,-1'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.9', () => {
        assert(gmb.score === 48);
    });
    // test\scoring-scenarios\scenario-2\10.jpg
    const domino11 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        new DominoTile(
            Landscapes.BOG,
            1
        ),
        1
    );
    gmb.placeDomino(domino11, gmb.board['-2,1'], Edges.TOP, DominoEnd.LEFT);
    it('should compute the correct score for scenario 2.10', () => {
        assert(gmb.score === 51);
    });
})();