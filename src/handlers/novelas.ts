import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'

const POR_PAGINA = 30
const EPISODIOS_POR_TEMPORADA = 20

async function mostrarListaNovelas(ctx: any, pagina: number) {
  const from = pagina * POR_PAGINA

  const { data: novelas } = await supabase
    .from('novels_pt')
    .select('id, title')
    .eq('draft', false)
    .eq('hide', false)
    .is('category_slug', null)    // exclui contos curtos
    .not('seasons', 'is', null)   // só novelas com temporadas
    .order('title')
    .range(from, from + POR_PAGINA - 1)

  if (!novelas?.length) {
    await ctx.editMessageText('Nenhuma novela encontrada.')
    return
  }

  const kb = new InlineKeyboard()
  for (const n of novelas) {
    kb.text(n.title, `novela:${n.id}`).row()
  }

  if (pagina > 0) kb.text('⬅️ Anterior', `novelas:${pagina - 1}`)
  if (novelas.length === POR_PAGINA) kb.text('Próximas ➡️', `novelas:${pagina + 1}`)
  kb.row().text('🏠 Início', 'inicio')

  await ctx.editMessageText('📚 *Novelas em séries* — escolha uma:', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  })
}

export function registrarNovelas(bot: Bot) {
  // Entrada sem paginação → página 0
  bot.callbackQuery('novelas', async (ctx) => {
    await ctx.answerCallbackQuery()
    await mostrarListaNovelas(ctx, 0)
  })

  // Lista paginada
  bot.callbackQuery(/^novelas:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    await mostrarListaNovelas(ctx, parseInt(ctx.match[1]))
  })

  // Detalhe da novela → lista de temporadas
  bot.callbackQuery(/^novela:(.+)$/, async (ctx) => {
    const novelaId = ctx.match[1]

    const [{ data: novela }, { data: caps }] = await Promise.all([
      supabase.from('novels_pt').select('id, title').eq('id', novelaId).single(),
      supabase.from('posts_pt').select('chapter').eq('novel_id', novelaId).eq('draft', false),
    ])

    if (!novela) {
      await ctx.answerCallbackQuery('Novela não encontrada.')
      return
    }

    const totalCaps = caps?.length ?? 0
    const totalTemporadas = Math.ceil(totalCaps / EPISODIOS_POR_TEMPORADA)

    const kb = new InlineKeyboard()
    for (let t = 1; t <= totalTemporadas; t++) {
      kb.text(`Temporada ${t}`, `temporada:${novelaId}:${t}`).row()
    }
    kb.text('⬅️ Novelas', 'novelas').row().text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      `📚 *${novela.title}*\n\n_${totalTemporadas} temporada${totalTemporadas !== 1 ? 's' : ''} · ${totalCaps} capítulos_\n\nEscolha a temporada:`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })

  // Capítulos de uma temporada
  bot.callbackQuery(/^temporada:(.+):(\d+)$/, async (ctx) => {
    const novelaId = ctx.match[1]
    const temporada = parseInt(ctx.match[2])
    const from = (temporada - 1) * EPISODIOS_POR_TEMPORADA
    const to = from + EPISODIOS_POR_TEMPORADA - 1

    const [{ data: caps }, { data: novela }] = await Promise.all([
      supabase
        .from('posts_pt')
        .select('id, title, chapter, telegram_premium')
        .eq('novel_id', novelaId)
        .eq('draft', false)
        .order('chapter')
        .range(from, to),
      supabase.from('novels_pt').select('title').eq('id', novelaId).single(),
    ])

    if (!caps?.length) {
      await ctx.answerCallbackQuery('Nenhum capítulo encontrado.')
      return
    }

    const kb = new InlineKeyboard()
    for (const cap of caps) {
      const label = cap.telegram_premium ? `🔒 Cap. ${cap.chapter} — ${cap.title}` : `Cap. ${cap.chapter} — ${cap.title}`
      kb.text(label, `ler:${cap.id}:0`).row()
    }
    kb.text('⬅️ Temporadas', `novela:${novelaId}`).row().text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      `📚 *${novela?.title}* — Temporada ${temporada}`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })
}
