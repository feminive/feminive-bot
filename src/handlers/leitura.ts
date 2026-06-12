import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { paginarTexto } from '../lib/paginator.js'
import { usuarioEhAssinante } from './assinante.js'

type Leitura =
  | { ok: true; texto: string; kb: InlineKeyboard; aviso?: string }
  | { ok: false; motivo: string }

export async function montarLeitura(postId: string, pagina: number, userId: number): Promise<Leitura> {
  const { data: post } = await supabase
    .from('posts_pt')
    .select('id, title, body, novel_id, chapter, telegram_premium')
    .eq('id', postId)
    .single()

  if (!post?.body) {
    return { ok: false, motivo: 'Conteúdo não disponível.' }
  }

  if (post.telegram_premium) {
    const ehAssinante = await usuarioEhAssinante(userId)
    if (!ehAssinante) {
      return {
        ok: true,
        aviso: 'Conteúdo exclusivo 🔒',
        texto:
          '🔒 *Conteúdo exclusivo para assinantes*\n\n' +
          'Este capítulo faz parte do nosso acervo premium.\n\n' +
          'Assine por apenas *R$ 14,90/mês* para ler tudo sem limites. 💕',
        kb: new InlineKeyboard()
          .text('✅ Já sou assinante', 'ja_sou_assinante').row()
          .text('💳 Ver planos', 'ver_planos').row()
          .text('🏠 Início', 'inicio'),
      }
    }
  }

  const paginas = paginarTexto(post.body)
  const total = paginas.length
  const texto = paginas[pagina]

  if (!texto) {
    return { ok: false, motivo: 'Página inválida.' }
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

  return { ok: true, texto: header + texto + footer, kb }
}

export function registrarLeitura(bot: Bot) {
  bot.callbackQuery(/^ler:(.+):(\d+)$/, async (ctx) => {
    const postId = ctx.match[1]
    const pagina = parseInt(ctx.match[2])

    const leitura = await montarLeitura(postId, pagina, ctx.from!.id)

    if (!leitura.ok) {
      await ctx.answerCallbackQuery(leitura.motivo)
      return
    }

    await ctx.answerCallbackQuery(leitura.aviso)

    try {
      await ctx.editMessageText(leitura.texto, {
        parse_mode: 'Markdown',
        reply_markup: leitura.kb,
      })
    } catch {
      // Se falhar com Markdown (caracteres especiais no texto), envia sem formatação
      await ctx.editMessageText(leitura.texto.replace(/\*/g, ''), { reply_markup: leitura.kb })
    }
  })
}
