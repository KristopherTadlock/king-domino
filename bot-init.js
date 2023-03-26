import { REST, Routes, SlashCommandBuilder } from 'discord.js';

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

const rest = new REST({ version: '10' }).setToken('MTA4OTQ2OTkzMzc2MDU1MzA0Mg.GqYk_R.nAflY6hFy2RYra1AMILkqKjlaAvuXrr1o5xCzE');

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands('1089469933760553042'), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
