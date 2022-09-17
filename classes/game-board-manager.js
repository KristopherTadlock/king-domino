import { Domino, DominoEnd } from "./domino.js";
import { DominoTile } from "./domino-tile.js";
import { Landscapes } from "./landscapes.js";
import { Edges, EdgeOffset } from "./edges.js";

export class GameBoardManager {
    castle = new DominoTile(Landscapes.CASTLE, 0);
    #board = new Object();

    constructor() {
        this.castle.setOffset(0,0)
        this.#board['0,0'] = this.castle;
    }

    /**
     * Validates the placement of a domino on the game board
     * @param {Domino} domino - the domino being placed
     * @param {DominoTile} tile - the tile the domino will connect to
     * @param {Edges} tileEdge - the edge of the connecting tile
     * @param {DominoEnd} dominoEnd - which end of the domino will connect to the tile
     * @returns {boolean} true if the placement is valid
     */
    isValidPlacement(domino, tile, tileEdge, dominoEnd) {
        const dominoTile = domino.getTile(dominoEnd);

    }

    /**
     * Check if the space the domino is trying to occupy is available
     * @param {Domino} domino - the domino being placed
     * @param {DominoTile} tile - the tile the domino will connect to
     * @param {Edges} tileEdge - the edge of the connecting tile
     * @param {DominoEnd} dominoEnd - which end of the domino will connect to the tile
     * @returns {boolean} true if the domino will no overlap with existing tiles
     */
    #hasFreeSpace(domino, tile, tileEdge, dominoEnd) {
        const dominoTile = domino.getTile(dominoEnd);
    }

    /**
     * Returns a map of edges along the domino and tiles that will connect to those edges
     * @param {Domino} domino - the domino being placed
     * @param {DominoTile} tile - the tile the domino will connect to
     * @param {Edges} tileEdge - the edge of the connecting tile
     * @param {DominoEnd} dominoEnd - which end of the domino will connect to the tile
     * @returns {{connectedEnd: Array<{tile: DominoTile, edge: Edges}>, attachedEnd: Array<{tile: DominoTile, edge: Edges}>}} returns two arrays containing a map 
     * of edges and tiles that will conntect on that edge. The connectedEnd will connect to `tile`, the attachedEnd is the other end of the domino
     * 
     */
    #findDiscoveredEdges(domino, tile, tileEdge, dominoEnd) {

    }

    /**
     * Returns the x and y offset of each domino tile if placed in that position
     * @param {Domino} domino - the domino being placed
     * @param {DominoTile} tile - the tile the domino will connect to
     * @param {Edges} tileEdge - the edge of the connecting tile
     * @param {DominoEnd} dominoEnd - which end of the domino will connect to the tile
     * @returns {{connectedEnd: {x: number, y: number}, attachedEnd: {x: number, y: number}}} returns two arrays containing a map 
     * of edges and tiles that will conntect on that edge. The connectedEnd will connect to `tile`, the attachedEnd is the other end of the domino
     * 
     */
     #getDominoOffsets(domino, tile, tileEdge, dominoEnd) {

    }

    //<Array.<{tile: DominoTile, edge: Edges}>
}