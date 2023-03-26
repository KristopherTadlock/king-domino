import { Edges } from './enums/edges.js';
import { DominoTile } from './domino-tile.js';
/** An array of game board tiles to attach to a given domino tile if placed.
 * Includes the connectedEnd - which is the domino tile that will
 * be placed on the board, and the attached end - which is the other
 * end of the domino placed on the board. 
 */
 export class DominoEdges {
    /** @type {Array<{tile: DominoTile, edge: Edges}} */
    connectedEndEdges; 
    /** @type {Array<{tile: DominoTile, edge: Edges}} */
    attachedEndEdges;
}