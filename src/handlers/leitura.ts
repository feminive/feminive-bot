import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { paginarTexto } from '../lib/paginator.js'

export function registrarLeitura(bot: Bot) {
  bot.callbackQuery(/^ler:(.+):(\d+)$/, async (ctx) => {
    const postId = ctx.match[1]
    const pagina = parseInt(ctx.match[2])

    const { data: post } = await supabase
      .from('posts_pt')
      .select('id, title, body, novel_id, chapter')
      .eq('id', postId)
      .single()

    if (!post?.body) {
      await ctx.answerCallbackQuery('Conteúdo não disponível.')
      return
    }

    const paginas = paginarTexto(post.body)
    const total = paginas.length
    const texto = paginas[pagina]

    if (!texto) {
      await ctx.answerCallbackQuery('Página inválida.')
      return
    }

    const header = pagina === 0
      ? `*${post.title}*\n${'─'.repeat(30)}\n\n`
      : ''

    const footer = `\n\n─ Parte ${pagina + 1} de ${total} ─`

    const kb = new InlineKeyboard()
    if (pagina > 0) kb.text('⬅️', `ler:${postId}:${pagina - 1}`)
    if (pagina < total - 1) kb.text('➡️', `ler:${postId}:${pagina + 1}`)
    kb.row().text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()

    const mensagem = header + texto + footer

    try {
      await ctx.editMessageText(mensagem, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
    } catch {
      // Se falhar com Markdown (caracteres especiais no texto), envia sem formatação
      await ctx.editMessageText(mensagem.replace(/\*/g, ''), { reply_markup: kb })
    }
  })
}
