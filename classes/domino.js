import { DominoTile } from "/classes/domino-tile.js";

export class Domino {
  /**
   * Generates a domino
   * @param {DominoTile} dominoLeft - The left tile when in the default orientation
   * @param {DominoTile} dominoRight - The right tile when in the default orientation
   * @param {number} number - The number on the back of the domino. Ranks the value of each domino during the draft phase.
   */
  constructor(dominoLeft, dominoRight, number) {
    this.leftEnd = dominoLeft;
    this.rightEnd = dominoRight;
    this.number = number;
    dominoLeft.rightEdge = dominoRight;
    dominoRight.leftEdge = dominoLeft;
  }

  /**
   * Rotates the domino clockwise. Rotation is given by the edge relationship between the leftEnd and rightEnd tiles on the domino.
   */
  rotate() {
    this.leftEnd.rotate();
  }
}
