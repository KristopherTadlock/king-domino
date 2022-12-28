/**
* Represents the current sie of a game board in min and max offset
* coordinates 
**/
export class BoardMinMaxAxis {
    /**  @type {number} */
     #xMin;
     /**  @type {number} */
     #xMax;
     /**  @type {number} */
     #yMin;
     /**  @type {number} */
     #yMax;

     constructor(xMin, xMax, yMin, yMax) {
        this.#xMin = xMin;
        this.#xMax = xMax;
        this.#yMin = yMin;
        this.#yMax = yMax;
     }

    /**  @type {number} */
     get xMin() {
        return this.#xMin;
     }

    /**  @type {number} */
     get xMax() {
        return this.#xMax;
     }

    /**  @type {number} */
     get yMin() {
        return this.#yMin;
     }

    /**  @type {number} */
     get yMax() {
        return this.#yMax;
     }

    /**
     * @param {BoardMinMaxAxis} boardAxis Current board axis
     * @param {number} xCord x offset to test
     * @param {number} yCord y offset to test
     * @returns {BoardMinMaxAxis} Returns new axis considering test coordinates
     */
    static genCurrentBoardMinMaxes(boardAxis, xCord, yCord) {
        return new BoardMinMaxAxis(
            Math.min(boardAxis.xMin, xCord),
            Math.max(boardAxis.xMax, xCord),
            Math.min(boardAxis.yMin, yCord),
            Math.max(boardAxis.yMax, yCord)
        );
    }
   
   /**
    * @returns {Boolean} true if the castle is centered on the board
    */
   // casle is always at the origin (0,0)
   isCentered() {
      return Math.abs(this.xMin) === Math.abs(this.xMax) &&
         Math.abs(this.#yMin) === this.#yMax;
   }
}
