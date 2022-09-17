import { DominoTile } from "./domino-tile.js";
import { Edges } from "./edges.js";

/**
 * From zero degrees orientation, indicates right or left domino end tile
 */ 
export const DominoEnd = Object.freeze({
  LEFT: Symbol("left"),
  RIGHT: Symbol("right"),
});

export class Domino {
  orientation = 0; //rotation of the domino in degrees
  /**
   * Generates a domino
   * @param {DominoTile} dominoTileLeft - The left tile when in the default orientation
   * @param {DominoTile} dominoTileRight - The right tile when in the default orientation
   * @param {number} number - The number on the back of the domino. Ranks the value of each domino during the draft phase.
   */
  constructor(dominoTileLeft, dominoTileRight, number) {
    this.leftEnd = dominoTileLeft;
    this.rightEnd = dominoTileRight;
    this.number = number;
    dominoTileLeft.connectToEdge(dominoTileRight, Edges.RIGHT)
  }

  /**
   * Rotates the domino clockwise by 90 degrees. Rotation is given by the edge relationship between the leftEnd and rightEnd tiles on the domino.
   */
  rotate() {
    this.leftEnd.rotate();
    if (this.orientation === 270) {
      this.orientation = 0;
    } else {
      this.orientation += 90;
    }
  }

  /**
   * Retreives one end of the domino
   * @param {DominoEnd} end - which end to retrieve
   */
  getTile(end) {
    return end === DominoEnd.LEFT ? this.leftEnd : this.rightEnd;
  }
}
