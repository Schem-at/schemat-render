import { ChatInputCommandInteraction, ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, SharedSlashCommand, SlashCommandBuilder, UserContextMenuCommandInteraction } from "discord.js";
import fs from "fs";
import path from "path";

export const commands: ICommand[] = new Array();
export const menus: IMenuCommand[] = new Array();

export interface ICommand {
    readonly info: SlashCommandBuilder | SharedSlashCommand;
    handle(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface IMenuCommand {
    readonly info: ContextMenuCommandBuilder;
    handle(interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction): Promise<void>;
}

export function registerCommands() {
    // Unregister all commands & menus
    commands.splice(0, commands.length);
    menus.splice(0, menus.length);

    // Find all the commands
    const commandsDirPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsDirPath)
        .filter(file => file.endsWith('.ts'));

    // Register all the commands
    commandFiles.forEach(file => {
        const command = require("./" + path.join('commands', file)).default;
        commands.push(new command());
    });
    
    // Find all the context menus
    const menuDirPath = path.join(__dirname, 'menus');
    const menuFiles = fs.readdirSync(menuDirPath)
        .filter(file => file.endsWith('.ts'));
    
    // Register all the menus
    menuFiles.forEach(file => {
        const menu = require("./" + path.join('menus', file)).default;
        menus.push(new menu());
    });
}