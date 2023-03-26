import { GameBoardManager } from "./game-board-manager.js";

export class Player {
    /** @type {string} */
    name;
    /** @type {number} */
    score;
    /** @type {number} */
    id;
    /** @type {GameBoardManager} */
    board;

    constructor(name, id) {
        this.name = name;
        this.id = id;
        this.score = 0;
    }

    /** @param {GameBoardManager} board */
    setBoard(board) {
        this.board = board;
    }
}