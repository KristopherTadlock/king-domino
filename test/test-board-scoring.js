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

//scenario 3
(function() {
    const config = new GameConfiguration(2, false, true);
    const gmb = new GameBoardManager(config);
    // test\scoring-scenarios\scenario-3\1.jpg
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
    gmb.placeDomino(domino1, gmb.board['0,0'], Edges.RIGHT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.1', () => {
        assert(gmb.score === 1);
    });
    // test\scoring-scenarios\scenario-3\2.jpg
    const domino2 = new Domino(
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
    domino2.rotate();
    gmb.placeDomino(domino2, gmb.board['1,0'], Edges.TOP, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.2', () => {
        assert(gmb.score === 3);
    });
    // test\scoring-scenarios\scenario-3\3.jpg
    const domino3 = new Domino(
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
    domino3.rotate();
    domino3.rotate();
    gmb.placeDomino(domino3, gmb.board['0,0'], Edges.TOP, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.3', () => {
        assert(gmb.score === 8);
    });
    // test\scoring-scenarios\scenario-3\4.jpg
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
    gmb.placeDomino(domino4, gmb.board['0,1'], Edges.TOP, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.4', () => {
        assert(gmb.score === 12);
    });
    // test\scoring-scenarios\scenario-3\5.jpg
    const domino5 = new Domino(
        new DominoTile(
            Landscapes.WATER,
            1
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    domino5.rotate();
    gmb.placeDomino(domino5, gmb.board['0,0'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.5', () => {
        assert(gmb.score === 14);
    });
    // test\scoring-scenarios\scenario-3\6.jpg
    const domino6 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            1
        ),
        new DominoTile(
            Landscapes.WATER,
            0
        ),
        1
    );
    domino6.rotate();
    domino6.rotate();
    gmb.placeDomino(domino6, gmb.board['-1,-1'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.6', () => {
        assert(gmb.score === 16);
    });
    // test\scoring-scenarios\scenario-3\7.jpg
    const domino7 = new Domino(
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
    domino7.rotate();
    domino7.rotate();
    domino7.rotate();
    gmb.placeDomino(domino7, gmb.board['-1,1'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.7', () => {
        assert(gmb.score === 22);
    });
    // test\scoring-scenarios\scenario-3\8.jpg
    const domino8 = new Domino(
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
    domino8.rotate();
    domino8.rotate();
    gmb.placeDomino(domino8, gmb.board['0,0'], Edges.BOTTOM, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.8', () => {
        assert(gmb.score === 24);
    });
    // test\scoring-scenarios\scenario-3\9.jpg
    const domino9 = new Domino(
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
    domino9.rotate();
    domino9.rotate();
    domino9.rotate();
    gmb.placeDomino(domino9, gmb.board['-2,1'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.9', () => {
        assert(gmb.score === 32); 
    });
    // test\scoring-scenarios\scenario-3\10.jpg
    const domino10 = new Domino(
        new DominoTile(
            Landscapes.FOREST,
            0
        ),
        new DominoTile(
            Landscapes.WATER,
            0
        ),
        1
    );
    domino10.rotate();
    gmb.placeDomino(domino10, gmb.board['-3,1'], Edges.LEFT, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.10', () => {
        assert(gmb.score === 37); 
    });
    // test\scoring-scenarios\scenario-3\11.jpg
    const domino11 = new Domino(
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
    domino11.rotate();
    domino11.rotate();
    domino11.rotate();
    gmb.placeDomino(domino11, gmb.board['1,1'], Edges.RIGHT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.11', () => {
        assert(gmb.score === 39); 
    });
    // test\scoring-scenarios\scenario-3\12.jpg
    const domino12 = new Domino(
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
    domino12.rotate();
    domino12.rotate();
    gmb.placeDomino(domino12, gmb.board['-1,-2'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.12', () => {
        assert(gmb.score === 41); 
    });
    // test\scoring-scenarios\scenario-3\13.jpg
    const domino13 = new Domino(
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
    domino13.rotate();
    gmb.placeDomino(domino13, gmb.board['0,-1'], Edges.BOTTOM, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.13', () => {
        assert(gmb.score === 48); 
    });
    // test\scoring-scenarios\scenario-3\14.jpg
    const domino14 = new Domino(
        new DominoTile(
            Landscapes.BOG,
            0
        ),
        new DominoTile(
            Landscapes.MINE,
            2
        ),
        1
    );
    gmb.placeDomino(domino14, gmb.board['0,-3'], Edges.BOTTOM, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.14', () => {
        assert(gmb.score === 52); 
    });
    // test\scoring-scenarios\scenario-3\15.jpg
    const domino15 = new Domino(
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
    gmb.placeDomino(domino15, gmb.board['-1,0'], Edges.LEFT, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.15', () => {
        assert(gmb.score === 61); 
    });
    // test\scoring-scenarios\scenario-3\16.jpg
    const domino16 = new Domino(
        new DominoTile(
            Landscapes.PASTURE,
            0
        ),
        new DominoTile(
            Landscapes.PASTURE,
            0
        ),
        1
    );
    domino16.rotate();
    domino16.rotate();
    gmb.placeDomino(domino16, gmb.board['-2,-3'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.16', () => {
        assert(gmb.score === 63); 
    });
    // test\scoring-scenarios\scenario-3\17.jpg
    const domino17 = new Domino(
        new DominoTile(
            Landscapes.MINE,
            2
        ),
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        1
    );
    domino17.rotate();
    domino17.rotate();
    domino17.rotate();
    gmb.placeDomino(domino17, gmb.board['0,-3'], Edges.RIGHT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.17', () => {
        assert(gmb.score === 73); 
    });
    // test\scoring-scenarios\scenario-3\18.jpg
    const domino18 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        new DominoTile(
            Landscapes.PASTURE,
            0
        ),
        1
    );
    domino18.rotate();
    domino18.rotate();
    gmb.placeDomino(domino18, gmb.board['-1,-1'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.18', () => {
        assert(gmb.score === 75); 
    });
    // test\scoring-scenarios\scenario-3\19.jpg
    const domino19 = new Domino(
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
    domino19.rotate();
    gmb.placeDomino(domino19, gmb.board['-3,-1'], Edges.LEFT, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.19', () => {
        assert(gmb.score === 81); 
    });
    // test\scoring-scenarios\scenario-3\20.jpg
    const domino20 = new Domino(
        new DominoTile(
            Landscapes.PASTURE,
            0
        ),
        new DominoTile(
            Landscapes.BOG,
            2
        ),
        1
    );
    gmb.placeDomino(domino20, gmb.board['-1,-4'], Edges.LEFT, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.20', () => {
        assert(gmb.score === 86); 
    });
    // test\scoring-scenarios\scenario-3\21.jpg
    const domino21 = new Domino(
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
    gmb.placeDomino(domino21, gmb.board['0,-4'], Edges.RIGHT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.21', () => {
        assert(gmb.score === 94); 
    });
    // test\scoring-scenarios\scenario-3\22.jpg
    const domino22 = new Domino(
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
    domino22.rotate();
    domino22.rotate();
    gmb.placeDomino(domino22, gmb.board['-2,-2'], Edges.LEFT, DominoEnd.LEFT);
    it('should compute the correct score for scenario 3.22', () => {
        assert(gmb.score === 116); 
    });
    // test\scoring-scenarios\scenario-3\23.jpg
    const domino23 = new Domino(
        new DominoTile(
            Landscapes.WHEAT,
            0
        ),
        new DominoTile(
            Landscapes.MINE,
            3
        ),
        1
    );
    domino23.rotate();
    gmb.placeDomino(domino23, gmb.board['1,-3'], Edges.RIGHT, DominoEnd.RIGHT);
    it('should compute the correct score for scenario 3.23', () => {
        assert(gmb.score === 138); 
    });
})();