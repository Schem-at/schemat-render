import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import { logger } from "../shared/logger.js";
import { renderSchematic } from "../services/renderer.js";

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

		// Handle messages with attachments
		client.on("messageCreate", async (message) => {
			if (message.author.bot) return;

			// Handle ping command
			if (message.content === "!ping") {
				await message.reply("🏓 Pong! Schemat render service is online.");
				return;
			}

			// Check for schematic attachments
			if (message.attachments.size > 0) {
				await handleSchematicAttachments(message);
			}
		});

		await client.login(token);
	} catch (error) {
		logger.error("Failed to initialize Discord bot:", error);
		throw error;
	}
}

/**
 * Handle message attachments and render schematics
 */
async function handleSchematicAttachments(message: any) {
	const schematicAttachments = message.attachments.filter((attachment: any) => {
		const fileName = attachment.name.toLowerCase();
		return fileName.endsWith(".schem") || fileName.endsWith(".litematic");
	});

	if (schematicAttachments.size === 0) {
		return; // No schematic files found
	}

	for (const [, attachment] of schematicAttachments) {
		await renderSchematicAttachment(message, attachment);
	}
}

/**
 * Download and render a single schematic attachment
 */
async function renderSchematicAttachment(message: any, attachment: any) {
	const startTime = Date.now();

	try {
		// Send initial reaction to show we're processing
		await message.react("⏳");

		logger.info(
			`Processing schematic: ${attachment.name} (${attachment.size} bytes)`
		);

		// Download the attachment
		const response = await fetch(attachment.url);
		if (!response.ok) {
			throw new Error(`Failed to download attachment: ${response.statusText}`);
		}

		const schematicBuffer = Buffer.from(await response.arrayBuffer());

		// Set up render options
		const renderOptions = {
			width: 1920,
			height: 1080,
			format: "image/png" as const,
			quality: 0.9,
		};

		// Render the schematic
		const renderedImageBuffer = await renderSchematic(
			schematicBuffer,
			renderOptions
		);

		// Create Discord attachment
		const imageAttachment = new AttachmentBuilder(renderedImageBuffer, {
			name: `${attachment.name.replace(/\.[^/.]+$/, "")}_render.png`,
		});

		const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

		// Send the rendered image
		await message.reply({
			content: `🎨 **Schematic Rendered!**\n📁 **File:** ${attachment.name}\n⏱️ **Processing time:** ${processingTime}s`,
			files: [imageAttachment],
		});

		// Replace loading reaction with success
		await message.reactions.removeAll();
		await message.react("✅");

		logger.info(
			`Successfully rendered ${attachment.name} in ${processingTime}s`
		);
	} catch (error) {
		logger.error(`Failed to render schematic ${attachment.name}:`, error);

		// Replace loading reaction with error
		await message.reactions.removeAll();
		await message.react("❌");

		// Send error message
		await message.reply({
			content: `❌ **Failed to render schematic**\n📁 **File:** ${
				attachment.name
			}\n🔍 **Error:** ${
				error.message || "Unknown error"
			}\n\n*Supported formats: .schem, .litematic*`,
		});
	}
}

export function getDiscordClient(): Client | null {
	return client;
}
