import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from 'dotenv';

config();

const newGame = new SlashCommandBuilder()
  .setName('new-game')
  .setDescription('Start a new game of King Domino.')
  .addUserOption(option =>
    option
      .setName('player1')
      .setDescription('A player to invite to the game.')
  )
  .addUserOption(option =>
    option
      .setName('player2')
      .setDescription('A player to invite to the game.')
  )
  .addUserOption(option =>
    option
      .setName('player3')
      .setDescription('A player to invite to the game.')
  );

const commands = [
  // draft,
  newGame
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands(process.env.DISCORD_APP_ID), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
