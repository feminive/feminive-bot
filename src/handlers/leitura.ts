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

    const ultimaPagina = pagina === total - 1

    // Se é a última página e pertence a uma coleção, busca o próximo conto
    let proximoPost: { id: string; title: string } | null = null
    if (ultimaPagina && post.novel_id) {
      const { data: proximo } = await supabase
        .from('posts_pt')
        .select('id, title')
        .eq('novel_id', post.novel_id)
        .eq('draft', false)
        .gt('chapter', post.chapter ?? 0)
        .order('chapter')
        .limit(1)
        .single()

      proximoPost = proximo ?? null
    }

    const kb = new InlineKeyboard()
    if (pagina > 0) kb.text('⬅️', `ler:${postId}:${pagina - 1}`)
    if (!ultimaPagina) kb.text('➡️', `ler:${postId}:${pagina + 1}`)
    if (proximoPost) {
      kb.row().text(`Continuar: ${proximoPost.title} ➡️`, `ler:${proximoPost.id}:0`)
    }
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
