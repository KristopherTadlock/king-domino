// UNTESTED

import { EventEmitter } from '../utils/event-emitter.js';
import { DraftEvents } from '../enums/draft-events.js';
import { DominoPoolManager } from './domino-pool-manager.js';
import { DraftedTile } from './drafted-tile.js';

/**
* Manager for the draft across multiple players 
*/
class DominoDraftManager {
    /**
     * @type {DominoPoolManager}
     * The pool of domino tiles to draw from
     */
    #dominoPoolManager;

    /**
     * @type {number}
     * number of players in the game. Must be either 2 or 4
     * @throws {Error} if the number of players is not 2 or 4
     */
    #numberOfPlayers;

    /**
     * @type {number[]}
     * The draft order of the players. Each number is the index of the player starting at 1.
     */
    #draftOrder;

    /**
     * @type {number}
     * The index of the current player in the draft order
     */
    #currentPlayerIndex;

    /**
     * @type {DraftedTile[]}
     * currently drafted tiles for each player for this turn
     */
    #currentDraft;

    /**
     * @type {EventEmitter}
     * emits @type {DraftEvents.POOL_EMPTY} when the pool is empty
     * emits @type {DraftEvents.TURN_OVER} when the turn is over
     */
    #eventEmitter;

    constructor(dominoPoolManager, numberOfPlayers) {
        this.#dominoPoolManager = dominoPoolManager;
        this.#numberOfPlayers = numberOfPlayers;
        this.poolEmptyEventEmitter = new EventEmitter();

        this.#initializeDraftOrder();
        this.#initializeCurrentDraft(this.#dominoPoolManager.draw(4));
    }

    /**
     * @returns {EventListener} event listener for the draft manager
     * @public
     */
    getEventListener() {
        return this.#eventEmitter.getEventListener();
    }

    /**
     * @returns {void}
     * drafts the tile for the current player if the tile is available
     * @param {number} dominoIndex index of the domino to draft
     * @throws {Error} if the tile is already drafted
     */
    draftTile(dominoIndex) {
        if (this.#currentDraft[dominoIndex].player !== null) {
            throw new Error('Tile is already drafted');
        }

        // draft the tile
        this.#currentDraft[dominoIndex].player = this.#draftOrder[this.#currentPlayerIndex];
        // move to the next player
        this.#currentPlayerIndex = (this.#currentPlayerIndex + 1) % this.#numberOfPlayers;
        // if all players have drafted a tile, start the next turn
        if (this.#currentPlayerIndex === this.#numberOfPlayers) {
            this.#startNextTurn();
        }
    }

    /**
     * @returns {void}
     * starts the next turn by drawing 4 more tiles from the pool and resetting the draft order
     * @throws {Error} if the current turn is not over
     */
    #startNextTurn() {
        // if the current turn is not over, throw an error
        if (this.#currentPlayerIndex !== this.#numberOfPlayers) {
            throw new Error('Current turn is not over');
        }
        // if the pool is empty, emit the pool empty event
        if (this.#dominoPoolManager.isEmpty()) {
            this.#eventEmitter.emit(DraftEvents.POOL_EMPTY, this.#currentDraft);
            // return to prevent the turn from starting
            return;
        } else {
            this.#eventEmitter.emit(DraftEvents.TURN_OVER, this.#currentDraft);
            // reset the draft order and start the next turn
            this.#currentPlayerIndex = 0;
            // assign the draft order to the current draft
            this.#draftOrder = this.#currentDraft.map(draftedTile => draftedTile.player);
            // initialize the current draft
            this.#initializeCurrentDraft(this.#dominoPoolManager.draw(4));
        }
    }

    /**
     * @returns {void}
     * initializes the draft order for the game randomly 
     */
    #initializeDraftOrder() {
        this.#draftOrder = [];
        switch (this.#numberOfPlayers) {
            case 2:
                this.#draftOrder = [1, 2, 1, 2];
                break;
            case 4:
                this.#draftOrder = [1, 2, 3, 4];
                break;
            default:
                throw new Error('Invalid number of players');
        }
        this.#draftOrder.sort(() => Math.random() - 0.5);
    }

    /**
     * @returns {void}
     * initializes the current draft for this turn with null for the player
     */
    #initializeCurrentDraft(availableDominoes) {
        this.#currentDraft = availableDominoes.map(domino => new DraftedTile(null, domino));
    }
}
