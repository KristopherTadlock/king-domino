import { Domino } from './domino.js';

export class DraftedTile {
    /**
     * @type {number}
     * The player who drafted this tile
     */
    player;

    /**
     * @type {Domino}
     * The domino tile that was drafted
     */
    domino;

    /**
     * @type {boolean}
     * placed is true if the tile has been placed on the board
     */
    placed;

    /**
     * @param {number} player
     * @param {Domino} domino
     */
    constructor(player, domino) {
        this.player = player;
        this.domino = domino;
        this.placed = false;
    }
}
