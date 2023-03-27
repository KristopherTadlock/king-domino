import { GameBoardManager } from "./game-board-manager.js";

export class Player {
    /** @type {string} */
    name;
    /** @type {number} */
    score;
    /** @type {number} */
    uid;
    /** @type {number} */
    id;
    /** @type {GameBoardManager} */
    board;

    /**
     * @param {string} name
     * @param {number} uid
     **/
    constructor(name, uid) {
        this.name = name;
        this.uid = uid;
        this.score = 0;
    }

    /** @param {GameBoardManager} board */
    setBoard(board) {
        this.board = board;
    }

    /** @param {number} id */
    setId(id) {
        this.id = id;
    }
}