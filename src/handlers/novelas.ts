import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'

const POR_PAGINA = 10

export function registrarNovelas(bot: Bot) {
  // Lista de novelas paginada
  bot.callbackQuery(/^novelas:(\d+)$/, async (ctx) => {
    const pagina = parseInt(ctx.match[1])
    const from = pagina * POR_PAGINA

    const { data: novelas } = await supabase
      .from('novels_pt')
      .select('id, title, slug')
      .eq('draft', false)
      .eq('hide', false)
      .order('title')
      .range(from, from + POR_PAGINA - 1)

    if (!novelas?.length) {
      await ctx.answerCallbackQuery()
      await ctx.editMessageText('Nenhuma novela encontrada.')
      return
    }

    const kb = new InlineKeyboard()
    for (const n of novelas) {
      kb.text(n.title, `novela:${n.id}`).row()
    }

    const nav = new InlineKeyboard()
    if (pagina > 0) nav.text('⬅️ Anterior', `novelas:${pagina - 1}`)
    if (novelas.length === POR_PAGINA) nav.text('Próximas ➡️', `novelas:${pagina + 1}`)
    nav.row().text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText('📖 *Novelas* — escolha uma:', {
      parse_mode: 'Markdown',
      reply_markup: InlineKeyboard.from([...kb.inline_keyboard, ...nav.inline_keyboard]),
    })
  })

  // Detalhe da novela (seasons)
  bot.callbackQuery(/^novela:(.+)$/, async (ctx) => {
    const novelaId = ctx.match[1]

    const { data: novela } = await supabase
      .from('novels_pt')
      .select('id, title, seasons')
      .eq('id', novelaId)
      .single()

    if (!novela) {
      await ctx.answerCallbackQuery('Novela não encontrada.')
      return
    }

    // Conta capítulos para descobrir quantas temporadas há
    const { data: caps } = await supabase
      .from('posts_pt')
      .select('id, chapter')
      .eq('novel_id', novelaId)
      .eq('draft', false)
      .order('chapter')

    const episodiosPorTemporada = 20
    const totalCaps = caps?.length ?? 0
    const totalTemporadas = Math.ceil(totalCaps / episodiosPorTemporada)

    const kb = new InlineKeyboard()
    for (let t = 1; t <= totalTemporadas; t++) {
      kb.text(`Temporada ${t}`, `temporada:${novelaId}:${t}`).row()
    }
    kb.text('⬅️ Voltar', 'novelas:0').row().text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      `📖 *${novela.title}*\n\nEscolha a temporada:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })

  // Capítulos de uma temporada
  bot.callbackQuery(/^temporada:(.+):(\d+)$/, async (ctx) => {
    const novelaId = ctx.match[1]
    const temporada = parseInt(ctx.match[2])
    const episodiosPorTemporada = 20
    const from = (temporada - 1) * episodiosPorTemporada
    const to = from + episodiosPorTemporada - 1

    const { data: caps } = await supabase
      .from('posts_pt')
      .select('id, title, chapter')
      .eq('novel_id', novelaId)
      .eq('draft', false)
      .order('chapter')
      .range(from, to)

    if (!caps?.length) {
      await ctx.answerCallbackQuery('Nenhum capítulo encontrado.')
      return
    }

    const { data: novela } = await supabase
      .from('novels_pt')
      .select('title')
      .eq('id', novelaId)
      .single()

    const kb = new InlineKeyboard()
    for (const cap of caps) {
      kb.text(`Cap. ${cap.chapter} — ${cap.title}`, `ler:${cap.id}:0`).row()
    }
    kb.text('⬅️ Voltar', `novela:${novelaId}`).row().text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      `📖 *${novela?.title}* — Temporada ${temporada}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })
}
