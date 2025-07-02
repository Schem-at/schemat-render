import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from "discord.js";
import fs from "fs";
import path from "path";

export const commands: ICommand[] = new Array();

export interface ICommand {
    readonly info: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
    handle(interaction: ChatInputCommandInteraction): Promise<void>;
}

export function registerCommands() {
    // Unregister all commands
    commands.splice(0, commands.length);

    // Find all the commands
    const dirPath = 'commands';
    const commandsDirPath = path.join(__dirname, dirPath);
    const files = fs.readdirSync(commandsDirPath);
    const commandFiles = files.filter(file => file.endsWith('.ts'));

    // Register all the commands
    commandFiles.forEach(file => {
        const command = require("./" + path.join(dirPath, file)).default;
        commands.push(new command());
    });
}