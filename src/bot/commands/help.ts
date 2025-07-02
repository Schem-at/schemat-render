import { APIEmbedField, ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from "discord.js";
import { commands, ICommand } from "../command";

export default class Help implements ICommand {
    info = new SlashCommandBuilder()
        .setName("help")
        .setDescription("How to use the bot");

    async handle(interaction: ChatInputCommandInteraction) {
        const embeds = commands.map(command => 
            new EmbedBuilder()
                .setTitle(getUsage(command.info))
                .setDescription(command.info.description)
                .addFields(getParameters(command.info))
                .setColor("#ff0000")
        );

        await interaction.reply({embeds: embeds, flags: MessageFlags.Ephemeral});
    }
}

function getUsage(builder: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder): string {
    let usage = '/' + builder.name;

    for (const ioption of builder.options) {
        const option = ioption.toJSON();
        usage += option.required ? ` <${option.name}>` : ` [${option.name}]`;
    }

    return usage;
}

function getParameters(builder: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder): APIEmbedField[] {
    return builder.options.map(ioption => {
        const option = ioption.toJSON();
        return {
            name: option.name,
            value: option.description,
            inline: true,
        };
    });
}
