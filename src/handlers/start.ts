import { Bot, InlineKeyboard } from 'grammy'

export function registrarStart(bot: Bot) {
  bot.command('start', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('📚 Novelas em séries', 'novelas').row()
      .text('📝 Contos curtos', 'contos_menu').row()
      .text('🎲 Surpreenda-me', 'surpresa').row()
      .text('✅ Já sou assinante', 'ja_sou_assinante').text('💳 Ver planos', 'ver_planos')

    await ctx.reply(
      '✨ *Bem-vinda ao Feminive!*\n\nO que você quer ler hoje?',
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })
}
