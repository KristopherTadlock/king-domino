import { DominoTile } from "/classes/domino-tile.js";
import { Landscapes } from "/classes/landscapes.js";

export class GameBoardManager {
    castle = new DominoTile(Landscapes.CASTLE, 0);
    board = new Object();

    constructor() {
        this.castle.setOffset(0,0)
       this.board['0,0'] = this.castle;
    }
}