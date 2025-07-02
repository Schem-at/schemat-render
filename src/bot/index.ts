import { Client, GatewayIntentBits, REST, Routes, Events, ActivityType, ApplicationCommand, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { logger } from "../shared/logger.js";
import { commands, registerCommands } from "./command.js";

let client: Client | null = null;

// Rate limiting: user ID -> { count, resetTime }
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 5; // 5 renders per 10 minutes
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes

// File size limits
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const SUPPORTED_FORMATS = ['.schem', '.litematic'];

export async function initDiscordBot(): Promise<void> {
	const token = process.env.DISCORD_TOKEN;

	if (!token) {
		logger.warn("Discord token not provided, skipping bot initialization");
		return;
	}

	try {
		client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent,
			],
		});

		client.once("ready", () => {
			logger.info(`✅ Discord bot logged in as ${client?.user?.tag}`);
			
			// Set bot activity
			client?.user?.setActivity('Minecraft schematics | !help', { 
				type: ActivityType.Watching
			});
		});

		client.on("error", (error) => {
			logger.error("Discord bot error:", error);
		});

		client.on(Events.InteractionCreate, async (interaction) => {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                handleCommand(interaction);
            }

            // Handle button interactions
			if (interaction.isButton()) {
                try {
                    // TODO: Buttons
                } catch (error) {
                    logger.error("Error handling button interaction:", error);
                }
            }
		});

		await client.login(token);
	} catch (error) {
		logger.error("Failed to initialize Discord bot:", error);
		throw error;
	}
}

async function handleCommand(interaction: ChatInputCommandInteraction) {
    try {
        const command = commands.find(cmd => cmd.info.name == interaction.commandName);
        if (command == null) {
            await interaction.reply({
                content: `❌ Error: Command \`${interaction.commandName}\` not found.`,
                flags: MessageFlags.Ephemeral
            });
        } else {
            try {
                await command.handle(interaction);
            } catch (error) {
                logger.error("Failed to handle command", error);
            }
        }
    } catch (error) {
        logger.error("Error handling slash command:", error);
    }
}

async function syncCommands() {
	const token = process.env.DISCORD_TOKEN;
	const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
		logger.warn("Discord token or client ID not provided, skipping commands synchronization");
		return;
    }

    registerCommands();
    
	try {
        const rest = new REST().setToken(token);
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands.map(cmd => cmd.info.toJSON()) },
		);

        if (Array.isArray(data)) {
            const names = data.map(cmd => cmd.name).join(", ");
            logger.info(`Successfully synchronized ${data.length} commands: ${names}`);
        }
	} catch (error) {
		console.error(error);
	}
}
syncCommands();
