import { Bot, InlineKeyboard } from 'grammy'

const BOT_USERNAME = 'feminivebot'

export function registrarStart(bot: Bot) {
  bot.command('start', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('📚 Novelas em séries', 'novelas').row()
      .text('📝 Contos curtos', 'contos_menu').row()
      .text('🎲 Surpreenda-me', 'surpresa').row()
      .text('✅ Já sou assinante', 'ja_sou_assinante').text('💳 Ver planos', 'ver_planos')

    const mensagem = '✨ *Bem-vinda ao Feminive!*\n\nO que você quer ler hoje?'
    const isGrupo = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'

    if (!isGrupo) {
      // No privado responde normalmente
      await ctx.reply(mensagem, { parse_mode: 'Markdown', reply_markup: kb })
      return
    }

    // No grupo tenta mandar DM
    try {
      await ctx.api.sendMessage(ctx.from!.id, mensagem, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
      // Apaga o comando do grupo se tiver permissão
      await ctx.deleteMessage().catch(() => {})
    } catch {
      // Usuário nunca abriu o bot — manda link no grupo
      const linkKb = new InlineKeyboard()
        .url('💬 Abrir conversa', `https://t.me/${BOT_USERNAME}?start=inicio`)
      await ctx.reply(
        `${ctx.from?.first_name ? `*${ctx.from.first_name}*, ` : ''}clique abaixo para conversar comigo no privado! 💕`,
        { parse_mode: 'Markdown', reply_markup: linkKb }
      )
    }
  })
}
