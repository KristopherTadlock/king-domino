import {
    ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChatInputCommandInteraction, Client,
    Events,
    GatewayIntentBits, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle
} from 'discord.js';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

import { config } from 'dotenv';
import { DominoTile } from './classes/domino-tile.js';
import { GameState } from './classes/enums/game-state.js';
import { GameConfiguration } from './classes/game-configuration.js';
import { Game } from './classes/game.js';
import { Player } from './classes/player.js';
import { Edges } from './classes/enums/edges.js';
import { DominoEnd } from './classes/enums/domino-end.js';

config();

/** @type {Map<number, Game} */
const activeGames = new Map();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.InteractionCreate, async interaction => {
    // console.log(interaction);
    switch (interaction.commandName) {
        case 'new-game':
            if (!interaction.isChatInputCommand()) return;
            BotInteractionHandler.onNewGame(interaction);
            return;
    }

    switch (interaction.customId) {
        case 'start':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onStart(interaction);
            break;
        case 'join':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onJoin(interaction);
            break;
        case 'leave':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onLeave(interaction);
            break;
        case 'draft-1':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onDraft(interaction, 1);
            break;
        case 'draft-2':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onDraft(interaction, 2);
            break;
        case 'draft-3':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onDraft(interaction, 3);
            break;
        case 'draft-4':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onDraft(interaction, 4);
            break;
        case 'end':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onEnd(interaction);
            break;
        case 'show-place':
            if (!interaction.isButton()) return;
            BotInteractionHandler.onShowPlace(interaction);
            break;
        case 'place':
            if (!interaction.isModalSubmit()) return;
            BotInteractionHandler.onPlace(interaction);
            break;
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);

class BotInteractionHandler {
    /** @param {ChatInputCommandInteraction} interaction */
    static async onNewGame(interaction) {
        const gameId = interaction.channelId;
        const game = new Game();
        const player = new Player(interaction.user.username, interaction.user.id);
        game.players.push(player);

        // Add players to the game if they were specified
        interaction.options.getUser('player1') &&
            game.players.push(
                new Player(
                    interaction.options.getUser('player1').username,
                    interaction.options.getUser('player1').id));
        interaction.options.getUser('player2') &&
            game.players.push(
                new Player(
                    interaction.options.getUser('player2').username,
                    interaction.options.getUser('player2').id));
        interaction.options.getUser('player3') &&
            game.players.push(
                new Player(
                    interaction.options.getUser('player3').username,
                    interaction.options.getUser('player3').id));

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
                    .setCustomId('leave')
                    .setStyle(ButtonStyle.Danger)
                    .setLabel('Leave Game')
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('end')
                    .setStyle(ButtonStyle.Danger)
                    .setLabel('End Game')
            );

        const players = game.players.map(p => `  - ${p.name}`).join('\n');
        await interaction.reply({ content: `Game started!\n\nPlayers:\n${players}`, components: [row] });
    }

    /** @param {ButtonInteraction} interaction */
    static async onJoin(interaction) {
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (player) {
            await interaction.reply({ content: 'You are already playing in this game.', ephemeral: true });
            return;
        }
        if (game.players.length >= 4) {
            await interaction.reply({ content: 'This game is already full.', ephemeral: true });
            return;
        }
        game.players.push(new Player(interaction.user.username, interaction.user.uid));

        const players = game.players.map(p => `  - ${p.name}`).join('\n');
        await interaction.update(`New Player Joined!\n\nPlayers:\n${players}`);
    }

    /** @param {ButtonInteraction} interaction */
    static async onLeave(interaction) {
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (!player) {
            await interaction.reply({ content: 'You are not currently playing in this game.', ephemeral: true });
            return;
        }
        game.players = game.players.filter(p => p.uid !== interaction.user.id);

        const gameAbandoned = game.players.length === 0;
        if (gameAbandoned) {
            activeGames.delete(gameId);
            await interaction.update({ content: 'Game abandoned.', components: [] });
            return;
        }
        const players = game.players.map(p => `  - ${p.name}`).join('\n');
        await interaction.update(`Player Left!\n\nPlayers:\n${players}`);
    }

    /** @param {ButtonInteraction} interaction */
    static async onStart(interaction) {
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (!player) {
            await interaction.reply({ content: 'You are not currently playing in this game.', ephemeral: true });
            return;
        }
        if (game.players.length < 2) {
            await interaction.reply({ content: 'You need at least 2 players to start a game.', ephemeral: true });
            return;
        }
        const expand = game.players.length === 2 ? true : false;
        const config = new GameConfiguration(game.players.length, false, expand);
        game.start(config);
        const canvas = game.draw(GameState.DRAFT);
        const file = new AttachmentBuilder(await canvas.encode('png'), { name: `game-${gameId}.png` });
        const row = this.#buildDraftRow(game);
        await interaction.update({ files: [file], content: 'Player 0', components: [row] })
    }

    /** @param {ButtonInteraction} interaction */
    static async onEnd(interaction) {
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (!player) {
            await interaction.reply({ content: 'You are not currently playing in this game.', ephemeral: true });
            return;
        }
        activeGames.delete(gameId);
        await interaction.update({ content: 'Game ended!', components: [] });
    }

    /**
     * @param {ButtonInteraction} interaction
     * @param {int} tile
     */
    static async onDraft(interaction, tile) {
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (!player) {
            await interaction.reply({ content: 'You are not currently playing in this game.', ephemeral: true });
            return;
        }

        const draft = game.draftManager.currentDraft[tile - 1];
        if (draft.player) {
            await interaction.reply({ content: 'This tile has already been drafted.', ephemeral: true });
            return;
        }
        game.draftManager.draftTile(tile - 1);
        const gameState = game.draftManager.currentDraft.every(d => d.player != null) ? GameState.PLACE : GameState.DRAFT;
        const canvas = game.draw(gameState);
        const file = new AttachmentBuilder(await canvas.encode('png'), { name: `game-${gameId}.png` });

        switch (gameState) {
            case GameState.DRAFT:
                const draftRow = this.#buildDraftRow(game);
                const currentPlayerIndex = game.draftManager.currentPlayerIndex;
                await interaction.update({ files: [file], content: `Player ${currentPlayerIndex}`, components: [draftRow] })
                break;
            case GameState.PLACE:
                const selectPlacementRow = this.#buildSelectPlacementRow();
                await interaction.update({ files: [file], content: 'Player 0', components: [selectPlacementRow] })
                break;
        }
    }

    /** @param {ButtonInteraction} interaction */
    static async onShowPlace(interaction) {
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (!player) {
            await interaction.reply({ content: 'You are not currently playing in this game.', ephemeral: true });
            return;
        }
        const currentPlayerIndex = game.draftManager.currentPlayerIndex;
        if (currentPlayerIndex !== game.players.findIndex(p => p.uid === interaction.user.id)) {
            await interaction.reply({ content: 'It is not your turn to place a tile.', ephemeral: true });
            return;
        }
        const modal = this.#buildPlacementModal();
        await interaction.showModal(modal);
    }

    /** @param {ModalSubmitInteraction} interaction */
    static async onPlace(interaction) {
        if (!interaction.isModalSubmit) return;
        const gameId = interaction.channelId;
        const game = activeGames.get(gameId);
        if (!game) {
            await interaction.reply({ content: 'No game is currently active in this channel.', ephemeral: true });
            return;
        }
        const player = game.players.find(p => p.uid === interaction.user.id);
        if (!player) {
            await interaction.reply({ content: 'You are not currently playing in this game.', ephemeral: true });
            return;
        }
        const currentPlayerIndex = game.draftManager.currentPlayerIndex;
        if (currentPlayerIndex !== game.players.findIndex(p => p.uid === interaction.user.id)) {
            await interaction.reply({ content: 'It is not your turn to place a tile.', ephemeral: true });
            return;
        }
        const board = game.players[currentPlayerIndex].board;
        const domino = game.draftManager.currentDraft.find(d => d.player === player.id)?.domino;
        if (!domino) {
            await interaction.reply({ content: 'You have not drafted a tile.', ephemeral: true });
            return;
        }

        const targetCoords = interaction.fields.getTextInputValue('target');
        if (!targetCoords) {
            await interaction.reply({ content: 'You must specify a target tile.', ephemeral: true });
            return;
        }
        /** @type {DominoTile} */
        const targetTile = board.board[targetCoords];
        if (!targetTile) {
            await interaction.reply({ content: 'Invalid target tile.', ephemeral: true });
            return;
        }

        const targetEdge = interaction.fields.getTextInputValue('targetEdge');
        if (!targetEdge) {
            await interaction.reply({ content: 'You must specify a target edge.', ephemeral: true });
            return;
        }
        if (!['left', 'right', 'top', 'bottom'].includes(targetEdge)) {
            await interaction.reply({ content: 'Invalid target edge.', ephemeral: true });
            return;
        }
        /** @type {Edges} */
        const targetEdgeValue =
            targetEdge === 'left' ? Edges.LEFT :
                targetEdge === 'right' ? Edges.RIGHT :
                    targetEdge === 'top' ? Edges.TOP :
                        Edges.BOTTOM;

        const dominoEnd = interaction.fields.getTextInputValue('dominoEnd');
        if (!dominoEnd) {
            await interaction.reply({ content: 'You must specify a domino end.', ephemeral: true });
            return;
        }
        if (!['left', 'right'].includes(dominoEnd)) {
            await interaction.reply({ content: 'Invalid domino end.', ephemeral: true });
            return;
        }
        /** @type {DominoEnd} */
        const dominoEndValue =
            dominoEnd === 'left' ? DominoEnd.LEFT :
                DominoEnd.RIGHT;

        const placedTile = board.placeDomino(domino, targetTile, targetEdgeValue, dominoEndValue);
        if (!placedTile) {
            await interaction.reply({ content: 'Invalid placement.', ephemeral: true });
            return;
        }
        const canvas = game.draw(GameState.PLACE);
        const gameState = currentPlayerIndex === game.players.length - 1 ? GameState.DRAFT : GameState.PLACE;
        const file = new AttachmentBuilder(await canvas.encode('png'), { name: `game-${gameId}.png` });
        switch (gameState) {
            case GameState.DRAFT:
                const draftRow = this.#buildDraftRow(game);
                await interaction.update({ files: [file], content: 'Player 0', components: [draftRow] })
                break;
            case GameState.PLACE:
                const selectPlacementRow = this.#buildSelectPlacementRow();
                await interaction.update({ files: [file], content: `Player ${currentPlayerIndex}`, components: [selectPlacementRow] })
        }
    }

    static #buildSelectPlacementRow() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('show-place')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('select placement')
            )
    }

    static #buildPlacementModal() {
        const modal = new ModalBuilder()
            .setCustomId('place')
            .setTitle('Place Tile');

        const target = new TextInputBuilder()
            .setCustomId('target')
            .setLabel('Target Tile coordinates')
            .setPlaceholder('Something like 0,0 or 0,1')
            .setStyle(TextInputStyle.Short)
            .setValue('0,0');

        const targetEdge = new TextInputBuilder()
            .setCustomId('targetEdge')
            .setLabel('Target Edge')
            .setPlaceholder('left, right, top, or bottom')
            .setStyle(TextInputStyle.Short)
            .setValue('right');

        const dominoEnd = new TextInputBuilder()
            .setCustomId('dominoEnd')
            .setLabel('Domino End')
            .setPlaceholder('left or right')
            .setStyle(TextInputStyle.Short)
            .setValue('left');

        const firstActionRow = new ActionRowBuilder().addComponents(target);
        const secondActionRow = new ActionRowBuilder().addComponents(targetEdge);
        const thirdActionRow = new ActionRowBuilder().addComponents(dominoEnd);

        modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

        return modal;
    }

    /** @param {Game} game */
    static #buildDraftRow(game) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-1')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('1st Tile')
                    .setDisabled(game.draftManager.currentDraft[0].player != null)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-2')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('2nd Tile')
                    .setDisabled(game.draftManager.currentDraft[1].player != null)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-3')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('3rd Tile')
                    .setDisabled(game.draftManager.currentDraft[2].player != null)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('draft-4')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel('4th Tile')
                    .setDisabled(game.draftManager.currentDraft[3].player != null)
            );
    }
}
