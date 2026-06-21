import { Bot, InlineKeyboard } from 'grammy'
import { montarLeitura } from './leitura.js'

export const BOT_USERNAME = 'feminivebot'

export function registrarStart(bot: Bot) {
  bot.command('start', async (ctx) => {
    const payload = (ctx.match ?? '').trim()

    // Deep link vindo do canal: /start ler_<id> abre o conto direto
    const deepLinkLer = payload.match(/^ler_(.+)$/)
    if (deepLinkLer && ctx.chat.type === 'private') {
      const leitura = await montarLeitura(deepLinkLer[1], 0, ctx.from!.id, 'canal')

      if (leitura.ok) {
        try {
          await ctx.reply(leitura.texto, { parse_mode: 'Markdown', reply_markup: leitura.kb })
        } catch {
          await ctx.reply(leitura.texto.replace(/\*/g, ''), { reply_markup: leitura.kb })
        }
        return
      }
      // Conto não encontrado — cai no menu normal
    }

    const kb = new InlineKeyboard()
      .text('📚 Novelas em séries', 'novelas').row()
      .text('📝 Contos curtos', 'contos_menu').row()
      .text('🎲 Surpreenda-me', 'surpresa').row()
      .text('✅ Já sou assinante', 'ja_sou_assinante').text('💳 Ver planos', 'ver_planos')

    const mensagem = '✨ *Que bom ter você no Feminive!*\n\nO que você quer ler hoje?'
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
