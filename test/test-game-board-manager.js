import { it, assert } from './test-framework.js';
import { Domino } from "../classes/domino.js";
import { DominoEnd } from '../classes/enums/domino-end.js';
import { DominoTile } from "../classes/domino-tile.js";
import { Landscapes } from "../classes/enums/landscapes.js";
import { Edges } from '../classes/enums/edges.js';
import { GameBoardManager } from '../classes/game-board-manager.js';
import { BoardMinMaxAxis } from '../classes/board-min-max-axis.js';
import { GameConfiguration } from '../classes/game-configuration.js';

/** Test constructor */
(function() {
    const config = new GameConfiguration(2, false, false);
    const gmb = new GameBoardManager(config);
    const board = gmb.board;
    it('should have a castle', () => {
        const castle = board['0,0'];
        assert(!!castle); // quick undefined check
        assert(castle.x === 0);
        assert(castle.y === 0);
        assert(castle.landscape === Landscapes.CASTLE);
    });
})();

/** Test expanded board size */
(function() {
    let config = new GameConfiguration(2, false, false);
    let gmb = new GameBoardManager(config);
    it('should have a max board size of five by default', () => {
        assert(gmb.maxBoardSize === 5);
    });
    config = new GameConfiguration(2, false, true);
    gmb = new GameBoardManager(config);
    it('should have a max board size of seven if configured with expanded board size', () => {
        assert(gmb.maxBoardSize === 7);
    });
})();

/** Test getDominoOffsets */
(function() {
    const config = new GameConfiguration(2, false, false);
    const castle = new GameBoardManager(config).board['0,0'];
    const domino = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    let cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.RIGHT, DominoEnd.LEFT);
    it('should connect to the right at 0 degrees', () => {
        assert(cords.connectedEnd.x === 1);
        assert(cords.connectedEnd.y === 0);
        assert(cords.attachedEnd.x === 2);
        assert(cords.attachedEnd.y === 0);
    });
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.LEFT, DominoEnd.RIGHT);
    it('should connect to the left at 0 degrees', () => {
        assert(cords.connectedEnd.x === -1);
        assert(cords.connectedEnd.y === 0);
        assert(cords.attachedEnd.x === -2);
        assert(cords.attachedEnd.y === 0);
    });
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.TOP, DominoEnd.LEFT);
    it('should connect to the top at 0 degrees', () => {
        assert(cords.connectedEnd.x === 0);
        assert(cords.connectedEnd.y === 1);
        assert(cords.attachedEnd.x === 1);
        assert(cords.attachedEnd.y === 1);
    });
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.BOTTOM, DominoEnd.LEFT);
    it('should connect to the bottom at 0 degrees', () => {
        assert(cords.connectedEnd.x === 0);
        assert(cords.connectedEnd.y === -1);
        assert(cords.attachedEnd.x === 1);
        assert(cords.attachedEnd.y === -1);
    });
    domino.rotate();
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.RIGHT, DominoEnd.LEFT);
    it('should connect to the right at 90 degrees', () => {
        assert(cords.connectedEnd.x === 1);
        assert(cords.connectedEnd.y === 0);
        assert(cords.attachedEnd.x === 1);
        assert(cords.attachedEnd.y === -1);
    });
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.LEFT, DominoEnd.LEFT);
    it('should connect to the left at 90 degrees', () => {
        assert(cords.connectedEnd.x === -1);
        assert(cords.connectedEnd.y === 0);
        assert(cords.attachedEnd.x === -1);
        assert(cords.attachedEnd.y === -1);
    });
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.TOP, DominoEnd.RIGHT);
    it('should connect to the top at 90 degrees', () => {
        assert(cords.connectedEnd.x === 0);
        assert(cords.connectedEnd.y === 1);
        assert(cords.attachedEnd.x === 0);
        assert(cords.attachedEnd.y === 2);
    });
    cords = GameBoardManager.getDominoCoordinates(domino, castle, Edges.BOTTOM, DominoEnd.LEFT);
    it('should connect to the bottom at 90 degrees', () => {
        assert(cords.connectedEnd.x === 0);
        assert(cords.connectedEnd.y === -1);
        assert(cords.attachedEnd.x === 0);
        assert(cords.attachedEnd.y === -2);
    });
})();

/** Test findDiscoveredEdges */
(function() {
    const tileLeft = new DominoTile(Landscapes.FOREST, 0);
    const tileRight = new DominoTile(Landscapes.FOREST, 0);
    const domino = new Domino(tileLeft, tileRight, 1);
    /** place in the middle. 0 degrees rotations. "Discovered" edges on all sides
     *  [1][2][3][4]
     *  [C]      [9][10]
     *  [5][6][7][8]
     **/
    const config = new GameConfiguration(2, false, false);
    let board = new GameBoardManager(config).board;
    let castle = board['0,0'];
    let tile1 = new DominoTile(Landscapes.FOREST, 0);
    let tile2 = new DominoTile(Landscapes.FOREST, 0);
    let tile3 = new DominoTile(Landscapes.FOREST, 0);
    let tile4 = new DominoTile(Landscapes.FOREST, 0);
    let tile5 = new DominoTile(Landscapes.FOREST, 0);
    let tile6 = new DominoTile(Landscapes.FOREST, 0);
    let tile7 = new DominoTile(Landscapes.FOREST, 0);
    let tile8 = new DominoTile(Landscapes.FOREST, 0);
    let tile9 = new DominoTile(Landscapes.FOREST, 0);
    let tile10 = new DominoTile(Landscapes.FOREST, 0);
    board['0,1'] = tile1;
    board['1,1'] = tile2;
    board['2,1'] = tile3;
    board['3,1'] = tile4;
    board['0,-1'] = tile5;
    board['1,-1'] = tile6;
    board['2,-1'] = tile7;
    board['3,-1'] = tile8;
    board['3,0'] = tile9;
    board['4,0'] = tile10;
    let discoveredEdges = GameBoardManager.findDiscoveredEdges(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board);
    it('should find all edges at 0 degrees rotation', () => {
        assert(discoveredEdges.connectedEndEdges.length === 3);
        //left end of the domino
        let connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.LEFT);
        assert(connectedTile.tile === castle);
        connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.RIGHT);
        assert(connectedTile === undefined); //this would be domino right end if placed
        connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.TOP);
        assert(connectedTile.tile === tile2);
        connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.BOTTOM);
        assert(connectedTile.tile === tile6);
        // right end of the domino
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.LEFT);
        assert(connectedTile === undefined); //this would be domino left end if placed
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.RIGHT);
        assert(connectedTile.tile === tile9);
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.TOP);
        assert(connectedTile.tile === tile3);
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.BOTTOM);
        assert(connectedTile.tile === tile7);
    });
    /** place in the middle. 90 degrees rotations. "Discovered" edges on all sides
     *  [1][2][3][4]
     *  [C]   [9]  
     *  [5]   [10]
     *  [6][7][8]
     **/
    domino.rotate();
    board = new GameBoardManager(config).board;
    castle = board['0,0'];
    board['0,1'] = tile1;
    board['1,1'] = tile2;
    board['2,1'] = tile3;
    board['3,1'] = tile4;
    board['0,-1'] = tile5;
    board['0,-2'] = tile6;
    board['1,-2'] = tile7;
    board['2,-2'] = tile8;
    board['2,0'] = tile9;
    board['2,-1'] = tile10;
    discoveredEdges = GameBoardManager.findDiscoveredEdges(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board);
    it('should find all edges at 90 degrees rotation', () => {
        assert(discoveredEdges.connectedEndEdges.length === 3);
        //top end of the domino
        let connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.LEFT);
        assert(connectedTile.tile === castle);
        connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.RIGHT);
        assert(connectedTile.tile === tile9);
        connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.TOP);
        assert(connectedTile.tile === tile2);
        connectedTile = discoveredEdges.connectedEndEdges.find(connection => connection.edge === Edges.BOTTOM);
        assert(connectedTile === undefined);
        // bottom end of the domino
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.LEFT);
        assert(connectedTile.tile === tile5); //this would be domino left end if placed
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.RIGHT);
        assert(connectedTile.tile === tile10);
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.TOP);
        assert(connectedTile === undefined);
        connectedTile = discoveredEdges.attachedEndEdges.find(connection => connection.edge === Edges.BOTTOM);
        assert(connectedTile.tile === tile7);
    });
})();

(function() {
    let minMaxAxis = new BoardMinMaxAxis(0,0,0,0);
    let exceedsBoardSize = GameBoardManager.exceedsBoardSize(5, minMaxAxis, 5,5);
    it('should not exceed board size', () => {
        assert(exceedsBoardSize === false);
    });
    exceedsBoardSize = GameBoardManager.exceedsBoardSize(5, minMaxAxis, 6,0);
    it('should exceed board size on x axis', () => {
        assert(exceedsBoardSize === true);
    });
    minMaxAxis = new BoardMinMaxAxis(-3,0,0,0);
    exceedsBoardSize = GameBoardManager.exceedsBoardSize(5, minMaxAxis, 3,0);
    it('should exceed board size on x axis negative', () => {
        assert(exceedsBoardSize === true);
    });
    exceedsBoardSize = GameBoardManager.exceedsBoardSize(5, minMaxAxis,0,6);
    it('should exceed board size on y axis', () => {
        assert(exceedsBoardSize === true);
    });
    minMaxAxis = new BoardMinMaxAxis(0,0,-3,0);
    exceedsBoardSize = GameBoardManager.exceedsBoardSize(5, minMaxAxis,0,3);
    it('should exceed board size on y axis negative', () => {
        assert(exceedsBoardSize === true);
    });
})();

(function() {
    const tileLeft = new DominoTile(Landscapes.FOREST, 0);
    const tileRight = new DominoTile(Landscapes.FOREST, 0);
    const domino = new Domino(tileLeft, tileRight, 1);
    const config = new GameConfiguration(2, false, false);
    let board = new GameBoardManager(config).board;
    let tile = new DominoTile(Landscapes.FOREST, 0);
    let castle = board['0,0'];
    let overlapping = GameBoardManager.overlapsOtherTiles(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board);
    it('should not be overlapping', () => {
        assert(overlapping === false);
    });
    board['1,0'] = tile;
    overlapping = GameBoardManager.overlapsOtherTiles(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board);
    it('should overlap on left tile at 0 degrees rotation', () => {
        assert(overlapping === true);
    });
    overlapping = GameBoardManager.overlapsOtherTiles(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board);
    board = new GameBoardManager(config).board;
    board['2,0'] = tile;
    it('should overlap on right tile at 0 degrees rotation', () => {
        assert(overlapping === true);
    });
    domino.rotate();
    board = new GameBoardManager(config).board;
    board['0,-1'] = tile;
    overlapping = GameBoardManager.overlapsOtherTiles(domino, castle, Edges.BOTTOM, DominoEnd.LEFT, board);
    it('should overlap on left tile at 90 degrees rotation', () => {
        assert(overlapping === true);
    });
    overlapping = GameBoardManager.overlapsOtherTiles(domino, castle, Edges.BOTTOM, DominoEnd.LEFT, board);
    board = new GameBoardManager(config).board;
    board['0,-2'] = tile;
    it('should overlap on right tile at 90 degrees rotation', () => {
        assert(overlapping === true);
    });
})();

(function() {
    let minMaxAxis = new BoardMinMaxAxis(0,0,0,0);
    const config = new GameConfiguration(2, false, false);
    const board = new GameBoardManager(config).board;
    const castle = board['0,0'];
    const domino = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    let hasFreeSpace = GameBoardManager.hasFreeSpace(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('should have free space', () => {
        assert(hasFreeSpace === true);
    });
    // mock functions
    const _exceedBoardSize = GameBoardManager.exceedsBoardSize;
    const _overlapsOtherTiles = GameBoardManager.overlapsOtherTiles;
    GameBoardManager.exceedsBoardSize = () => true;
    hasFreeSpace = GameBoardManager.hasFreeSpace(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('should not have free space if board size exceeded', () => {
        assert(hasFreeSpace === false);
    });
    GameBoardManager.exceedsBoardSize = _exceedBoardSize;
    GameBoardManager.overlapsOtherTiles = () => true;
    hasFreeSpace = GameBoardManager.hasFreeSpace(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('should not have free space if overlaps with other tiles', () => {
        assert(hasFreeSpace === false);
    });
    GameBoardManager.exceedsBoardSize = _exceedBoardSize;
    GameBoardManager.overlapsOtherTiles = _overlapsOtherTiles;
})();

(function() {
    const config = new GameConfiguration(2, false, false);
    const board = new GameBoardManager(config).board;
    const castle = board['0,0'];
    const domino = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    const domino2 = new Domino(
        new DominoTile(
            Landscapes.MINE
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    domino.rotate();
    let hasValidEdges = GameBoardManager.hasValidEdges(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board);
    it('should have valid edge on castle', () => {
        assert(hasValidEdges === true);
    });
    let tile1 = new DominoTile(Landscapes.FOREST, 0);
    let tile2 = new DominoTile(Landscapes.FOREST, 0);
    tile1.x = 0;
    tile1.y = 1;
    tile2.x = 0;
    tile2.y = 2;
    board['0,1'] = tile1;
    board['0,2'] = tile2;
    hasValidEdges = GameBoardManager.hasValidEdges(domino, board['0,2'], Edges.RIGHT, DominoEnd.LEFT, board);
    it('should have valid edges on like landscapes', () => {
        assert(hasValidEdges === true);
    });
    hasValidEdges = GameBoardManager.hasValidEdges(domino, board['0,1'], Edges.RIGHT, DominoEnd.LEFT, board);
    it('should have valid edges on like landscape and castle', () => {
        assert(hasValidEdges === true);
    });
    hasValidEdges = GameBoardManager.hasValidEdges(domino2, board['0,1'], Edges.RIGHT, DominoEnd.LEFT, board);
    it('should have invalid edges on different landscapes', () => {
        assert(hasValidEdges === false);
    });
})();

(function() {
    let minMaxAxis = new BoardMinMaxAxis(0,0,0,0);
    const config = new GameConfiguration(2, false, false);
    const board = new GameBoardManager(config).board;
    const castle = board['0,0'];
    const domino = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    let isValid = GameBoardManager.isValidPlacement(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('first domino placed should be valid', () => {
        assert(isValid === true);
    });
    // mock functions
    const _hasFreeSpace = GameBoardManager.hasFreeSpace;
    const _hasValidEdges = GameBoardManager.hasValidEdges;
    GameBoardManager.hasFreeSpace = () => false;
    GameBoardManager.hasValidEdges = () => true;
    isValid = GameBoardManager.isValidPlacement(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('should be invalid if does not have free space', () => {
        assert(isValid === false);
    });
    GameBoardManager.hasFreeSpace = () => true;
    GameBoardManager.hasValidEdges = () => false;
    isValid = GameBoardManager.isValidPlacement(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('should be invalid if edges are invalid', () => {
        assert(isValid === false);
    });
    GameBoardManager.hasFreeSpace = () => false;
    GameBoardManager.hasValidEdges = () => false;
    isValid = GameBoardManager.isValidPlacement(domino, castle, Edges.RIGHT, DominoEnd.LEFT, board, 5, minMaxAxis);
    it('should be invalid if edges are invalid and has no free space', () => {
        assert(isValid === false);
    });
    GameBoardManager.hasFreeSpace = _hasFreeSpace;
    GameBoardManager.hasValidEdges = _hasValidEdges;
})();

(function() {
    const config = new GameConfiguration(2, false, false);
    const boardManager = new GameBoardManager(config);
    const castle = boardManager.board['0,0'];
    const domino1 = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    const domino2 = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    const domino3 = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    const domino4 = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    const domino5 = new Domino(
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        new DominoTile(
            Landscapes.FOREST
            , 0
        ),
        1
    );
    const domino6 = new Domino(
        new DominoTile(
            Landscapes.MINE
            , 0
        ),
        new DominoTile(
            Landscapes.MINE
            , 0
        ),
        1
    );
    let response = boardManager.placeDomino(domino1, castle, Edges.RIGHT, DominoEnd.LEFT);
    it('should place domino to the right of the castle', () => {
        const board = boardManager.board;
        assert(response === domino1.getTile(DominoEnd.LEFT));
        assert(!!board['1,0']);
        assert(!!board['2,0']);
        assert(castle.x === 0 && castle.y === 0);
        assert(board['1,0'].x === 1 && board['1,0'].y === 0);
        assert(board['2,0'].x === 2 && board['2,0'].y === 0);
        assert(castle.rightEdge === board['1,0']);
        assert(board['1,0'].leftEdge === castle);
        assert(board['1,0'].rightEdge === board['2,0']);
        assert(board['2,0'].leftEdge === board['1,0']);
    });
    domino2.rotate();
    response = boardManager.placeDomino(domino2, castle, Edges.BOTTOM, DominoEnd.LEFT);
    it('should place domino below the castle', () => {
        const board = boardManager.board;
        assert(response === domino2.getTile(DominoEnd.LEFT));
        assert(!!board['0,-1']);
        assert(!!board['0,-2']);
        assert(castle.x === 0 && castle.y === 0);
        assert(board['0,-1'].x === 0 && board['0,-1'].y === -1);
        assert(board['0,-2'].x === 0 && board['0,-2'].y === -2);
        assert(castle.bottomEdge === board['0,-1']);
        assert(board['0,-1'].topEdge === castle);
        assert(board['0,-1'].bottomEdge === board['0,-2']);
        assert(board['0,-2'].topEdge === board['0,-1']);
    });
    let boardState = boardManager.board;
    response = boardManager.placeDomino(domino3, boardState['0,-1'], Edges.RIGHT, DominoEnd.LEFT);
    it('should place domino next to like landscapes', () => {
        const board = boardManager.board;
        assert(response === domino3.getTile(DominoEnd.LEFT));
        assert(!!board['1,-1']);
        assert(!!board['2,-1']);
        assert(board['1,0'].x === 1 && board['1,0'].y === 0);
        assert(board['2,0'].x === 2 && board['2,0'].y === 0);
        assert(board['1,-1'].x === 1 && board['1,-1'].y === -1);
        assert(board['2,-1'].x === 2 && board['2,-1'].y === -1);
        assert(board['1,-1'].leftEdge === board['0,-1']);
        assert(board['0,-1'].rightEdge === board['1,-1']);
        assert(board['1,-1'].topEdge === board['1,0']);
        assert(board['1,0'].bottomEdge === board['1,-1']);
        assert(board['1,-1'].rightEdge === board['2,-1']);
        assert(board['2,-1'].leftEdge === board['1,-1']);
        assert(board['2,-1'].topEdge === board['2,0']);
        assert(board['2,0'].bottomEdge === board['2,-1']);
    });
    response = boardManager.placeDomino(domino4, boardState['0,-1'], Edges.RIGHT, DominoEnd.LEFT);
    it('should not place domino that overlaps with another piece', () => {
        assert(response === null);
    });
    boardManager.placeDomino(domino4, boardState['2,0'], Edges.RIGHT, DominoEnd.LEFT);
    boardState = boardManager.board;
    response = boardManager.placeDomino(domino5, boardState['4,0'], Edges.RIGHT, DominoEnd.LEFT);
    it('should not place a domino that causes the board to exceed its max size', () => {
        assert(response === null);
    });
    response = boardManager.placeDomino(domino6, boardState['1,0'], Edges.TOP, DominoEnd.LEFT);
    it('should not place a domino that connects with a landscape different from one of its tiles', () => {
        assert(response === null);
    });
})();