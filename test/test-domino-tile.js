import { it, assert } from './test-framework.js';
import { DominoTile } from "./../classes/domino-tile.js";
import { Landscapes } from "./../classes/enums/landscapes.js";
import { Edges, EdgeOffset } from "./../classes/enums/edges.js";

/** Test constructor */
(function() {
    const domino_tile = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    domino_tile.setOffset(1,2);
    it('should have forest lanscape', () => {
        assert(domino_tile.landscape === Landscapes.FOREST);
    });
    it('should have 1 crown', () => {
        assert(domino_tile.crowns === 1);
    });
    it('should have offset 1,2', () => {
        assert(domino_tile.x === 1 && domino_tile.y === 2);
    });
    domino_tile.setOffset(2,1);
    it('should have offset 2,1', () => {
        assert(domino_tile.x === 2 && domino_tile.y === 1);
    });
})();

/** Test partitionEdgesByLandscapes */
(function() {
    const tile = new DominoTile(
        Landscapes.FOREST,
        1
    );
    tile.topEdge = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    tile.leftEdge = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    tile.rightEdge = new DominoTile(
        Landscapes.MINE
        , 1
    );
    tile.bottomEdge = new DominoTile(
        Landscapes.WATER
        , 1
    );
    const result = DominoTile.partitionEdgesByLandscapes(tile);
    it('should have two of same landscape', () => {
        assert(result.matched.length === 2);
    });
    it('should have same landscape type of Forest', () => {
        assert(result.matched[0].landscape === Landscapes.FOREST);
    });
    it('should have have four total edges', () => {
        assert(result.matched.length + result.diff.length === 4);
    });
    tile.rightEdge = null;
    tile.bottomEdge = null;
    const result2 = DominoTile.partitionEdgesByLandscapes(tile);
    it('should have have empty diff landscapes', () => {
        assert(result2.diff.length === 0);
    });
    it('should have have two total edges', () => {
        assert(result2.matched.length + result2.diff.length === 2);
    });
})();

/** Test connectToEdge */
(function() {
    let domino_tile1 = new DominoTile(
        Landscapes.FOREST
        , 1
    );
    domino_tile1.setOffset(1,1)
    let domino_tile2 = new DominoTile(
        Landscapes.WATER
        , 1
    );
    domino_tile1.connectToEdge(domino_tile2, Edges.RIGHT);
    it('should have connection on the right edge', () => {
        assert(domino_tile1.rightEdge === domino_tile2);
    });
    it('should have reciprical connection on the left edge', () => {
        assert(domino_tile2.leftEdge === domino_tile1);
    });
    domino_tile1.connectToEdge(domino_tile2, Edges.LEFT);
    it('should have connection on the left edge', () => {
        assert(domino_tile1.leftEdge === domino_tile2);
    });
    it('should have reciprical connection on the right edge', () => {
        assert(domino_tile2.rightEdge === domino_tile1);
    });
    domino_tile1.connectToEdge(domino_tile2, Edges.TOP);
    it('should have connection on the top edge', () => {
        assert(domino_tile1.topEdge === domino_tile2);
    });
    it('should have reciprical connection on the top edge', () => {
        assert(domino_tile2.bottomEdge === domino_tile1);
    });
    domino_tile1.connectToEdge(domino_tile2, Edges.BOTTOM);
    it('should have connection on the bottom edge', () => {
        assert(domino_tile1.bottomEdge === domino_tile2);
    });
    it('should have reciprical connection on the bottom edge', () => {
        assert(domino_tile2.topEdge === domino_tile1);
    });
})();