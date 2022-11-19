import { Landscapes } from "./enums/landscapes.js";
import { Edges, EdgeOffset } from "./enums/edges.js";

/**
 * Represents the smallest unit on a gameboard. 
 * A domino tile has a landscape type and zero or more crowns.
 * A domino tile can be connected to other tiles by its four edges. 
 * A tile's placement is given by its x and y offsets relative to the castle.
 */
export class DominoTile {
  /** 
  * @type {Landscapes} 
  * Tiles are conecect to either a castle, the other end of the domino they belong to, 
  * or another a domino tile with the same Landscape type as itself. 
  */
  landscape;
  /** 
   * @type {number} 
   * A value between 0 and 3. Is a multiplier for itself and all connected
   * tiles of the same landscape type
  */
  crowns;
  /** @type {DominoTile} */
  topEdge = null;
  /** @type {DominoTile} */
  bottomEdge = null;
  /** @type {DominoTile} */
  rightEdge = null;
  /** @type {DominoTile} */
  leftEdge = null;
  /** 
   * @type {boolean} 
   * A caculating flag marks the tile as visited. 
   * Used when reccursively calculating scores
   */
  #calculating = false;
  /** The tile's horizontal offset from the castle. 
   * Positive is to the right, negative left 
  */
  x = 0; 
  /** The tile's vertical offset from the castle. 
   * Positive is up, negative down 
  */
  y = 0;

  /**
   * Generates a domino tile
   * @param {Landscapes} landscape - The type of tile
   * @param {number} crowns - the number of crowns on this tile
   */
  constructor(landscape, crowns) {
    this.landscape = landscape;
    this.crowns = crowns;
  }

  /**
   * Connects two dominos together
   * @param {DominoTile} tile - The tile to connect to
   * @param {Edges} edge - the edge to connect the tile
   */
  connectToEdge(tile, edge) {
    switch(edge) {
        case Edges.TOP:
            this.topEdge = tile;
            tile.bottomEdge = this;
            tile.setOffset(
                this.x + EdgeOffset.TOP.x,
                this.y + EdgeOffset.TOP.y
            );
            break;
        case Edges.BOTTOM:
            this.bottomEdge = tile;
            tile.topEdge = this;
            tile.setOffset(
                this.x + EdgeOffset.BOTTOM.x,
                this.y + EdgeOffset.BOTTOM.y
            );
            break;
        case Edges.LEFT:
            this.leftEdge = tile;
            tile.rightEdge = this;
            tile.setOffset(
                this.x + EdgeOffset.LEFT.x,
                this.y + EdgeOffset.LEFT.y
            );
            break;
        case Edges.RIGHT:
            this.rightEdge = tile;
            tile.leftEdge = this;
            tile.setOffset(
                this.x + EdgeOffset.RIGHT.x,
                this.y + EdgeOffset.RIGHT.y
            );
            break;
    }
  }

  setOffset(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
   * @returns {Array.<{number}>} Returns an array of three numbers:
   * 1) The sum of contigous tiles of the same landscape as itself (including itself)
   * 2) the sum of crowns on those contigous tiles including its own crowns
   * 3) the total score, including the score of the contigous space it belongs to as well 
   * as the score of it's neighboring subgraphs.
   * Calling score from any tile should return the score of the entire board.
   **/
  score() {
    if (this.#calculating) return [0, 0, 0];
    let score = 0;
    let tiles = 1;
    let crowns = this.crowns;
    this.#calculating = true;
    [this.topEdge, this.bottomEdge, this.rightEdge, this.leftEdge]
      .filter((edge) => !!edge && !edge.getHasVisited())
      .forEach((edge) => {
        [edgeTiles, edgeCrowns, edgeScore] = edge.score();
        if (edge.landscape === this.landscape) {
          tiles += edgeTiles;
          crowns += edgeCrowns;
        } else {
          score += edgeScore;
        }
      });
    this.#calculating = false;
    return [tiles, crowns, score + tiles * crowns];
  }

  /**
   * Rotates all tiles attached to this one 90 degrees clockwise.
   * If this tile is part of a free domino, rotates the domino.
   * If this tile is part of a gameboard, rotates the gameboard.
   */
  rotate() {
    if (this.#calculating) return;
    this.#calculating = true;
    let right, bottom, left, top;
    [right, bottom, left, top] = [
      this.rightEdge,
      this.bottomEdge,
      this.leftEdge,
      this.topEdge,
    ];
    this.rightEdge = top;
    this.bottomEdge = right;
    this.leftEdge = bottom;
    this.topEdge = left;
    [right, bottom, left, top]
      .filter((edge) => !!edge && !edge.getHasVisited())
      .forEach((edge) => {
        edge.rotate();
      });
    this.#calculating = false;
  }

  /**
   * @returns {boolean} When recursing through each tile, this is set to true 
   * if the tile has already been visited, else false.
   */
  getHasVisited() {
    return this.#calculating;
  }

  /**
   * Splits an array of edges. Filters out nulls and visited edges.
   * @param {Array<DominoTile>} edges tile edges
   * @param {Landscapes} landscape landscape type of the tile
   * @returns {{matched: <Array<DominoTile>, diff: <Array<DominoTile>}} 
   * Array partitioned by edges that match the given landscape type and those that 
   * are of a different type
   */
  static partitionByLandscapes(edges, landscape) {
    const sameLandscape = [];
    const diffLandscape = [];
    edges.filter((edge) => !!edge && !edge.getHasVisited())
    .forEach(edge => {
        if (edge.landscape === landscape) {
            sameLandscape.push(edge);
        } else {
            diffLandscape.push(edge);
        }
    });
    return { 
        matched: sameLandscape, 
        diff: diffLandscape
    };
  }
}
