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
     * @param {number} player
     * @param {Domino} domino
     */
    constructor(player, domino) {
        this.player = player;
        this.domino = domino;
    }
}
