import { createCanvas, Canvas } from '@napi-rs/canvas';
import { Landscapes } from "./enums/landscapes.js";
import { DrawBoardSize } from "./enums/draw-board-size.js";
import { GameBoardManager } from './game-board-manager.js';
import { GameConfiguration } from './game-configuration.js';
import { DominoTile } from './domino-tile.js';

export class DrawBoard {
    /** @type {Canvas} */
    canvas;

    /** @type {int} */
    #tileSize;

    /** @type {int} */
    #crownOffsetX;

    /** @type {int} */
    #crownOffsetY;

    /**
     * @param {DrawBoardSize} drawSize
     * @param {GameConfiguration} config
    */
    constructor(drawSize, config) {
        this.#configSize(drawSize, config);
    }

    /**
     * @param {DrawBoardSize} drawSize
     * @param {GameConfiguration} config
     */
    #configSize(drawSize, config) {
        switch (drawSize) {
            case DrawBoardSize.FOCUSED:
                this.canvas = createCanvas(210, 210);
                this.#tileSize = config.expandedBoardSize ? 30 : 42;
                this.#crownOffsetX = config.expandedBoardSize ? 10 : 14;
                this.#crownOffsetY = config.expandedBoardSize ? 10 : 14;
                break;
            case DrawBoardSize.MINI:
                this.canvas = createCanvas(70, 70);
                this.#tileSize = config.expandedBoardSize ? 10 : 14;
                this.#crownOffsetX = config.expandedBoardSize ? 3 : 4;
                this.#crownOffsetY = config.expandedBoardSize ? 3 : 4;
                break;
            case DrawBoardSize.MAX:
                this.canvas = createCanvas(490, 490);
                this.#tileSize = config.expandedBoardSize ? 70 : 98;
                this.#crownOffsetX = config.expandedBoardSize ? 25 : 35;
                this.#crownOffsetY = config.expandedBoardSize ? 25 : 35;
                break;
            default:
                this.canvas = createCanvas(210, 210);
                break;
        }
        this.ctx = this.canvas.getContext("2d");
    }

    #getTileImage(landscape) {
        switch (landscape) {
            case Landscapes.CASTLE:
                this.ctx.fillStyle = "#888";
                break;
            case Landscapes.WHEAT:
                this.ctx.fillStyle = "#fcb13b";
                break;
            case Landscapes.FOREST:
                this.ctx.fillStyle = "#145A32a";
                break;
            case Landscapes.MINE:
                this.ctx.fillStyle = "#5F6A6A";
                break;
            case Landscapes.PASTURE:
                this.ctx.fillStyle = "#52BE80";
                break;
            case Landscapes.BOG:
                this.ctx.fillStyle = "#655780";
                break;
            case Landscapes.WATER:
                this.ctx.fillStyle = "#03a9f4";
                break;
            default:
                this.ctx.fillStyle = "#EEE";
                break;
        }
    }

    #drawTile(x, y, landscape, crowns) {
        // Set color based on landscape type
        this.#getTileImage(landscape);

        // Draw the tile
        this.ctx.fillRect(x, y, this.#tileSize, this.#tileSize);

        // Draw the crowns
        this.ctx.fillStyle = "#EEE";
        this.ctx.font = "30px Arial";
        this.ctx.fillText(crowns.toString(), x + this.#crownOffsetX, y + this.#crownOffsetY);
    }

    /**
     * @param {GameBoardManager} boardManager
     */
    draw(boardManager) {
        const board = boardManager.board;
        const boardSize = boardManager.boardSize;

        const yOffset = boardSize.yMin < 0 ? Math.abs(boardSize.yMin) : 2;
        const xOffset = boardSize.xMin < 0 ? Math.abs(boardSize.xMin) : 2;

        Object.keys(board).forEach((key) => {
            /** @type {DominoTile} */
            const tile = board[key];
            const x = (tile.x + xOffset) * this.#tileSize;
            const y = (tile.y + yOffset) * this.#tileSize;
            this.#drawTile(x, y, tile.landscape, tile.crowns);
        });

        // Draw the tiles
        for (let i = 0; i < board.length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                this.#drawTile(i * tileSize, j * tileSize, board[i][j].landscape, board[i][j].crowns);
            }
        }
        return this.canvas;
    }
}

