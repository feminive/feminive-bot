import { Bot, InlineKeyboard } from 'grammy'

// UTM para o GA4 atribuir a visita ao bot do Telegram
const SUPORTE_URL =
  'https://www.feminivefanfics.com.br/suporte/?utm_source=telegram&utm_medium=social&utm_campaign=bot_suporte&utm_content=comando_suporte'

export function registrarSuporte(bot: Bot) {
  bot.command('suporte', async (ctx) => {
    if (ctx.chat.type !== 'private') return

    const kb = new InlineKeyboard()
      .url('💬 Falar com o suporte', SUPORTE_URL).row()
      .text('🏠 Início', 'inicio')

    await ctx.reply(
      '🆘 *Precisa de ajuda?*\n\nÉ só abrir nossa página de suporte que a gente te responde por lá. 💕',
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })
}
