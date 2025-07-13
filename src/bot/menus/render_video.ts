import { ApplicationCommandType, ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, MessageFlags } from "discord.js";
import { IMenuCommand } from "../command";
import { checkError, render } from "../utils/render";
import { TimeoutError } from "puppeteer";
import { logger } from "../../shared/logger";

export default class RenderVideo implements IMenuCommand {
    info = new ContextMenuCommandBuilder()
        .setName("Render video")
        .setType(ApplicationCommandType.Message);
    
    async handle(interaction: MessageContextMenuCommandInteraction) {
        const attachments = interaction.targetMessage.attachments;
        const attachment = attachments.find(attachment => checkError(attachment) == null);

        // Pre-checking
        if (attachment == undefined) {
            await interaction.reply({content: "❌ no valid attachment found on this message", flags: MessageFlags.Ephemeral});
            return;
        }
        await interaction.deferReply();

        try {
            const video = await render(attachment!, true);
            await interaction.editReply({files: [video]});

        } catch (error) {
            if (error instanceof TimeoutError) {
                await interaction.editReply({ content: "⌛ Render took too long. Aborted." });
            } else {
                logger.error(`Failed to render schematic "${attachment!.name}":`, error);
                await interaction.editReply({ content: `❌ An error occurred:` });
            }
        }
    }
}