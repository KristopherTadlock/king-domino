import { Landscapes } from "/classes/landscapes.js";

export class DominoTile {
  topEdge = null;
  bottomEdge = null;
  rightEdge = null;
  leftEdge = null;
  #calculating = false; //used when computing the score. A caculating flag says this tile has already been visited
  x; // the tile offset from castle. Positive is to the right, negative left
  y; // the tile offset from cast. Positive is above, negative below

  /**
   * Generates a domino tile
   * @param {Landscapes} landscape - The type of tile
   * @param {number} crowns - the number of crowns on this tile
   */
  constructor(landscape, crowns) {
    this.landscape = landscape;
    this.crowns = crowns;
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
   * Rotates all tiles attached to this one 90 degrees.
   * If this tile is part of a free domino, rotate the domino.
   * If this tile is part of a gameboard, rotate the gameboard.
   */
  rotate() {
    if (this.#calculating) return;
    this.#calculating = true;
    [right, bottom, left, top] = [
      this.rightEdge,
      this.bottomEdge,
      this.leftEdge,
      this.topEdge,
    ];
    this.rightEdge = bottom;
    this.bottomEdge = left;
    this.leftEdge = top;
    this.topEdge = right;
    [right, bottom, left, top]
      .filter((edge) => !!edge && !edge.getHasVisited())
      .forEach((edge) => {
        edge.rotate();
      });
    this.#calculating = false;
  }

  /**
   * @returns {boolean} . When recursing through each tile, this is set to true if the tile has already been visited, else false.
   */
  getHasVisited() {
    return this.#calculating;
  }

  /**
   * Splits an array of edges. Filters out nulls and vistied edges.
   * @param {Array.<{number}>} edges tile edges
   * @param {Landscapes} landscape landscape type of the tile
   * @returns {Array.{<Array.<{Landscapes}>}>} Array partitioned by edges that match the given landscape type and those that are of a different type
   */
  static partitionByLandscapes(edges, landscape) {
    sameLandscape = [];
    diffLandscape = [];
    edges.filter((edge) => !!edge && !edge.getHasVisited())
    .forEach(edge => edge.landscape === landscape);
    return [sameLandscape, diffLandscape];
  }
}
