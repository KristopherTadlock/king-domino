import { it, assert } from './test-framework.js';
import { Domino } from "../classes/domino.js";
import { DominoTile } from "../classes/domino-tile.js";
import { Landscapes } from "../classes/enums/landscapes.js";
import { Edges } from '../classes/enums/edges.js';
import { GameBoardManager } from '../classes/game-board-manager.js';
import { DominoEnd } from '../classes/enums/domino-end.js';


(function() {
    const gmb = new GameBoardManager();
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