import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { BOT_USERNAME } from './start.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''
const INTERVALO_MS = 24 * 60 * 60 * 1000 // 1 vez por dia
const HISTORICO_MAX = 10 // não repete os últimos N contos sorteados

const ultimosPostados: string[] = []

export async function postarSugestao(bot: Bot, postId?: string) {
  let sorteado: any

  if (postId) {
    const { data: post } = await supabase
      .from('posts_pt')
      .select('id, title, description, novel_id, short_category_id')
      .eq('id', postId)
      .eq('draft', false)
      .single()

    if (!post) throw new Error('Conto não encontrado')
    sorteado = post
  } else {
    const { data: posts } = await supabase
      .from('posts_pt')
      .select('id, title, description, novel_id, short_category_id')
      .eq('draft', false)
      .limit(1000)

    if (!posts?.length) return

    const candidatos = posts.filter((p) => !ultimosPostados.includes(p.id))
    const pool = candidatos.length ? candidatos : posts
    sorteado = pool[Math.floor(Math.random() * pool.length)]
  }

  ultimosPostados.push(sorteado.id)
  if (ultimosPostados.length > HISTORICO_MAX) ultimosPostados.shift()

  // Alguns posts têm o placeholder literal "description" no banco — trata como vazio
  let teaser = sorteado.description?.trim()
  if (teaser?.toLowerCase() === 'description') teaser = undefined
  const texto =
    `📖 *Sugestão de leitura*\n\n*${sorteado.title}*` +
    (teaser ? `\n\n_${teaser}_` : '')

  const kb = new InlineKeyboard().url(
    '👀 Você já leu esse conto?',
    `https://t.me/${BOT_USERNAME}?start=ler_${sorteado.id}`
  )

  // A imagem nunca é a do conto em si — vem da novela/coletânea (novels_pt)
  // a que ele pertence ou, se for avulso, do tema (short_categories).
  let imageUrl: string | undefined
  if (sorteado.novel_id) {
    const { data: novela } = await supabase
      .from('novels_pt')
      .select('image_url')
      .eq('id', sorteado.novel_id)
      .single()
    imageUrl = novela?.image_url ?? undefined
  } else if (sorteado.short_category_id) {
    const { data: tema } = await supabase
      .from('short_categories')
      .select('image_url')
      .eq('id', sorteado.short_category_id)
      .single()
    imageUrl = tema?.image_url ?? undefined
  }

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

  // Agendador: uma sugestão a cada 4 horas
  if (!CANAL_ID) {
    console.warn('CANAL_ID não definido — divulgação automática desativada.')
    return
  }

  setInterval(() => {
    postarSugestao(bot).catch((err) => console.error('Erro na divulgação automática:', err))
  }, INTERVALO_MS)
}
