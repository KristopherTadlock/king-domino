import { it, assert } from './test-framework.js';
import { Domino } from "../classes/domino.js";
import { DominoTile } from "../classes/domino-tile.js";
import { Landscapes } from "../classes/enums/landscapes.js";
import { Edges } from '../classes/enums/edges.js';
import { DominoEnd } from '../classes/enums/domino-end.js';

/** Test constructor */
(function() {
    const dominoTileLeft = new DominoTile(
        Landscapes.FOREST
        , 0
    );
    const dominoTileRight = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    const domino = new Domino(dominoTileLeft, dominoTileRight, 10);
    it('should have a left end', () => {
        assert(domino.leftEnd === dominoTileLeft);
    });
    it('should have a right end', () => {
        assert(domino.rightEnd === dominoTileRight);
    });
    it('should have number set', () => {
        assert(domino.number === 10); 
    });
    it('should have tiles connected', () => {
        assert(domino.leftEnd.rightEdge === dominoTileRight);
        assert(domino.rightEnd.leftEdge === dominoTileLeft);
    });
})();

/** Test rotation */
(function() {
    const dominoTileLeft = new DominoTile(
        Landscapes.FOREST
        , 0
    );
    const dominoTileRight = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    const domino = new Domino(dominoTileLeft, dominoTileRight, 10);
    it('should have orientation 0', () => {
        assert(domino.orientation === 0);
        assert(domino.leftEnd.rightEdge === dominoTileRight);
        assert(domino.rightEnd.leftEdge === dominoTileLeft);
        assert(domino.getConnectedEdge(DominoEnd.LEFT) === Edges.RIGHT);
        assert(domino.getConnectedEdge(DominoEnd.RIGHT) === Edges.LEFT);
    });
    domino.rotate();
    it('should have orientation 90', () => {
        assert(domino.orientation === 90);
        assert(domino.leftEnd.bottomEdge === dominoTileRight);
        assert(domino.rightEnd.topEdge === dominoTileLeft);
        assert(domino.getConnectedEdge(DominoEnd.LEFT) === Edges.BOTTOM);
        assert(domino.getConnectedEdge(DominoEnd.RIGHT) === Edges.TOP);
    });
    domino.rotate();
    it('should have orientation 180', () => {
        assert(domino.orientation === 180);
        assert(domino.leftEnd.leftEdge === dominoTileRight);
        assert(domino.rightEnd.rightEdge === dominoTileLeft);
        assert(domino.getConnectedEdge(DominoEnd.LEFT) === Edges.LEFT);
        assert(domino.getConnectedEdge(DominoEnd.RIGHT) === Edges.RIGHT);
    });
    domino.rotate();
    it('should have orientation 270', () => {
        assert(domino.orientation === 270);
        assert(domino.leftEnd.topEdge === dominoTileRight);
        assert(domino.rightEnd.bottomEdge === dominoTileLeft);
        assert(domino.getConnectedEdge(DominoEnd.LEFT) === Edges.TOP);
        assert(domino.getConnectedEdge(DominoEnd.RIGHT) === Edges.BOTTOM);
    });
    domino.rotate();
    it('should return to orientation 0', () => {
        assert(domino.orientation === 0);
        assert(domino.leftEnd.rightEdge === dominoTileRight);
        assert(domino.rightEnd.leftEdge === dominoTileLeft);
        assert(domino.getConnectedEdge(DominoEnd.LEFT) === Edges.RIGHT);
        assert(domino.getConnectedEdge(DominoEnd.RIGHT) === Edges.LEFT);
    });
})();

/** Test getTile */
(function() {
    const dominoTileLeft = new DominoTile(
        Landscapes.FOREST
        , 0
    );
    const dominoTileRight = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    const domino = new Domino(dominoTileLeft, dominoTileRight, 10);
    it('should retrieve left end', () => {
        assert(domino.getTile(DominoEnd.LEFT) === dominoTileLeft);
    });
    it('should retrieve right end', () => {
        assert(domino.getTile(DominoEnd.RIGHT) === dominoTileRight);
    });
    it('should retrieve oppsite left end', () => {
        assert(domino.getOppositeTile(DominoEnd.LEFT) === dominoTileRight);
    });
    it('should retrieve opposite right end', () => {
        assert(domino.getOppositeTile(DominoEnd.RIGHT) === dominoTileLeft);
    });
})();
