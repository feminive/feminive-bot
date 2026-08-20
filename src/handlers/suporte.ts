import { Bot, InlineKeyboard } from 'grammy'

// Handles em code (`) para o Telegram não transformar em menção de usuário
// e para a leitora poder tocar e copiar.
const TEXTO = [
  '🆘 *Precisa de ajuda?*',
  '',
  '📧 *E-mail*',
  'Para problemas com conta, pagamento ou assinatura.',
  '`contos@feminivefanfics.com.br`',
  '',
  '📸 *Instagram*',
  'Manda uma DM se precisar de ajuda rápida.',
  '`@feminivefanfics`',
  '',
  '👽 *Reddit*',
  'Comunidade e dúvidas gerais sobre o site.',
  '`u/Feminive`',
  '',
  '✖️ *X (Twitter)*',
  'Atualizações e avisos sobre o site.',
  '`@feminivefanfics`',
].join('\n')

export function registrarSuporte(bot: Bot) {
  bot.command('suporte', async (ctx) => {
    if (ctx.chat.type !== 'private') return

    const kb = new InlineKeyboard().text('🏠 Início', 'inicio')

    try {
      await ctx.reply(TEXTO, { parse_mode: 'Markdown', reply_markup: kb })
    } catch {
      await ctx.reply(TEXTO.replace(/[*`]/g, ''), { reply_markup: kb })
    }
  })
}
