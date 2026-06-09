import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'

const POR_PAGINA = 10

export function registrarContos(bot: Bot) {
  // Menu: Coleções ou Avulsos
  bot.callbackQuery('contos_menu', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('📚 Coleções', 'colecoes:0')
      .row()
      .text('📄 Avulsos por tema', 'temas')
      .row()
      .text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText('📝 *Contos* — como prefere explorar?', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    })
  })

  // Lista de coleções (novels sem seasons / com category_slug)
  bot.callbackQuery(/^colecoes:(\d+)$/, async (ctx) => {
    const pagina = parseInt(ctx.match[1])
    const from = pagina * POR_PAGINA

    const { data: colecoes } = await supabase
      .from('novels_pt')
      .select('id, title, category_slug')
      .eq('draft', false)
      .eq('hide', false)
      .not('category_slug', 'is', null)
      .is('seasons', null)
      .order('title')
      .range(from, from + POR_PAGINA - 1)

    if (!colecoes?.length) {
      await ctx.answerCallbackQuery()
      await ctx.editMessageText('Nenhuma coleção encontrada.')
      return
    }

    const kb = new InlineKeyboard()
    for (const c of colecoes) {
      kb.text(c.title, `colecao:${c.id}:0`).row()
    }

    const nav = new InlineKeyboard()
    if (pagina > 0) nav.text('⬅️ Anterior', `colecoes:${pagina - 1}`)
    if (colecoes.length === POR_PAGINA) nav.text('Próximas ➡️', `colecoes:${pagina + 1}`)
    nav.row().text('⬅️ Contos', 'contos_menu').text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText('📚 *Coleções* — escolha uma:', {
      parse_mode: 'Markdown',
      reply_markup: InlineKeyboard.from([...kb.inline_keyboard, ...nav.inline_keyboard]),
    })
  })

  // Contos de uma coleção
  bot.callbackQuery(/^colecao:(.+):(\d+)$/, async (ctx) => {
    const novelaId = ctx.match[1]
    const pagina = parseInt(ctx.match[2])
    const from = pagina * POR_PAGINA

    const { data: novela } = await supabase
      .from('novels_pt')
      .select('title')
      .eq('id', novelaId)
      .single()

    const { data: contos } = await supabase
      .from('posts_pt')
      .select('id, title')
      .eq('novel_id', novelaId)
      .eq('draft', false)
      .order('published_at')
      .range(from, from + POR_PAGINA - 1)

    if (!contos?.length) {
      await ctx.answerCallbackQuery('Nenhum conto encontrado.')
      return
    }

    const kb = new InlineKeyboard()
    for (const c of contos) {
      kb.text(c.title, `ler:${c.id}:0`).row()
    }

    const nav = new InlineKeyboard()
    if (pagina > 0) nav.text('⬅️ Anterior', `colecao:${novelaId}:${pagina - 1}`)
    if (contos.length === POR_PAGINA) nav.text('Próximos ➡️', `colecao:${novelaId}:${pagina + 1}`)
    nav.row().text('⬅️ Coleções', 'colecoes:0').text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(`📚 *${novela?.title}*`, {
      parse_mode: 'Markdown',
      reply_markup: InlineKeyboard.from([...kb.inline_keyboard, ...nav.inline_keyboard]),
    })
  })

  // Lista de temas (avulsos)
  bot.callbackQuery('temas', async (ctx) => {
    const { data: categorias } = await supabase
      .from('short_categories')
      .select('id, title, slug')
      .eq('locale', 'pt')
      .order('sort_order')

    if (!categorias?.length) {
      await ctx.answerCallbackQuery()
      await ctx.editMessageText('Nenhum tema encontrado.')
      return
    }

    const kb = new InlineKeyboard()
    for (const cat of categorias) {
      kb.text(cat.title, `tema:${cat.id}:0`).row()
    }
    kb.text('⬅️ Contos', 'contos_menu').text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText('📄 *Avulsos por tema* — escolha:', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    })
  })

  // Contos avulsos de um tema
  bot.callbackQuery(/^tema:(.+):(\d+)$/, async (ctx) => {
    const catId = ctx.match[1]
    const pagina = parseInt(ctx.match[2])
    const from = pagina * POR_PAGINA

    const { data: cat } = await supabase
      .from('short_categories')
      .select('title')
      .eq('id', catId)
      .single()

    const { data: contos } = await supabase
      .from('posts_pt')
      .select('id, title')
      .eq('short_category_id', catId)
      .is('novel_id', null)
      .eq('draft', false)
      .order('published_at', { ascending: false })
      .range(from, from + POR_PAGINA - 1)

    if (!contos?.length) {
      await ctx.answerCallbackQuery('Nenhum conto encontrado neste tema.')
      return
    }

    const kb = new InlineKeyboard()
    for (const c of contos) {
      kb.text(c.title, `ler:${c.id}:0`).row()
    }

    const nav = new InlineKeyboard()
    if (pagina > 0) nav.text('⬅️ Anterior', `tema:${catId}:${pagina - 1}`)
    if (contos.length === POR_PAGINA) nav.text('Próximos ➡️', `tema:${catId}:${pagina + 1}`)
    nav.row().text('⬅️ Temas', 'temas').text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(`📄 *${cat?.title}*`, {
      parse_mode: 'Markdown',
      reply_markup: InlineKeyboard.from([...kb.inline_keyboard, ...nav.inline_keyboard]),
    })
  })
}
