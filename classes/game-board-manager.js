import { Domino } from "./domino.js";
import { DominoEnd } from "./enums/domino-end.js";
import { DominoTile } from "./domino-tile.js";
import { Landscapes } from "./enums/landscapes.js";
import { Edges, EdgeOffset } from "./enums/edges.js";
import { DominoCoordinates } from "./domino-coordinates.js";
import { DominoEdges } from "./domino-edges.js";
import { BoardMinMaxAxis } from "./board-min-max-axis.js";

/**
 * A gameboard always includes a castle. 
 * Represents the dominos relative to the castle.
 * The GameBoardManager can place dominos, validate their
 * placement, and compute the score. 
 */
export class GameBoardManager {
    #board = new Object();
    #boardSize = new BoardMinMaxAxis(0,0,0,0);

    constructor() {
        const castle = new DominoTile(Landscapes.CASTLE, 0);
        castle.setOffset(0,0);
        this.#board['0,0'] = castle;
    }

    /**
     * A dictionary with a key [x,y] and a value of domino tile.
     * [x,y] are the coordinates relative to the castle. Castle is always [0,0]
     * @returns A shallow copy of the game board
     */
    get board() {
        return Object.assign({}, this.#board); // a deep copy isn't possible, as the tiles have circular references along their edges
    }

    get boardSize() {
        return Object.assign({}, this.#boardSize);
    }

    /**
     * The maximum size of any axis measured in tiles
     */
    get maxBoardSize() {
        return 5;
    }

    /**
     * The current score of the board
     */
    get score() {
        const castle = this.#board['0,0'];
        const score = castle.score();
        castle.resetHasVisited();
        return score;
    }

    /**
     * 
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @returns {?DominoTile} the tile that was placed (according to the provided domino and the specified "end" of the domino)
     * with its internal coordinates updated to reflect its placement on the game board. Will return null if the domino cannot be placed
     * at that position. 
     */
    placeDomino(domino, tile, tileEdge, dominoEnd) {
        const isValidPlacement = GameBoardManager.isValidPlacement(
            domino,
            tile,
            tileEdge,
            dominoEnd,
            this.#board,
            this.maxBoardSize,
            this.#boardSize
        );
        if (!isValidPlacement) {
            return null;
        } else {
            const edgeConnections = GameBoardManager.findDiscoveredEdges(
                domino,
                tile,
                tileEdge,
                dominoEnd, 
                this.#board
            );
            const connectedTile = domino.getTile(dominoEnd);
            const attachedTile = domino.getOppositeTile(dominoEnd);
            const coordinates = GameBoardManager.getDominoCoordinates(domino, tile, tileEdge, dominoEnd);
            connectedTile.setOffset(coordinates.connectedEnd.x, coordinates.connectedEnd.y);
            attachedTile.setOffset(coordinates.attachedEnd.x, coordinates.attachedEnd.y);
            this.#connectTile(edgeConnections.connectedEndEdges, connectedTile);
            this.#connectTile(edgeConnections.attachedEndEdges, attachedTile);
            return connectedTile;
        }
    }

    /**
     * @param {Array<{tile: DominoTile, edge: Edges}} edges the edges that will be connected to the tile
     * @param {DominoTile} tile the tile to be placed on the board and connected to the edges
     */
    #connectTile(edges, tile) {
        edges.forEach(EdgeProps => {
            tile.connectToEdge(EdgeProps.tile, EdgeProps.edge);
        });
        this.#board[tile.x.toString() + ',' + tile.y.toString()] = tile;
    }

    /**
     * Validates the placement of a domino on the game board
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @param {Object} board the object representing the gameboard
     * @param {number} maxBoardSize The maximum size of the board, in number of tiles, along any axis
     * @param {BoardMinMaxAxis} boardAxis The min and max offsets of the gameboard
     * @returns {boolean} true if the placement is valid
     */
    static isValidPlacement(domino, tile, tileEdge, dominoEnd, board, maxBoardSize, boardAxis) {
        const hasFreeSpace = GameBoardManager.hasFreeSpace(domino, tile, tileEdge, dominoEnd, board, maxBoardSize, boardAxis);
        const hasValidEdges = GameBoardManager.hasValidEdges(domino, tile, tileEdge, dominoEnd, board);
        return hasFreeSpace && hasValidEdges;
    }

    /**
     * Check if the space the domino is trying to occupy is available and fits within the board size
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @param {Object} board the object representing the gameboard
     * @param {number} maxBoardSize The maximum size of the board, in number of tiles, along any axis
     * @param {BoardMinMaxAxis} boardAxis The min and max offsets of the gameboard
     * @returns {boolean} true if the domino has the space to be placed there
     */
    static hasFreeSpace(domino, tile, tileEdge, dominoEnd, board, maxBoardSize, boardAxis) {
        const coordinates = GameBoardManager.getDominoCoordinates(domino, tile, tileEdge, dominoEnd);
        return !GameBoardManager.overlapsOtherTiles(
            domino,
            tile,
            tileEdge,
            dominoEnd,
            board
        ) && !GameBoardManager.exceedsBoardSize(
            maxBoardSize
            , boardAxis
            , coordinates.connectedEnd.x
            , coordinates.connectedEnd.y
        ) && !GameBoardManager.exceedsBoardSize(
            maxBoardSize
            , boardAxis
            , coordinates.attachedEnd.x
            , coordinates.attachedEnd.y
        );
    }

    /**
     * Check if the space the domino is trying to occupy is currently occupied by other pieces
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @param {Object} board the object representing the gameboard
     * @returns {boolean} true if the domino cannot be placed there
     */
    static overlapsOtherTiles(domino, tile, tileEdge, dominoEnd, board) {
        const coordinates = GameBoardManager.getDominoCoordinates(domino, tile, tileEdge, dominoEnd);
        const connectedSpaceOccupied = !!board[
            coordinates.connectedEnd.x.toString() +
            ',' + coordinates.connectedEnd.y.toString()
        ];
        const attachedSpaceOccupied = !!board[
            coordinates.attachedEnd.x.toString() +
            ',' + coordinates.attachedEnd.y.toString()
        ];
        return connectedSpaceOccupied || attachedSpaceOccupied;
    }

    /**
     * @param {number} size maximum size on either axis
     * @param {BoardMinMaxAxis} boardAxis The min and max offsets of the gameboard
     * @returns true if test coordinates exceed the maximum size of the board
     * else false
     */
    static exceedsBoardSize(size, boardAxis, xCord, yCord) {
        const newBoardAxis = BoardMinMaxAxis.genCurrentBoardMinMaxes(
            boardAxis,
            xCord,
            yCord
        );
        return Math.abs(newBoardAxis.xMin) + Math.abs(newBoardAxis.xMax) > size
        || Math.abs(newBoardAxis.yMin) + Math.abs(newBoardAxis.yMax) > size;
    }

    /**
     * Checks if the domino placement is valid on all edges.
     * A valid domino placement is...
     * 1) The domino is connected to the castle or...
     * 2) The domino is connected on at least one edge of the same type as itself and
     * 3) The domino is not connected on any edge to a tile of a different type (except the castle)
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @param {Object} board the object representing the gameboard
     * @returns {boolean}
     * returns true if the edges of the placed domino are valid
     */
    static hasValidEdges(domino, tile, tileEdge, dominoEnd, board) {
        const discoveredEdges = GameBoardManager.findDiscoveredEdges(domino, tile, tileEdge, dominoEnd, board);
        const connectedTile = domino.getTile(dominoEnd);
        const attachedTile = domino.getOppositeTile(dominoEnd);
        const hasAtLeastOneEdge = discoveredEdges.connectedEndEdges.length > 0; 
        const hasValidConnectedEdge = !!discoveredEdges.connectedEndEdges.find(EdgeProps => {
            return EdgeProps.tile.landscape === connectedTile.landscape 
                || EdgeProps.tile.landscape === Landscapes.CASTLE;
        });
        const hasValidAttachedEdge = !!discoveredEdges.attachedEndEdges.find(EdgeProps => {
            return EdgeProps.tile.landscape === attachedTile.landscape 
                || EdgeProps.tile.landscape === Landscapes.CASTLE;
        });
        return hasAtLeastOneEdge && (hasValidConnectedEdge || hasValidAttachedEdge);
    }

    /**
     * Returns a map of edges along the domino and tiles that will connect to those edges
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @param {Object} board the object representing the gameboard
     * @returns {DominoEdges} 
     * two arrays containing a map of edges and tiles that will conntect on that edge. 
     * The connectedEnd will connect to `tile`, the attachedEnd is the other end of the domino
     */
    static findDiscoveredEdges(domino, tile, tileEdge, dominoEnd, board) {
        const connectedEndEdges = [];
        const attachedEndEdges = [];
        const coordinates = this.getDominoCoordinates(domino, tile, tileEdge, dominoEnd);
        const arrEdges = Object.values(Edges);
        arrEdges.forEach(edge => {
            const edgeOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(edge);
            connectedEndEdges.push({
                tile: board[
                        (coordinates.connectedEnd.x + edgeOffset.x).toString() +
                        ',' + (coordinates.connectedEnd.y + edgeOffset.y).toString()
                    ]
                , edge: edge
            });
            attachedEndEdges.push({
                tile: board[
                        (coordinates.attachedEnd.x + edgeOffset.x).toString() +
                        ',' + (coordinates.attachedEnd.y + edgeOffset.y).toString()
                    ],
                edge: edge
            });
        });
        return {
            connectedEndEdges: connectedEndEdges.filter(connection => !!connection.tile),
            attachedEndEdges: attachedEndEdges.filter(connection => !!connection.tile)
        };
    }

    /**
     * Find the coordinates for each domino tile if placed
     * @param {Domino} domino the domino being placed
     * @param {DominoTile} tile the tile the domino will connect to
     * @param {Edges} tileEdge the edge of the connecting tile
     * @param {DominoEnd} dominoEnd which end of the domino will connect to the tile
     * @returns {DominoCoordinates} the x and y offset of each domino tile if placed in that position
     * 
     */
     static getDominoCoordinates(domino, tile, tileEdge, dominoEnd) {
        const connectedEndOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(tileEdge);
        const attachedEdge = domino.getConnectedEdge(dominoEnd);
        const attachedEndOffset = EdgeOffset.MAP_EDGE_TO_OFFSET(attachedEdge);
        return {
            connectedEnd: {
                x: tile.x + connectedEndOffset.x,
                y: tile.y + connectedEndOffset.y
            },
            attachedEnd: {
                x: tile.x + connectedEndOffset.x + attachedEndOffset.x,
                y: tile.y + connectedEndOffset.y + attachedEndOffset.y
            }
        };
    }
}