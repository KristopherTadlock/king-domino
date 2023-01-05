export class GameLayout extends HTMLElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: "open" });
      const layoutContainer = document.createElement("div");
      shadow.appendChild(wrapper);
    }

    // need a place for the draft
    // need a place for the board
    // need a place for the player info
    // need a place for the player hand, that'll be part of the draft
    // need a place for the player score
    // need a place for seeing other players boards, they will be minimaps

    // need a place for the game controls
    // need a place for the game history of actions
    // need a place for the game chat
    // need a place for the game settings

    // the left part would be for the draft, we will need to see the dominos with it's number and the amount of stars it had
    // the right part would be for the board, we will need to see the board
    // the top part would be for the player info, we will need to see the player name, and the player score
    // the bottom part would be for the game controls, this will be rotate, undo, and skip if you can't place a domino
    // the bottom left part would be for the game history, this will be a list of actions that have been taken
    // the bottom right part would be for the game chat button that exands to a box, this will be a chat box for players to talk to each other
    // the top right part would be for the game settings, this will be a button that expands to a box with the game settings

    // the game layout will be a grid with 3 rows and 3 columns
    // the first row will be the draft
    // the second row will be the board
    // the third row will be the player info
    // the first column will be the game controls
    // the second column will be the game history
    // the third column will be the game chat
    // the fourth column will be the game settings

    // the draft will be a grid with 2 rows and 2 columns
    // the first row will be the player hand
    // the second row will be the player score
    // the first column will be the player name
    // the second column will be the player minimap

    // the board will be a grid with 7 rows and 7 columns
    // Each row and column will be a domino tile

    buildLayout() {
        const layoutContainer = document.createElement("div");
        layoutContainer.setAttribute("class", "layout-container");
        const draftContainer = document.createElement("div");
        draftContainer.setAttribute("class", "draft-container");
        const boardContainer = document.createElement("div");
        boardContainer.setAttribute("class", "board-container");
        const playerInfoContainer = document.createElement("div");
        playerInfoContainer.setAttribute("class", "player-info-container");
        const gameControlsContainer = document.createElement("div");
        gameControlsContainer.setAttribute("class", "game-controls-container");
        const gameHistoryContainer = document.createElement("div");
        gameHistoryContainer.setAttribute("class", "game-history-container");
        const gameChatContainer = document.createElement("div");
        gameChatContainer.setAttribute("class", "game-chat-container");
        const gameSettingsContainer = document.createElement("div");
        gameSettingsContainer.setAttribute("class", "game-settings-container");
        layoutContainer.appendChild(draftContainer);
        layoutContainer.appendChild(boardContainer);
        layoutContainer.appendChild(playerInfoContainer);
        layoutContainer.appendChild(gameControlsContainer);
        layoutContainer.appendChild(gameHistoryContainer);
        layoutContainer.appendChild(gameChatContainer);
        layoutContainer.appendChild(gameSettingsContainer);
        return layoutContainer;
  }
}