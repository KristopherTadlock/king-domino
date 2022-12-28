/**
 * Represents how the game is setup, including optional rules and number of players
 */
export class GameConfiguration {
    /**@type {number} One to four players in the game*/
    numPlayers;
    /**@type {boolean} if true a castle is worth ten points if placed exactly in the middle of the board*/
    middleCastleRule;
    /**@type {boolean} if true play with an expanded board size of 7x7 instead of the default 5x5*/
    expandedBoardSize;

    static middleCastleRuleBonus = 10;
    static defaultBoardSize = 5;
    static expandedBoardSize = 7;

  /**
   * Represents how the game is setup, including optional rules and number of players
   * @param {number} numPlayers One to four players in the game
   * @param {boolean} middleCastleRule if true a castle is worth ten points if placed exactly in the middle of the board
   * @param {boolean} expandedBoardSize if true play with an expanded board size of 7x7 instead of the default 5x5
   */
    constructor(numPlayers, middleCastleRule = false, expandedBoardSize = false) {
        if (numPlayers < 2) {
            this.numPlayers = 2;
        } else if (numPlayers > 4) {
            this.numPlayers = 4;
        } else {
            this.numPlayers = numPlayers;
        }
        this.middleCastleRule = middleCastleRule;
        this.expandedBoardSize = expandedBoardSize;
    }
}
