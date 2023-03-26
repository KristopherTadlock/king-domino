import { ActionRowBuilder, Client, Events, GatewayIntentBits, ButtonBuilder, AttachmentBuilder, ButtonStyle, ModalBuilder, TextInputBuilder } from 'discord.js';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

import { GameConfiguration } from './classes/game-configuration.js';
import { Game } from './classes/game.js';
import { Player } from './classes/player.js';
import { GameState } from './classes/enums/game-state.js';
import { DominoTile } from './classes/domino-tile.js';
import { config } from 'dotenv';

config();

/** @type {Map<number, Game} */
const activeGames = new Map();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async interaction => {
    console.log(interaction);
    switch (interaction.commandName) {
        case 'new-game':
            (new BotInteractionHandler(interaction)).onNewGame();
            return;
    }

    switch (interaction.customId) {
        case 'start':
            (new BotInteractionHandler(interaction)).onStart();
            break;
        case 'join':
            (new BotInteractionHandler(interaction)).onJoin();
            break;
        case 'draft-1':
            (new BotInteractionHandler(interaction)).onDraft(1);
            break;
        case 'draft-2':
            (new BotInteractionHandler(interaction)).onDraft(2);
            break;
        case 'draft-3':
            (new BotInteractionHandler(interaction)).onDraft(3);
            break;
        case 'draft-4':
            (new BotInteractionHandler(interaction)).onDraft(4);
            break;
        case 'end':
            (new BotInteractionHandler(interaction)).onEnd();
            break;
        case 'place':
            (new BotInteractionHandler(interaction)).onPlace();
            break;
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);

class BotInteractionHandler {
    /** @type {Interaction}*/
    interaction;

    /** @param {Interaction} interaction */
    constructor(interaction) {
        this.interaction = interaction;
    }

    async onNewGame() {
        if (!this.interaction.isChatInputCommand()) return;

        const gameId = this.interaction.channelId;
        const game = new Game();
        const player = new Player(this.interaction.user.username, this.interaction.user.id);
        game.players.push(player);

        // Add players to the game if they were specified
        this.interaction.options.getUser('player1') &&
            game.players.push(
                new Player(
                    this.interaction.options.getUser('player1').username,
                    this.interaction.options.getUser('player1').id));
        this.interaction.options.getUser('player2') &&
            game.players.push(
                new Player(
                    this.interaction.options.getUser('player2').username,
                    this.interaction.options.getUser('player2').id));
        this.interaction.options.getUser('player3') &&
            game.players.push(
                new Player(
                    this.interaction.options.getUser('player3').username,
                    this.interaction.options.getUser('player3').id));

        activeGames.set(gameId, game);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('start')
                    .setStyle(ButtonStyle.Primary)
                    .setLabel('Start Game')
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('Join Game')
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('end')
                    .setStyle(ButtonStyle.Danger)
                    .setLabel('End Game')
            );

        const players = game.players.map(p => p.name).join('\n');
        await this.interaction.reply({ content: `Game started!\n\nPlayers:\n${players}`, components: [row] });
    }

    async onJoin() {
        const gameId = this.interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await this.interaction.reply('No game is currently active in this channel.', { ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.id === this.interaction.user.id);
        if (player) {
            await this.interaction.reply('You are already playing in this game.', { ephemeral: true });
            return;
        }
        if (game.players.length >= 4) {
            await this.interaction.reply('This game is already full.', { ephemeral: true });
            return;
        }
        game.players.push({ id: this.interaction.user.id, name: this.interaction.user.username });

        const players = game.players.map(p => p.name).join('\n');
        await this.interaction.editReply(`New Player Joined!\n\nPlayers:${players}`);
    }

    async onStart() {
        const gameId = this.interaction.channelId;
        const game = activeGames.get(gameId);
        console.log(game, gameId, 'here');
        if (!game) {
            await this.interaction.reply('No game is currently active in this channel.', { ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.id === this.interaction.user.id);
        if (!player) {
            await this.interaction.reply('You are not currently playing in this game.', { ephemeral: true });
            return;
        }
        if (game.players.length < 2) {
            await this.interaction.reply('You need at least 2 players to start a game.', { ephemeral: true });
            return;
        }
        await this.interaction.deferReply();
        const expand = game.players.length === 2 ? true : false;
        const config = new GameConfiguration(game.players.length, false, expand);
        game.start(config);
        const canvas = game.draw(GameState.DRAFT);
        const file = new AttachmentBuilder(canvas.createPNGStream(), 'game.png');

        const row = this.#buildDraftRow(game);

        await this.interaction.editReply({ attachments: [file], content: 'Player 1', components: [row] })
    }

    async onEnd() {
        const gameId = this.interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await this.interaction.reply('No game is currently active in this channel.', { ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.id === this.interaction.user.id);
        if (!player) {
            await this.interaction.reply('You are not currently playing in this game.', { ephemeral: true });
            return;
        }
        activeGames.delete(gameId);
        await this.interaction.reply('Game ended!');
    }

    /** @type {int} tile */
    async onDraft(tile) {
        const gameId = this.interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await this.interaction.reply('No game is currently active in this channel.', { ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.id === this.interaction.user.id);
        if (!player) {
            await this.interaction.reply('You are not currently playing in this game.', { ephemeral: true });
            return;
        }

        const draft = game.draftManager.currentDraft[tile - 1];
        if (draft.player) {
            await this.interaction.reply('This tile has already been drafted.', { ephemeral: true });
            return;
        }
        game.draftManager.draftTile(tile - 1);
        const gameState = game.draftManager.currentDraft.every(d => d.player) ? GameState.PLACE : GameState.DRAFT;
        const canvas = game.draw(gameState);
        const file = new AttachmentBuilder(canvas.toBuffer(), 'game.png');

        switch (gameState) {
            case GameState.DRAFT:
                const draftRow = this.#buildDraftRow(game);
                const currentPlayerIndex = game.draftManager.currentPlayerIndex;
                await this.interaction.editReply({ attachments: [file], content: `Player ${currentPlayerIndex}`, components: [draftRow] })
                break;
            case GameState.PLACE:
                const placeRow = this.#buildPlaceRow(game);
                await this.interaction.editReply({ attachments: [file], content: 'Player 1', components: [placeRow] })
                break;
        }
    }

    async onPlace() {
        if (!this.interaction.isModalSubmit) return;
        const gameId = this.interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await this.interaction.reply('No game is currently active in this channel.', { ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.id === this.interaction.user.id);
        if (!player) {
            await this.interaction.reply('You are not currently playing in this game.', { ephemeral: true });
            return;
        }
        const currentPlayerIndex = game.draftManager.currentPlayerIndex;
        if (currentPlayerIndex !== game.players.findIndex(p => p.id === this.interaction.user.id)) {
            await this.interaction.reply('It is not your turn to place a tile.', { ephemeral: true });
            return;
        }
        const board = game.players[currentPlayerIndex].board;
        const domino = game.draftManager.currentDraft.find(d => d.player === player)?.domino;
        if (!domino) {
            await this.interaction.reply('You have not drafted a tile.', { ephemeral: true });
            return;
        }
        const targetCoords = this.interaction.fields.getTextInputValue('target');
        if (!targetCoords) {
            await this.interaction.reply('You must specify a target tile.', { ephemeral: true });
            return;
        }
        /** @type {DominoTile} */
        const targetTile = board.board[targetCoords];
        if (!targetTile) {
            await this.interaction.reply('Invalid target tile.', { ephemeral: true });
            return;
        }
        const targetEdge = this.interaction.fields.getTextInputValue('targetEdge');
        if (!targetEdge) {
            await this.interaction.reply('You must specify a target edge.', { ephemeral: true });
            return;
        }
        if (!['left', 'right', 'top', 'bottom'].includes(targetEdge)) {
            await this.interaction.reply('Invalid target edge.', { ephemeral: true });
            return;
        }
        /** @type {DominoEdge} */
        const targetEdgeValue = targetTile[targetEdge + 'Edge'];
        if (!targetEdgeValue) {
            await this.interaction.reply('Invalid target edge.', { ephemeral: true });
            return;
        }
        const dominoEnd = this.interaction.fields.getTextInputValue('dominoEnd');
        if (!dominoEnd) {
            await this.interaction.reply('You must specify a domino end.', { ephemeral: true });
            return;
        }
        if (!['left', 'right'].includes(dominoEnd)) {
            await this.interaction.reply('Invalid domino end.', { ephemeral: true });
            return;
        }
        const dominoEndValue = domino[dominoEnd + 'End'];
        if (!dominoEndValue) {
            await this.interaction.reply('Invalid domino end.', { ephemeral: true });
            return;
        }
        const dominoEdge = this.interaction.fields.getTextInputValue('dominoEdge');
        if (!dominoEdge) {
            await this.interaction.reply('You must specify a domino edge.', { ephemeral: true });
            return;
        }
        if (!['left', 'right', 'top', 'bottom'].includes(dominoEdge)) {
            await this.interaction.reply('Invalid domino edge.', { ephemeral: true });
            return;
        }
        const dominoEdgeValue = dominoEndValue[dominoEdge + 'Edge'];
        if (!dominoEdgeValue) {
            await this.interaction.reply('Invalid domino edge.', { ephemeral: true });
            return;
        }
        const placedTile = board.placeDomino(domino, targetTile, targetEdgeValue, dominoEdgeValue);
        if (!placedTile) {
            await this.interaction.reply('Invalid placement.', { ephemeral: true });
            return;
        }
        const canvas = game.draw(GameState.PLACE);
        const gameState = currentPlayerIndex === game.players.length - 1 ? GameState.DRAFT : GameState.PLACE;
        const file = new AttachmentBuilder(canvas.toBuffer(), 'game.png');
        switch (gameState) {
            case GameState.DRAFT:
                const draftRow = this.#buildDraftRow(game);
                await this.interaction.editReply({ attachments: [file], content: 'Player 1', components: [draftRow] })
                break;
            case GameState.PLACE:
                const placeRow = this.#buildPlaceRow(game);
                await this.interaction.editReply({ attachments: [file], content: `Player ${currentPlayerIndex}`, components: [placeRow] })
        }
    }

    /** @param {Game} game */
    #buildPlaceRow(game) {
        return new ActionRowBuilder()
            .addComponents(
                (
                    new ModalBuilder()
                        .setCustomId('place')
                        .setStyle(ButtonStyle.Secondary)
                        .setLabel('Place Tile')
                )
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId('target')
                            .setPlaceholder('Target Tile')
                            .setPlaceholder('Something like 0,0 or 0,1')
                    )
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId('targetEdge')
                            .setPlaceholder('Target Edge')
                            .setPlaceholder('left, right, top, or bottom')
                    )
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId('dominoEnd')
                            .setPlaceholder('Domino End')
                            .setPlaceholder('left or right')
                    )
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId('dominoEdge')
                            .setPlaceholder('Domino Edge')
                            .setPlaceholder('left, right, top, or bottom')
                    )
            );
    }

    /** @param {Game} game */
    #buildDraftRow(game) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-1')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('1st Tile')
                    .setDisabled(!!game.draftManager.currentDraft[0].player)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-2')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('2nd Tile')
                    .setDisabled(!!game.draftManager.currentDraft[1].player)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-3')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('3rd Tile')
                    .setDisabled(!!game.draftManager.currentDraft[2].player)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-4')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('4th Tile')
                    .setDisabled(!!game.draftManager.currentDraft[3].player)
            );
    }
}
