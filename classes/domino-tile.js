import { Landscapes } from "./enums/landscapes.js";
import { Edges } from "./enums/edges.js";

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
   * Connects two domino tiles together
   * @param {DominoTile} tile - The tile to connect to
   * @param {Edges} edge - the edge to connect the tile
   */
  connectToEdge(tile, edge) {
    switch(edge) {
        case Edges.TOP:
            this.topEdge = tile;
            tile.bottomEdge = this;
            break;
        case Edges.BOTTOM:
            this.bottomEdge = tile;
            tile.topEdge = this;
            break;
        case Edges.LEFT:
            this.leftEdge = tile;
            tile.rightEdge = this;
            break;
        case Edges.RIGHT:
            this.rightEdge = tile;
            tile.leftEdge = this;
            break;
    }
  }

  setOffset(x, y) {
    this.x = x;
    this.y = y;
  }

  /**
  * @returns {number} The score of the area it belongs to as well as the score of each of it's unvisited neighboring sub graphs
  */
  score() {
    if (this.getHasVisited()) return 0;
    this.toggleVisited(); // a visited flag used to prevent looping during recursion. 
    let score = 0;
    let tiles = 1;
    let crowns = this.crowns;
    let edgesPartition = DominoTile.partitionEdgesByLandscapes(this);
    let likeLandscapes = edgesPartition.matched;
    let areaBorder = edgesPartition.diff;
    while(likeLandscapes.length > 0) { // find all the tiles in the group this one belongs to. Count the number of tiles and crowns.
      const tile = likeLandscapes.pop();
      if (tile.getHasVisited() !== true) {
        tiles++;
        crowns += tile.crowns;
        tile.toggleVisited();
        edgesPartition = DominoTile.partitionEdgesByLandscapes(tile);
        likeLandscapes = Array.prototype.concat(likeLandscapes, edgesPartition.matched);
        areaBorder = Array.prototype.concat(areaBorder, edgesPartition.diff);
      }
    }
    score = tiles * crowns; // compute score of the group
    while(areaBorder.length > 0) { // iterate over the tiles on the border of the given area. Compute the score of each border region and add to total score.
      const tile = areaBorder.pop();
      score += tile.score();
    }
    return score;
  }

  /**
   * Rotates all tiles attached to this one 90 degrees clockwise.
   * If this tile is part of a free domino, rotates the domino.
   * If this tile is part of a gameboard, rotates the gameboard.
   */
  rotate() {
    if (this.getHasVisited()) return;
    this.toggleVisited();
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
  }

    /**
   * In order to prevent looping the 'has visited' flag is set to true when a recursive action on the tiles is performed. 
   * As a seperate operation, this resets the flag for all pieces to false so another recursive operation 
   * can be performed later. 
   */
    resetHasVisited() {
      this.#calculating = false;
      [
        this.rightEdge,
        this.bottomEdge,
        this.leftEdge,
        this.topEdge,
      ].filter((edge) => !!edge && edge.getHasVisited())
        .forEach((edge) => {
          edge.resetHasVisited();
        });
    }

  /**
   * @returns {boolean} When recursing through each tile, this is set to true 
   * if the tile has already been visited, else false.
   */
  getHasVisited() {
    return this.#calculating;
  }

  toggleVisited() {
    this.#calculating = true;
  }

  /**
   * @param {DominoTile} tile 
   * @returns {{matched: <Array<DominoTile>, diff: <Array<DominoTile>}} the edges of the tile 
   * partitioned by those that are of the same landscape as itself and those that are different. 
   * Tiles that that are 'hasVisited' and nulls are excluded from both sets. 
   */
  static partitionEdgesByLandscapes(tile) {
    const sameLandscape = [];
    const diffLandscape = [];
    const edges = [
      tile.rightEdge,
      tile.bottomEdge,
      tile.leftEdge,
      tile.topEdge
    ];
    edges.filter((edge) => !!edge && !edge.getHasVisited())
    .forEach(edge => {
        if (edge.landscape === tile.landscape) {
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
