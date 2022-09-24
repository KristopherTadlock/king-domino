import { DominoTile } from "./domino-tile.js";
import { Edges } from "./edges.js";

/**
 * From zero degrees orientation, indicates right or left domino end tile
 */ 
export const DominoEnd = Object.freeze({
  LEFT: Symbol("left"),
  RIGHT: Symbol("right"),
});

/** A Domino is two tiles (right and left) with a "rank" number 
 * given by the back of the domino. 
 */
export class Domino {
  /** The left end of the tile at default orientation
   *  @type {DominoTile} 
  */
  leftEnd;
  /** The right end of the tile at default orientation
   *  @type {DominoTile} 
  */
  rightEnd;
  /** Clockwise rotation in degrees. Default orientation is 0.
   *  @type {number} 
  */
  orientation = 0; //rotation of the domino in degrees
  /**
   * The number on the back of the domino. 
   * Ranks the value of each domino during the draft phase.
   * @type {number}
   */
  number;
  
  /**
   * @param {DominoTile} dominoTileLeft The left tile when in the default orientation
   * @param {DominoTile} dominoTileRight The right tile when in the default orientation
   * @param {number} number The number on the back of the domino. 
   * Ranks the value of each domino during the draft phase.
   */
  constructor(dominoTileLeft, dominoTileRight, number) {
    this.leftEnd = dominoTileLeft;
    this.rightEnd = dominoTileRight;
    this.number = number;
    dominoTileLeft.connectToEdge(dominoTileRight, Edges.RIGHT)
  }

  /**
   * Rotates the domino clockwise by 90 degrees. 
   * Rotation is given by the edge relationship between the 
   * leftEnd and rightEnd tiles on the domino.
   */
  rotate() {
    this.leftEnd.rotate();
    this.orientation = (this.orientation + 90) % 360;
  }

  /**
   * Retreives one end of the domino
   * @param {DominoEnd} end which end to retrieve
   * @returns {Domino}
   */
  getTile(end) {
    return end === DominoEnd.LEFT ? this.leftEnd : this.rightEnd;
  }

  /**
   * Retreives the opposite end of the domino
   * @param {DominoEnd} end the opposite end of the tile to be retrieved
   * @returns {Domino}
   */
  getOppositeTile(end) {
    return end === DominoEnd.LEFT ? this.rightEnd : this.leftEnd;
  }

  /**
   * Given a domino end, retrieves the edge the opposite domino is connected too.
   * ex. if end is LEFT and orientation is 0, returns RIGHT
   * @param {DominoEnd} end - the end the tile is opposite to
   * @returns {Edges}
   */
  getConnectedEdge(end) {
    const tile = this.getTile(end);
    const oppositeTile = this.getOppositeTile(end);
    if (tile.leftEdge === oppositeTile) {
      return Edges.LEFT;
    } else if (tile.rightEdge === oppositeTile) {
      return Edges.RIGHT;
    } else if (tile.topEdge === oppositeTile) {
      return Edges.TOP;
    } else {
      return Edges.BOTTOM;
    }
  }
}
