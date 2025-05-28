import { Client, GatewayIntentBits } from "discord.js";
import { logger } from "../shared/logger.js";

let client: Client | null = null;

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
		});

		client.on("error", (error) => {
			logger.error("Discord bot error:", error);
		});

		// Basic ping command
		client.on("messageCreate", async (message) => {
			if (message.author.bot) return;

			if (message.content === "!ping") {
				await message.reply("🏓 Pong! Schemat render service is online.");
			}
		});

		await client.login(token);
	} catch (error) {
		logger.error("Failed to initialize Discord bot:", error);
		throw error;
	}
}

export function getDiscordClient(): Client | null {
	return client;
}
