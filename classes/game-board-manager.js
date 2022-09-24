import { Domino, DominoEnd } from "./domino.js";
import { DominoTile } from "./domino-tile.js";
import { Landscapes } from "./landscapes.js";
import { Edges, EdgeOffset } from "./edges.js";

/** Coordinates of domino tiles if placed */
class DominoCoordinates {
    /** @type {{x: number, y: number}} */
    connectedEnd;
    /** @type {{x: number, y: number}} */
    attachEnd;
}

/**
 * A gameboard always includes a castle. 
 * Represents the dominos relative to the castle.
 * The GameBoardManager can place dominos, validate their
 * placement, and compute the score. 
 */
export class GameBoardManager {
    /**
     * A dictionary with a key [x,y] and a value of domino tile.
     * [x,y] are the coordinates relative to the castle. Castle is always [0,0]
     * ex: [-3,2] is three tiles to the left and two tiles up from the castle.
     */
    #board = new Object();

    constructor() {
        const castle = new DominoTile(Landscapes.CASTLE, 0);
        castle.setOffset(0,0);
        this.#board['0,0'] = this.castle;
    }

    /**
     * Validates the placement of a domino on the game board
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @returns {boolean} true if the placement is valid
     */
    isValidPlacement(domino, tile, tileEdge, dominoEnd) {
        const dominoTile = domino.getTile(dominoEnd);

    }

    /**
     * Check if the space the domino is trying to occupy is available
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @returns {boolean} true if the domino has the space to be placed there
     */
    #hasFreeSpace(domino, tile, tileEdge, dominoEnd) {
        const dominoTile = domino.getTile(dominoEnd);
    }

    /**
     * Returns a map of edges along the domino and tiles that will connect to those edges
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @returns {{connectedEndEdges: Array<{tile: DominoTile, edge: Edges}>, attachedEndEdges: Array<{tile: DominoTile, edge: Edges}>}} returns two arrays containing a map 
     * of edges and tiles that will conntect on that edge. The connectedEnd will connect to `tile`, the attachedEnd is the other end of the domino
     * 
     */
    #findDiscoveredEdges(domino, tile, tileEdge, dominoEnd) {

    }

    /**
     * Returns the x and y offset of each domino tile if placed in that position
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @returns {{connectedEndCord: {x: number, y: number}, attachedEndCord: {x: number, y: number}}} returns two arrays containing a map 
     * of edges and tiles that will conntect on that edge. The connectedEnd will connect to `tile`, the attachedEnd is the other end of the domino
     * 
     */
     #getDominoOffsets(domino, tile, tileEdge, dominoEnd) {
        const connectedEndOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(tileEdge);
        const attachedEdge = domino.getConnectedEdge(dominoEnd);
        const attachedEndOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(attachedEdge);
        return {
            connectedEndCord: {
                x: tile.x + connectedEndOffset.x,
                y: tile.y + connectedEndOffset.y
            },
            attachedEndCord: {
                x: tile.x + connectedEndOffset.x + attachedEndOffset.x,
                y: tile.y + connectedEndOffset.y + attachedEndOffset.y
            }
        };
    }

    //<Array.<{tile: DominoTile, edge: Edges}>
}