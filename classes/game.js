import { DominoDraftManager } from "./domino-draft-manager.js";
import { DominoPoolManager } from "./domino-pool-manager.js";
import { GameBoardManager } from "./game-board-manager.js";
import { GameConfiguration } from "./game-configuration.js";
import { Player } from "./player.js";
import { GameState } from "./enums/game-state.js";
import { DrawDraft } from "./draw-draft.js";
import { DrawBoard } from "./draw-board.js";
import { DrawBoardSize } from "./enums/draw-board-size.js";
import { Canvas, createCanvas } from "canvas";

export class Game {
    /** @type {DominoDraftManager} */
    draftManager;
    /** @type {Player[]} */
    players;
    /** @type {GameConfiguration} */
    config;

    constructor() {
        this.players = [];
    }

    /** @param {GameConfiguration} config */
    start(config) {
        this.draftManager = new DominoDraftManager(new DominoPoolManager(), config.numPlayers);
        this.players.forEach(player => player.setBoard(new GameBoardManager(config)));
        this.config = config;
    }

    /**
     * @param {GameState} state
     * @returns {Canvas}
    */
    draw(state) {

        switch (state) {
            case GameState.DRAFT:
                const drawDraft = new DrawDraft(DrawBoardSize.FOCUSED, this.config);
                const draftCanvs = drawDraft.draw(this.draftManager);
                const miniMaps = this.players.map(player => new DrawBoard(DrawBoardSize.MINI, this.config).draw(player.board));
                const draftCanvas = createCanvas(
                    draftCanvs.width + miniMaps[0].width,
                    Math.max(draftCanvs.height, miniMaps.reduce((a, b) => a.height + b.height, 0))
                );
                const draftCtx = draftCanvas.getContext('2d');
                draftCtx.drawImage(draftCanvs, 0, 0);
                miniMaps.forEach((miniMap, i) => {
                    draftCtx.drawImage(miniMap, draftCanvs.width, i * miniMap.height);
                });
                return draftCanvas;
            case GameState.PLACE:
                const currentPlayer = this.players.find(player => player.id === this.draftManager.currentPlayerId);
                const currentPlayerIndex = this.players.indexOf(currentPlayer);
                if (!currentPlayer) {
                    currentPlayer = this.players[0];
                }
                const currentPlayerCanvas = new DrawBoard(DrawBoardSize.FOCUSED, this.config).draw(currentPlayer.board);
                const playerMiniMaps = this.players.map(player => new DrawBoard(DrawBoardSize.MINI, this.config).draw(player.board));
                const placeCanvas = createCanvas(
                    currentPlayerCanvas.width + playerMiniMaps[0].width,
                    Math.max(currentPlayerCanvas.height, playerMiniMaps.reduce((a, b) => a.height + b.height, 0))
                );
                const placeCtx = placeCanvas.getContext('2d');
                placeCtx.drawImage(currentPlayerCanvas, 0, 0);
                playerMiniMaps.forEach((miniMap, i) => {
                    placeCtx.drawImage(miniMap, currentPlayerCanvas.width, i * miniMap.height);
                    if (i === currentPlayerIndex) {
                        this.drawBorder(miniMap, 3, '#bbb');
                    }
                });
                return placeCanvas;
            default:
                throw new Error(`Unknown game state: ${state}`);
        }

    }

    /**
     * Draw a border around the canvas.
     *
     * @param {Canvas} canvas - The canvas object to draw the border on.
     * @param {number} borderWidth - The width of the border in pixels.
     * @param {string} borderColor - The color of the border (e.g. '#000' for black).
     */
    drawBorder(canvas, borderWidth, borderColor) {
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, canvas.width - borderWidth, canvas.height - borderWidth);
    }
}

