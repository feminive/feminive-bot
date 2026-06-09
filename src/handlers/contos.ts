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

  // Lista de temas
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
      kb.text(cat.title, `tema:${cat.id}`).row()
    }
    kb.text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText('📝 *Escolha um tema:*', {
      parse_mode: 'Markdown',
      reply_markup: kb,
    })
  })

  // Menu do tema: mostra coleções e/ou avulsos conforme o que existir
  bot.callbackQuery(/^tema:([^:]+)$/, async (ctx) => {
    const catId = ctx.match[1]

    const [{ data: cat }, { data: colecoes }, { data: avulsos }] = await Promise.all([
      supabase.from('short_categories').select('title').eq('id', catId).single(),
      supabase.from('novels_pt').select('id, title').eq('short_category_id', catId).eq('draft', false).eq('hide', false),
      supabase.from('posts_pt').select('id').eq('short_category_id', catId).is('novel_id', null).eq('draft', false).limit(1),
    ])

    const temColecoes = (colecoes?.length ?? 0) > 0
    const temAvulsos = (avulsos?.length ?? 0) > 0

    if (!temColecoes && !temAvulsos) {
      await ctx.answerCallbackQuery('Nenhum conteúdo neste tema ainda.')
      return
    }

    // Se só tem um tipo, vai direto sem submenu
    if (temColecoes && !temAvulsos) {
      const kb = new InlineKeyboard()
      for (const c of colecoes!) {
        kb.text(c.title, `colecao:${c.id}:0`).row()
      }
      kb.text('⬅️ Temas', 'temas').text('🏠 Início', 'inicio')
      await ctx.answerCallbackQuery()
      await ctx.editMessageText(`📚 *${cat?.title}* — Coleções`, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
      return
    }

    if (!temColecoes && temAvulsos) {
      // Vai direto para a lista de avulsos
      await ctx.answerCallbackQuery()
      await ctx.editMessageText(`📄 *${cat?.title}*`, { parse_mode: 'Markdown' })
      // Redireciona para o handler de avulsos paginados
      await ctx.callbackQuery // já handled below via tema_avulsos
      const from = 0
      const { data: contos } = await supabase
        .from('posts_pt')
        .select('id, title')
        .eq('short_category_id', catId)
        .is('novel_id', null)
        .eq('draft', false)
        .order('published_at', { ascending: false })
        .range(from, from + POR_PAGINA - 1)

      const kb = new InlineKeyboard()
      for (const c of contos ?? []) {
        kb.text(c.title, `ler:${c.id}:0`).row()
      }
      if ((contos?.length ?? 0) === POR_PAGINA) kb.text('Próximos ➡️', `tema_av:${catId}:1`)
      kb.row().text('⬅️ Temas', 'temas').text('🏠 Início', 'inicio')
      await ctx.editMessageText(`📄 *${cat?.title}*`, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
      return
    }

    // Tem os dois: mostra submenu
    const kb = new InlineKeyboard()
    kb.text('📚 Coleções', `tema_col:${catId}`).row()
    kb.text('📄 Avulsos', `tema_av:${catId}:0`).row()
    kb.text('⬅️ Temas', 'temas').text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(`*${cat?.title}*\n\nEscolha o tipo de conteúdo:`, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    })
  })

  // Coleções de um tema
  bot.callbackQuery(/^tema_col:(.+)$/, async (ctx) => {
    const catId = ctx.match[1]

    const [{ data: cat }, { data: colecoes }] = await Promise.all([
      supabase.from('short_categories').select('title').eq('id', catId).single(),
      supabase.from('novels_pt').select('id, title').eq('short_category_id', catId).eq('draft', false).eq('hide', false).order('title'),
    ])

    const kb = new InlineKeyboard()
    for (const c of colecoes ?? []) {
      kb.text(c.title, `colecao:${c.id}:0`).row()
    }
    kb.text('⬅️ Voltar', `tema:${catId}`).text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(`📚 *${cat?.title}* — Coleções`, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    })
  })

  // Avulsos de um tema (paginado)
  bot.callbackQuery(/^tema_av:(.+):(\d+)$/, async (ctx) => {
    const catId = ctx.match[1]
    const pagina = parseInt(ctx.match[2])
    const from = pagina * POR_PAGINA

    const [{ data: cat }, { data: contos }] = await Promise.all([
      supabase.from('short_categories').select('title').eq('id', catId).single(),
      supabase.from('posts_pt')
        .select('id, title')
        .eq('short_category_id', catId)
        .is('novel_id', null)
        .eq('draft', false)
        .order('published_at', { ascending: false })
        .range(from, from + POR_PAGINA - 1),
    ])

    if (!contos?.length) {
      await ctx.answerCallbackQuery('Sem mais contos.')
      return
    }

    const kb = new InlineKeyboard()
    for (const c of contos) {
      kb.text(c.title, `ler:${c.id}:0`).row()
    }

    const nav = new InlineKeyboard()
    if (pagina > 0) nav.text('⬅️ Anterior', `tema_av:${catId}:${pagina - 1}`)
    if (contos.length === POR_PAGINA) nav.text('Próximos ➡️', `tema_av:${catId}:${pagina + 1}`)
    nav.row().text('⬅️ Temas', 'temas').text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(`📄 *${cat?.title}*`, {
      parse_mode: 'Markdown',
      reply_markup: InlineKeyboard.from([...kb.inline_keyboard, ...nav.inline_keyboard]),
    })
  })

  // Contos avulsos de um tema (handler legado — mantido por compatibilidade)
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
