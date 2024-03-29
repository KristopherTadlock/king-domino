import { Canvas, createCanvas } from '@napi-rs/canvas';
import { DominoDraftManager } from './domino-draft-manager.js';
import { DrawBoardSize } from "./enums/draw-board-size.js";
import { Landscapes } from "./enums/landscapes.js";

export class DrawDraft {
    /** @type {Canvas} */
    canvas;

    /** @type {int} */
    #tileSize;

    /** @type {int} */
    #tileOffsetY;

    /** @type {int} */
    #tileOffsetX;

    /** @type {int} */
    #tileGapY;

    /** @type {int} */
    #crownOffsetX;

    /** @type {int} */
    #crownOffsetY;

    /** @type {int} */
    #crownFontSize;

    /** @type {int} */
    #PlayerFontSize;

    /** @type {int} */
    #draftingPlayerOffsetX;

    /** @type {int} */
    #draftingPlayerOffsetY;

    /** @type {int} */
    #draftedPlayerOffsetX;

    /** @type {int} */
    #draftedPlayerOffsetY;

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
                this.#tileSize = 45;
                this.#tileOffsetY = 6;
                this.#tileOffsetX = 10 + 42 + 8; // + 45 + 45 + 8 + 42 + 10;
                this.#tileGapY = 6;
                this.#crownFontSize = 20;
                this.#crownOffsetX = 24;
                this.#crownOffsetY = 24;
                this.#PlayerFontSize = 42;
                this.#draftingPlayerOffsetX = 10;
                this.#draftingPlayerOffsetY = 8;
                this.#draftedPlayerOffsetX = 10 + 42 + 8 + 45 + 45 + 8; // + 42 + 10;
                this.#draftedPlayerOffsetY = 8;
                break;
            case DrawBoardSize.MINI:
                this.canvas = createCanvas(70, 70);
                this.#tileSize = 15;
                this.#tileOffsetY = 2;
                this.#tileOffsetX = 3 + 14 + 3; // + 15 + 15 + 3 + 14 + 3;
                this.#tileGapY = 2;
                this.#crownFontSize = 6;
                this.#crownOffsetX = 8;
                this.#crownOffsetY = 8;
                this.#PlayerFontSize = 14;
                this.#draftingPlayerOffsetX = 3;
                this.#draftingPlayerOffsetY = 2;
                this.#draftedPlayerOffsetX = 3 + 14 + 3 + 15 + 15 + 3; // + 14 + 3;
                this.#draftedPlayerOffsetY = 2;
                break;
            case DrawBoardSize.MAX:
                this.canvas = createCanvas(490, 490);
                this.#tileSize = 95;
                this.#tileOffsetY = 22;
                this.#tileOffsetX = 20 + 84 + 46; // + 95 + 95 + 46 + 84 + 20
                this.#tileGapY = 22;
                this.#crownFontSize = 40;
                this.#crownOffsetX = 54;
                this.#crownOffsetY = 54;
                this.#PlayerFontSize = 84;
                this.#draftingPlayerOffsetX = 20;
                this.#draftingPlayerOffsetY = 6;
                this.#draftedPlayerOffsetX = 20 + 84 + 46 + 95 + 95 + 46; // + 84 + 20
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
        this.ctx.fillStyle = this.#getTileImage(landscape);

        // Draw the tile
        this.ctx.fillRect(x, y, this.#tileSize, this.#tileSize);

        // Draw the crowns
        this.ctx.fillStyle = "#EEE";
        this.ctx.font = `${this.#crownFontSize}px Arial`;
        this.ctx.fillText(crowns.toString(), x + this.#crownOffsetX, y + this.#crownOffsetY);
    }

    #drawDraftingPlayer(x, y, player) {
        this.ctx.fillStyle = "#EEE";
        this.ctx.font = `${this.#PlayerFontSize}px Arial`;
        this.ctx.fillText(player, x, y);
    }

    #drawDraftedPlayer(x, y, player) {
        this.ctx.fillStyle = "#EEE";
        this.ctx.font = `${this.#PlayerFontSize}px Arial`;
        this.ctx.fillText(player, x, y);
    }

    /**
     * @param {DominoDraftManager} draftManager
     */
    draw(draftManager) {
        const draft = draftManager.currentDraft;
        const countDrafted = draft.filter(draftable => draftable.player != null).length;

        for (let i = 0; i < draft.length; i++) {
            const draftable = draft[i];

            this.#drawDraftingPlayer(
                this.#draftingPlayerOffsetX,
                this.#tileOffsetY + this.#tileSize * i + this.#tileGapY * i + this.#draftingPlayerOffsetY + this.#PlayerFontSize / 2,
                countDrafted > i ? '' : draftManager.draftOrder[i].toString()
            );
            this.#drawTile(
                this.#tileOffsetX,
                this.#tileOffsetY + this.#tileSize * i + this.#tileGapY * i,
                draftable.domino.leftEnd.landscape,
                draftable.domino.leftEnd.crowns
            );
            this.#drawTile(
                this.#tileOffsetX + this.#tileSize,
                this.#tileOffsetY + this.#tileSize * i + this.#tileGapY * i,
                draftable.domino.rightEnd.landscape,
                draftable.domino.rightEnd.crowns
            );
            this.#drawDraftedPlayer(
                this.#draftedPlayerOffsetX,
                this.#tileOffsetY + this.#tileSize * i + this.#tileGapY * i + this.#draftedPlayerOffsetY + this.#PlayerFontSize / 2,
                draftable.player?.toString()
            );
        }
        return this.canvas;
    }
}
