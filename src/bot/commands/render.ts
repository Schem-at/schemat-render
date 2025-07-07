import { AttachmentBuilder, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../command";
import { logger } from "../../shared/logger";
import { TimeoutError } from "puppeteer";
import { renderSchematic, renderSchematicVideo } from "../../services/renderer";

const SUPPORTED_FORMATS = ['schem', 'litematic'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export default class Render implements ICommand {
    info = new SlashCommandBuilder()
        .setName("render")
        .setDescription("Generates a render of a schematic")
        .addAttachmentOption((option) => option
            .setName("schematic")
            .setDescription("The schematic to render")
            .setRequired(true)
        )
        .addBooleanOption((option) => option
            .setName("video")
            .setDescription("Whether to take a still picture (default) or a spinning video")
            .setRequired(false)
        );

    async handle(interaction: ChatInputCommandInteraction) {
        // Options
        const attachment = interaction.options.getAttachment("schematic");
        const videoMode = interaction.options.getBoolean("video");

        // Check schematic existance
        if (attachment == null) {
            await interaction.reply({content: "❌ Schematic not found", flags: MessageFlags.Ephemeral});
            return;
        }

        // Check schem format
        const format = attachment.name.split('.').slice(1).pop() ?? '';
        if (!SUPPORTED_FORMATS.includes(format)) {
            await interaction.reply({content: `❌ Invalid file format "${format}". Supported formats: ${SUPPORTED_FORMATS.join(", ")}`, flags: MessageFlags.Ephemeral});
            return;
        }

        // Check file size
        if (attachment.size > MAX_FILE_SIZE) {
            await interaction.reply({content: `❌ This file is ${Math.floor(attachment.size / 1024)} ko and exceeds the limit of ${MAX_FILE_SIZE / 1024} ko`, flags: MessageFlags.Ephemeral});
            return;
        }

        // Let the user know this will take a while
        await interaction.deferReply();

        try {
            logger.info(`Processing ${videoMode ? "video" : "image"} render ${attachment.url}`);

            const response = await fetch(attachment.url);
            if (!response.ok)
                throw new Error(`Failed to download attachment: ${response.statusText}`);

            const schematicBuffer = Buffer.from(await response.arrayBuffer());

            // Set up render options
            // TODO: Editable settings
            const renderOptions = videoMode ? {
                // Video settings
                duration: 5,
                width: 1280,
                height: 720,
                frameRate: 30,
            } : {
                // Image settings
                width: 1920,
                height: 1080,
                format: "image/png" as const,
                quality: 0.95,
            };

            // Render the schematic
            const renderer = videoMode ? renderSchematicVideo : renderSchematic;
            const renderedBuffer = await renderer(schematicBuffer, renderOptions);

            // Create Discord attachment
            await interaction.editReply({ files: [
                new AttachmentBuilder(renderedBuffer, {
                    name: attachment.name.replace(/\.[^/.]+$/, "") + (videoMode ? "_animation.webm" : "_render.png"),
                })
            ]});

        } catch (error) {
            // Handle timeouts and errors
            if (error instanceof TimeoutError) {
                await interaction.editReply({ content: "⌛ Render took too long. Aborted. Try again with a lower block count or settings." });
                // TODO: Add a button to lower the settings

            } else {
                logger.error(`Failed to render schematic "${attachment.name}":`, error);
                await interaction.editReply({ content: `❌ An error occured:` });
            }
        }
    }
}
