import { Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder, Events, ChatInputCommandInteraction, Attachment, ActivityType, ButtonInteraction } from "discord.js";
import { logger } from "../shared/logger.js";
import { renderSchematic, renderSchematicVideo } from "../services/renderer.js";

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
                try {
                    await handleCommand(interaction);
                } catch (error) {
                    logger.error("Error handling slash command:", error);
                }
            }

            // Handle button interactions
			if (interaction.isButton()) {
                try {
                    await handleButtonInteraction(interaction);
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

/**
 * Handle bot commands
 */
async function handleCommand(interaction:  ChatInputCommandInteraction) {
	switch (interaction.commandName) {
		case 'ping':
			await handlePingCommand(interaction);
			break;
		case 'help':
			await handleHelpCommand(interaction);
			break;
		case 'render':
			await handleRenderCommand(interaction, 'image');
			break;
		case 'video':
		case 'animate':
			await handleRenderCommand(interaction, 'video');
			break;
		case 'status':
			await handleStatusCommand(interaction);
			break;
		case 'info':
			await handleInfoCommand(interaction);
			break;
		default:
			// Unknown command - ignore silently
			break;
	}
}

/**
 * Handle ping command
 */
async function handlePingCommand(interaction: ChatInputCommandInteraction) {
	const embed = new EmbedBuilder()
		.setColor(0x00AE86)
		.setTitle("🏓 Pong!")
		.setDescription("Schemat render service is online and ready!")
		.addFields(
			{ name: "Bot Status", value: "✅ Online", inline: true },
			{ name: "Render Engine", value: "✅ Ready", inline: true }
		)
		.setTimestamp();

	await interaction.reply({ embeds: [embed] });
}

/**
 * Handle help command
 */
async function handleHelpCommand(interaction: ChatInputCommandInteraction | ButtonInteraction) {
	const embed = new EmbedBuilder()
		.setColor(0x5865F2)
		.setTitle("🔧 Schemat Bot Commands")
		.setDescription("Transform your Minecraft schematics into beautiful renders!")
		.addFields(
			{ 
				name: "📸 Image Rendering", 
				value: "• **Drop a schematic** - Auto-render as image\n• **!render** + attachment - Force image render\n• Supports: `.schem`, `.litematic`", 
				inline: false 
			},
			{ 
				name: "🎬 Video Rendering", 
				value: "• **!video** + attachment - Create rotation animation\n• **!animate** + attachment - Same as !video\n• 6-second smooth rotation at 30fps", 
				inline: false 
			},
			{ 
				name: "ℹ️ Utility Commands", 
				value: "• **!ping** - Check bot status\n• **!status** - View render queue\n• **!info** - Technical details\n• **!help** - Show this help", 
				inline: false 
			},
			{ 
				name: "⚠️ Limits", 
				value: `• Max file size: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB\n• Rate limit: ${RATE_LIMIT_MAX} renders per ${RATE_LIMIT_WINDOW / 60000} minutes\n• Supported: .schem, .litematic`, 
				inline: false 
			}
		)
		.setFooter({ text: "Just drop your schematic file to get started!" })
		.setTimestamp();

	await interaction.reply({ embeds: [embed] });
}

/**
 * Handle render command (image or video)
 */
async function handleRenderCommand(interaction: ChatInputCommandInteraction, type: 'image' | 'video') {
    const attachment = interaction.options.getAttachment("schematic");

	if (attachment == null) {
		const embed = new EmbedBuilder()
			.setColor(0xFF6B6B)
			.setTitle("❌ No File Attached")
			.setDescription(`Please attach a schematic file (.schem or .litematic) to render as ${type}.`)
			.addFields(
				{ name: "Supported Formats", value: SUPPORTED_FORMATS.join(', '), inline: true },
				{ name: "Max File Size", value: `${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`, inline: true }
			);

		await interaction.reply({ embeds: [embed] });
		return;
	}

	await handleSchematicAttachments(interaction, [attachment], type);
}

/**
 * Handle status command
 */
async function handleStatusCommand(interaction: ChatInputCommandInteraction) {
	const userLimit = rateLimits.get(interaction.user.id);
	const remainingUses = userLimit ? Math.max(0, RATE_LIMIT_MAX - userLimit.count) : RATE_LIMIT_MAX;
	const resetTime = userLimit?.resetTime ?? Date.now();
	const resetIn = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000 / 60));

	const embed = new EmbedBuilder()
		.setColor(0x4F46E5)
		.setTitle("📊 Your Render Status")
		.addFields(
			{ name: "Remaining Renders", value: `${remainingUses}/${RATE_LIMIT_MAX}`, inline: true },
			{ name: "Reset Time", value: resetIn > 0 ? `${resetIn} minutes` : "Now", inline: true },
			{ name: "Queue Status", value: "Available", inline: true }
		)
		.setFooter({ text: `Rate limit: ${RATE_LIMIT_MAX} renders per ${RATE_LIMIT_WINDOW / 60000} minutes` })
		.setTimestamp();

	await interaction.reply({ embeds: [embed] });
}

/**
 * Handle info command
 */
async function handleInfoCommand(interaction: ChatInputCommandInteraction) {
	const embed = new EmbedBuilder()
		.setColor(0x8B5CF6)
		.setTitle("🔍 Technical Information")
		.setDescription("Schemat Bot technical specifications and capabilities")
		.addFields(
			{ name: "Render Engine", value: "Three.js + WebGL", inline: true },
			{ name: "Output Quality", value: "1920x1080 (Full HD)", inline: true },
			{ name: "Video Format", value: "WebM (VP8)", inline: true },
			{ name: "Image Format", value: "PNG (Lossless)", inline: true },
			{ name: "Max Schematic Size", value: "Unlimited blocks", inline: true },
			{ name: "Processing Time", value: "~5-30 seconds", inline: true },
			{ name: "Supported Games", value: "Minecraft Java Edition", inline: false },
			{ name: "Compatible Tools", value: "WorldEdit, Litematica, Schematica, MCEdit", inline: false }
		)
		.setFooter({ text: "Built with ❤️ for the Minecraft community" })
		.setTimestamp();

	await interaction.reply({ embeds: [embed] });
}

/**
 * Check rate limits for user
 */
function checkRateLimit(userId: string): boolean {
	const now = Date.now();
	const userLimit = rateLimits.get(userId);

	if (!userLimit || now > userLimit.resetTime) {
		// Reset or create new limit
		rateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
		return true;
	}

	if (userLimit.count >= RATE_LIMIT_MAX) {
		return false; // Rate limited
	}

	userLimit.count++;
	rateLimits.set(userId, userLimit);
	return true;
}

/**
 * Get time until rate limit reset
 */
function getRateLimitReset(userId: string): number {
	const userLimit = rateLimits.get(userId);
	if (!userLimit) return 0;
	
	return Math.max(0, Math.ceil((userLimit.resetTime - Date.now()) / 1000 / 60));
}

/**
 * Validate schematic file
 */
function validateSchematicFile(attachment: Attachment): string | null {
	// Check file extension
	const fileName = attachment.name.toLowerCase();
	const isSupported = SUPPORTED_FORMATS.some(format => fileName.endsWith(format));
	
	if (!isSupported) {
		return `Unsupported file format. Please use: ${SUPPORTED_FORMATS.join(', ')}`;
	}

	// Check file size
	if (attachment.size > MAX_FILE_SIZE) {
		return `File too large. Maximum size: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`;
	}

	return null; // Valid
}

/**
 * Handle message attachments and render schematics
 */
async function handleSchematicAttachments(interaction: ChatInputCommandInteraction, schematics: Attachment[], type: 'image' | 'video') {
    // Check rate limit first
	if (!checkRateLimit(interaction.user.id)) {
		const resetTime = getRateLimitReset(interaction.user.id);
		const embed = new EmbedBuilder()
			.setColor(0xFF6B6B)
			.setTitle("⏰ Rate Limited")
			.setDescription(`You've reached the render limit. Try again in **${resetTime} minutes**.`)
			.addFields(
				{ name: "Limit", value: `${RATE_LIMIT_MAX} renders per ${RATE_LIMIT_WINDOW / 60000} minutes`, inline: true },
				{ name: "Reset Time", value: `${resetTime} minutes`, inline: true }
			);

		await interaction.reply({ embeds: [embed] });
		return;
	}

	if (schematics.length === 0) {
		// no errors, it's probably not a schematic file and we can ignore it
		return;
	}

	// Process each valid attachment
	for (const attachment of schematics) {
		if (type === 'video') {
			await renderSchematicVideoAttachment(interaction, attachment);
		} else {
			await renderSchematicImageAttachment(interaction, attachment);
		}
	}
}

/**
 * Download and render a single schematic attachment as image
 */
async function renderSchematicImageAttachment(interaction: ChatInputCommandInteraction, attachment: Attachment) {
	const startTime = Date.now();

	try {
		// Show we're processing
		await interaction.deferReply();

		logger.info(`Processing image: ${attachment.name} (${attachment.size} bytes)`);

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
			quality: 0.95,
		};

		// Render the schematic
		const renderedImageBuffer = await renderSchematic(schematicBuffer, renderOptions);

		// Create Discord attachment
		const imageAttachment = new AttachmentBuilder(renderedImageBuffer, {
			name: `${attachment.name.replace(/\.[^/.]+$/, "")}_render.png`,
		});

		const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
		const fileSizeMB = (attachment.size / 1024 / 1024).toFixed(1);

		// Create rich embed response
		const embed = new EmbedBuilder()
			.setColor(0x00AE86)
			.setTitle("🎨 Schematic Rendered!")
			.setDescription(`Your **${attachment.name}** has been successfully rendered.`)
			.addFields(
				{ name: "📁 Original Size", value: `${fileSizeMB}MB`, inline: true },
				{ name: "⏱️ Processing Time", value: `${processingTime}s`, inline: true },
				{ name: "📐 Resolution", value: "1920×1080", inline: true }
			)
			.setImage(`attachment://${imageAttachment.name}`)
			.setFooter({ text: "Use !video for animation • !help for more commands" })
			.setTimestamp();

		// Send the rendered image
		await interaction.editReply({
			embeds: [embed],
			files: [imageAttachment],
		});

		logger.info(`Successfully rendered image for ${attachment.name} in ${processingTime}s`);

	} catch (error: any) {
		logger.error(`Failed to render image for ${attachment.name}:`, error);

		// Send error embed
		const errorEmbed = new EmbedBuilder()
			.setColor(0xFF6B6B)
			.setTitle("❌ Render Failed")
			.setDescription(`Failed to render **${attachment.name}**`)
			.addFields(
				{ name: "Error", value: error.message ?? "Unknown error", inline: false },
				{ name: "Supported Formats", value: SUPPORTED_FORMATS.join(', '), inline: true },
				{ name: "Need Help?", value: "Use `!help` for assistance", inline: true }
			)
			.setTimestamp();

		await interaction.editReply({ embeds: [errorEmbed] });
	}
}

/**
 * Download and render a single schematic attachment as video
 */
async function renderSchematicVideoAttachment(interaction: ChatInputCommandInteraction, attachment: Attachment) {
	const startTime = Date.now();

	try {
		// Show we're processing
		await interaction.deferReply();

		logger.info(`Processing video: ${attachment.name} (${attachment.size} bytes)`);

		// Download the attachment
		const response = await fetch(attachment.url);
		if (!response.ok) {
			throw new Error(`Failed to download attachment: ${response.statusText}`);
		}

		const schematicBuffer = Buffer.from(await response.arrayBuffer());

		// Set up video render options
		const videoOptions = {
			duration: 5,        // 6 second video
			width: 1280,      // 1920px width
			height: 720,       // 1080px height
			frameRate: 30,      // 30fps for smooth rotation
		};

		// Render the video
		const renderedVideoBuffer = await renderSchematicVideo(schematicBuffer, videoOptions);

		// Create Discord attachment
		const videoAttachment = new AttachmentBuilder(renderedVideoBuffer, {
			name: `${attachment.name.replace(/\.[^/.]+$/, "")}_animation.webm`,
		});

		const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
		const fileSizeMB = (attachment.size / 1024 / 1024).toFixed(1);
		const outputSizeMB = (renderedVideoBuffer.length / 1024 / 1024).toFixed(1);

		// Create rich embed response
		const embed = new EmbedBuilder()
			.setColor(0x8B5CF6)
			.setTitle("🎬 Animation Complete!")
			.setDescription(`Your **${attachment.name}** has been rendered as a smooth rotation video.`)
			.addFields(
				{ name: "📁 Original Size", value: `${fileSizeMB}MB`, inline: true },
				{ name: "🎥 Video Size", value: `${outputSizeMB}MB`, inline: true },
				{ name: "⏱️ Processing Time", value: `${processingTime}s`, inline: true },
				{ name: "🎞️ Duration", value: `${videoOptions.duration}s`, inline: true },
				{ name: "📐 Resolution", value: `${videoOptions.width}×${videoOptions.height}`, inline: true },
				{ name: "🔄 Animation", value: "360° rotation", inline: true }
			)
			.setFooter({ text: "Use !render for static image • !help for more commands" })
			.setTimestamp();

		// Add action buttons
		const row = new ActionRowBuilder<ButtonBuilder>()
			.addComponents(
				new ButtonBuilder()
					.setCustomId(`render_image_${attachment.name}`)
					.setLabel("📸 Render Image")
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId(`help_commands`)
					.setLabel("❓ Help")
					.setStyle(ButtonStyle.Secondary)
			);

		// Send the rendered video
		await interaction.editReply({
			embeds: [embed],
			files: [videoAttachment],
			components: [row],
		});

		logger.info(`Successfully rendered video for ${attachment.name} in ${processingTime}s`);

	} catch (error: any) {
		// check the lenghth of the error message since it can possible contain the video data
		if (error.message && error.message.length < 1000) {
			logger.error(`Failed to render video for ${attachment.name}:`, error);
		}
		else {
			logger.error(`Failed to render video for ${attachment.name}:`, "Error message too long to log");
			// log some details about the error
			logger.error(`Error details: ${JSON.stringify({
				name: error.name,
				stack: error.stack,
			})}`);

		}

		// Send error embed
		const errorEmbed = new EmbedBuilder()
			.setColor(0xFF6B6B)
			.setTitle("❌ Video Render Failed")
			.setDescription(`Failed to create animation for **${attachment.name}**`)
			.addFields(
				{ name: "Error", value: error.message ?? "Unknown error", inline: false },
				{ name: "Try Instead", value: "Use `!render` for a static image", inline: true },
				{ name: "Need Help?", value: "Use `!help` for assistance", inline: true }
			)
			.setTimestamp();

		await interaction.editReply({ embeds: [errorEmbed] });
	}
}

/**
 * Handle button interactions
 */
async function handleButtonInteraction(interaction: ButtonInteraction) {
	if (interaction.customId === 'help_commands') {
		await handleHelpCommand(interaction);
	}
	// Add more button handlers as needed
}

/**
 * List of all the slash commands
 */
const commands = [
    new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!')
        .toJSON(),
    
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Sends help on how to use the bot')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('render')
        .setDescription('Generates a render of a schematic.')
        .addAttachmentOption((option) => option
            .setName("schematic")
            .setDescription("The schematic to render")
            .setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('video')
        .setDescription('Generates a spinning render of a schematic')
        .addAttachmentOption((option) => option
            .setName("schematic")
            .setDescription("The schematic to render")
            .setRequired(true)
        )
        .toJSON(),

    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check your render quota and more')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('info')
        .setDescription('See technical specifications')
        .toJSON(),
];

async function syncCommands() {
	const token = process.env.DISCORD_TOKEN;
	const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
		logger.warn("Discord token or client ID not provided, skipping commands synchronization");
		return;
    }

	const rest = new REST().setToken(token);

	try {
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		);

        if (Array.isArray(data)) {
            logger.info(`Successfully synchronized ${data.length} commands.`);
        }
	} catch (error) {
		console.error(error);
	}
}
syncCommands();

export function getDiscordClient(): Client | null {
	return client;
}