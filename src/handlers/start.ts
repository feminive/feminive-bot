import { Bot, InlineKeyboard } from 'grammy'

export function registrarStart(bot: Bot) {
  bot.command('start', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('📝 Contos', 'temas')
      .text('🎲 Surpreenda-me', 'surpresa')

    await ctx.reply(
      '✨ *Bem-vinda ao Feminive!*\n\nO que você quer ler hoje?',
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })
}
