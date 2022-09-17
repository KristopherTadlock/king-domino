import { it, assert } from '/test/test-framework.js';
import { Domino, DominoEnd } from "/classes/domino.js";
import { DominoTile } from "/classes/domino-tile.js";
import { Landscapes } from "/classes/landscapes.js";

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
    });
    domino.rotate();
    it('should have orientation 90', () => {
        assert(domino.orientation === 90);
        assert(domino.leftEnd.bottomEdge === dominoTileRight);
        assert(domino.rightEnd.topEdge === dominoTileLeft);
    });
    domino.rotate();
    it('should have orientation 180', () => {
        assert(domino.orientation === 180);
        assert(domino.leftEnd.leftEdge === dominoTileRight);
        assert(domino.rightEnd.rightEdge === dominoTileLeft);
    });
    domino.rotate();
    it('should have orientation 270', () => {
        assert(domino.orientation === 270);
        assert(domino.leftEnd.topEdge === dominoTileRight);
        assert(domino.rightEnd.bottomEdge === dominoTileLeft);
    });
    domino.rotate();
    it('should return to orientation 0', () => {
        assert(domino.orientation === 0);
        assert(domino.leftEnd.rightEdge === dominoTileRight);
        assert(domino.rightEnd.leftEdge === dominoTileLeft);
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
})();