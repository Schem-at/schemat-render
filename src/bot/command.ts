import { ChatInputCommandInteraction, ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, REST, Routes, SharedSlashCommand, SlashCommandBuilder, UserContextMenuCommandInteraction } from "discord.js";
import fs from "fs";
import path from "path";
import { logger } from "../shared/logger";
import Reload from "./commands/reload";

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

    return [...commands, ...menus];
}

export async function syncCommands(commands_: (ICommand | IMenuCommand)[]) {
	const token = process.env.DISCORD_TOKEN;
	const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
		logger.warn("Discord token or client ID not provided, skipping commands synchronization");
		return;
    }

    // Ensure we have the reload command
    let reload = commands.find(cmd => cmd instanceof Reload);
    if (reload == undefined) {
        reload = new Reload();
        commands.push(reload);
    }
    if (commands_.length == 0)
        commands_ = [reload];
    
	try {
        const rest = new REST().setToken(token);
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands_.map(cmd => cmd.info.toJSON()) },
		);

        if (Array.isArray(data)) {
            const names = data.map(cmd => cmd.name).join(", ");
            logger.info(`Successfully synchronized ${data.length} commands & menus: ${names}`);
        }
	} catch (error) {
		console.error(error);
	}
}