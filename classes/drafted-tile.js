class DraftedTile {
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

    constructor(player, domino) {
        this.player = player;
        this.domino = domino;
    }
}
