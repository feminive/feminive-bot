import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { BOT_USERNAME } from './start.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''
const INTERVALO_MS = 24 * 60 * 60 * 1000 // 1 vez por dia
const HISTORICO_MAX = 10 // não repete os últimos N contos sorteados

const ultimosPostados: string[] = []

// Alguns registros têm o placeholder literal "description" no banco — trata como vazio
function limparTeaser(description?: string | null): string | undefined {
  let teaser = description?.trim()
  if (!teaser || teaser.toLowerCase() === 'description') return undefined
  // Legenda de foto no Telegram tem limite de 1024 chars
  if (teaser.length > 500) teaser = teaser.slice(0, 500).trimEnd() + '…'
  return teaser
}

function registrarNoHistorico(chave: string) {
  ultimosPostados.push(chave)
  if (ultimosPostados.length > HISTORICO_MAX) ultimosPostados.shift()
}

export async function postarSugestao(bot: Bot, postId?: string) {
  if (postId) {
    const { data: post } = await supabase
      .from('posts_pt')
      .select('id, title, description, novel_id, short_category_id')
      .eq('id', postId)
      .eq('draft', false)
      .single()

    if (!post) throw new Error('Conto não encontrado')
    registrarNoHistorico(`post:${post.id}`)
    await publicarPost(bot, post)
    return
  }

  // Sorteio em dois níveis: primeiro o tipo, depois o item. Sem isso os
  // capítulos de novela (maioria esmagadora de posts_pt) dominam o sorteio
  // e avulsos/coletâneas quase nunca saem.
  const tipos: Array<'coletanea' | 'avulso' | 'capitulo'> = ['coletanea', 'avulso', 'capitulo']
  tipos.sort(() => Math.random() - 0.5)

  for (const tipo of tipos) {
    let candidatos: any[]

    if (tipo === 'coletanea') {
      const { data } = await supabase
        .from('novels_pt')
        .select('id, title, description, image_url, short_category_id')
        .eq('draft', false)
        .eq('hide', false)
        .not('short_category_id', 'is', null)
        .limit(1000)
      candidatos = (data ?? []).map((n) => ({ ...n, chave: `colecao:${n.id}` }))
    } else {
      let query = supabase
        .from('posts_pt')
        .select('id, title, description, novel_id, short_category_id')
        .eq('draft', false)
        .limit(1000)
      query = tipo === 'avulso' ? query.is('novel_id', null) : query.not('novel_id', 'is', null)
      const { data } = await query
      candidatos = (data ?? []).map((p) => ({ ...p, chave: `post:${p.id}` }))
    }

    if (!candidatos.length) continue // tipo sem conteúdo — tenta o próximo

    const ineditos = candidatos.filter((c) => !ultimosPostados.includes(c.chave))
    const pool = ineditos.length ? ineditos : candidatos
    const sorteado = pool[Math.floor(Math.random() * pool.length)]

    registrarNoHistorico(sorteado.chave)
    if (tipo === 'coletanea') await publicarColetanea(bot, sorteado)
    else await publicarPost(bot, sorteado)
    return
  }
}

async function publicarPost(bot: Bot, post: any) {
  const teaser = limparTeaser(post.description)
  const texto =
    `📖 *Sugestão de leitura*\n\n*${post.title}*` +
    (teaser ? `\n\n_${teaser}_` : '')

  const kb = new InlineKeyboard().url(
    '👀 Você já leu esse conto?',
    `https://t.me/${BOT_USERNAME}?start=ler_${post.id}`
  )

  // A imagem nunca é a do conto em si — vem da novela/coletânea (novels_pt)
  // a que ele pertence ou, se for avulso, do tema (short_categories).
  let imageUrl: string | undefined
  if (post.novel_id) {
    const { data: novela } = await supabase
      .from('novels_pt')
      .select('image_url')
      .eq('id', post.novel_id)
      .single()
    imageUrl = novela?.image_url ?? undefined
  } else if (post.short_category_id) {
    const { data: tema } = await supabase
      .from('short_categories')
      .select('image_url')
      .eq('id', post.short_category_id)
      .single()
    imageUrl = tema?.image_url ?? undefined
  }

  await enviarSugestao(bot, texto, kb, imageUrl)
}

async function publicarColetanea(bot: Bot, colecao: any) {
  const teaser = limparTeaser(colecao.description)
  const texto =
    `📚 *Sugestão de leitura — coletânea*\n\n*${colecao.title}*` +
    (teaser ? `\n\n_${teaser}_` : '')

  const kb = new InlineKeyboard().url(
    '👀 Ver os contos desta coletânea',
    `https://t.me/${BOT_USERNAME}?start=colecao_${colecao.id}`
  )

  let imageUrl: string | undefined = colecao.image_url ?? undefined
  if (!imageUrl && colecao.short_category_id) {
    const { data: tema } = await supabase
      .from('short_categories')
      .select('image_url')
      .eq('id', colecao.short_category_id)
      .single()
    imageUrl = tema?.image_url ?? undefined
  }

  await enviarSugestao(bot, texto, kb, imageUrl)
}

async function enviarSugestao(bot: Bot, texto: string, kb: InlineKeyboard, imageUrl?: string) {
  if (imageUrl) {
    try {
      await bot.api.sendPhoto(CANAL_ID, imageUrl, {
        caption: texto,
        parse_mode: 'Markdown',
        reply_markup: kb,
      })
      return
    } catch {
      // URL de imagem inválida/inacessível ou Markdown quebrado — tenta sem formatação
      try {
        await bot.api.sendPhoto(CANAL_ID, imageUrl, {
          caption: texto.replace(/[*_]/g, ''),
          reply_markup: kb,
        })
        return
      } catch {
        // Segue pro fallback de texto puro abaixo
      }
    }
  }

  try {
    await bot.api.sendMessage(CANAL_ID, texto, { parse_mode: 'Markdown', reply_markup: kb })
  } catch {
    // Markdown inválido no título/descrição — envia sem formatação
    await bot.api.sendMessage(CANAL_ID, texto.replace(/[*_]/g, ''), { reply_markup: kb })
  }
}

export function registrarDivulgacao(bot: Bot) {
  // /sugerir — sem argumento sorteia aleatório, com argumento busca e mostra opções
  bot.command('sugerir', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    if (!CANAL_ID) {
      await ctx.reply('⚙️ Defina CANAL_ID no .env para usar a divulgação.')
      return
    }

    try {
      const termo = ctx.match?.trim()

      if (termo) {
        // Busca contos pelo nome
        const { data: posts } = await supabase
          .from('posts_pt')
          .select('id, title')
          .ilike('title', `%${termo}%`)
          .eq('draft', false)
          .limit(10)

        if (!posts?.length) {
          await ctx.reply(`❌ Nenhum conto encontrado com "${termo}"`)
          return
        }

        // Mostra opções
        const kb = new InlineKeyboard()
        for (const post of posts) {
          kb.text(post.title, `sugerir_${post.id}`).row()
        }

        await ctx.reply(`📖 Encontrei ${posts.length} resultado(s). Qual você quer?`, {
          reply_markup: kb,
        })
      } else {
        // Sem argumento, sorteia aleatório
        await postarSugestao(bot)
        await ctx.reply('✅ Sugestão publicada no canal!')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.reply(`❌ Erro: ${msg}`)
    }
  })

  // Callback quando clica numa opção
  bot.callbackQuery(/^sugerir_(.+)$/, async (ctx) => {
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    try {
      const postId = ctx.match[1]
      await postarSugestao(bot, postId)
      await ctx.answerCallbackQuery('✅ Publicado no canal!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.answerCallbackQuery(`❌ Erro: ${msg}`)
    }
  })

  // Agendador: uma sugestão por dia
  if (!CANAL_ID) {
    console.warn('CANAL_ID não definido — divulgação automática desativada.')
    return
  }

  setInterval(() => {
    postarSugestao(bot).catch((err) => console.error('Erro na divulgação automática:', err))
  }, INTERVALO_MS)
}
