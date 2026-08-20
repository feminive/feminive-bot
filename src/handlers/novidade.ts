import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { BOT_USERNAME } from './start.js'
import { imagemDoPost, publicarNoCanal } from './divulgacao.js'
import { comOptOut } from './avisos.js'
import {
  PAUSA_MS,
  broadcastRodando,
  contarOptOut,
  dispararParaTodos,
  listarAtivos,
} from '../lib/broadcast.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''
const QUANTIDADE = 5
// Escolha antiga não vale mais — evita disparar por engano o episódio de ontem.
const VALIDADE_MS = 10 * 60 * 1000

type PostNovidade = {
  id: string
  title: string
  description: string | null
  chapter: number | null
  novel_id: string | null
  short_category_id: string | null
}

// O episódio escolhido, esperando você decidir o destino. Só o admin usa: um basta.
type Escolhido = {
  postId: string
  texto: string
  imagem?: string
  // Título/teaser com Markdown quebrado derruba o envio inteiro — se o preview só
  // passou sem formatação, o disparo vai sem formatação também.
  semMarkdown: boolean
  criadoEm: number
}

let escolhido: Escolhido | null = null

// Mesmo tratamento do /sugerir: o banco tem o placeholder literal "description"
function limparTeaser(description?: string | null): string | undefined {
  let teaser = description?.trim()
  if (!teaser || teaser.toLowerCase() === 'description') return undefined
  if (teaser.length > 400) teaser = teaser.slice(0, 400).trimEnd() + '…'
  return teaser
}

async function buscarPost(postId: string): Promise<PostNovidade | null> {
  const { data } = await supabase
    .from('posts_pt')
    .select('id, title, description, chapter, novel_id, short_category_id')
    .eq('id', postId)
    .eq('draft', false)
    .single()
  return (data as PostNovidade) ?? null
}

async function ultimosEpisodios(): Promise<PostNovidade[]> {
  const { data } = await supabase
    .from('posts_pt')
    .select('id, title, description, chapter, novel_id, short_category_id')
    .eq('draft', false)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(QUANTIDADE)

  return (data ?? []) as PostNovidade[]
}

async function tituloDaNovela(novelId: string): Promise<string | undefined> {
  const { data } = await supabase.from('novels_pt').select('title').eq('id', novelId).single()
  return data?.title ?? undefined
}

// Botão do Telegram corta texto muito longo — encurta antes de mandar
function encurtar(texto: string, max = 60): string {
  return texto.length > max ? texto.slice(0, max - 1).trimEnd() + '…' : texto
}

function botaoLer(postId: string, texto: string): InlineKeyboard {
  return new InlineKeyboard().url(texto, `https://t.me/${BOT_USERNAME}?start=ler_${postId}`)
}

// Texto do canal: falando com a sala inteira.
async function textoDoCanal(post: PostNovidade): Promise<string> {
  const novela = post.novel_id ? await tituloDaNovela(post.novel_id) : undefined
  const teaser = limparTeaser(post.description)
  const chamada = novela
    ? `📢 *Pessoal, tem conto novo da novela ${novela}!*`
    : '📢 *Pessoal, tem conto novo!*'

  return (
    `${chamada}\n\n*${post.title}*` +
    (teaser ? `\n\n_${teaser}_` : '') +
    '\n\nClique abaixo para ler 👇'
  )
}

// Texto do privado: falando com uma pessoa só.
async function textoDoPrivado(post: PostNovidade): Promise<string> {
  const novela = post.novel_id ? await tituloDaNovela(post.novel_id) : undefined
  const teaser = limparTeaser(post.description)
  const chamada = novela
    ? `Oi! 💕 Tem conto novo da novela *${novela}*`
    : 'Oi! 💕 Tem conto novo pra você'

  return `${chamada}\n\n*${post.title}*` + (teaser ? `\n\n_${teaser}_` : '')
}

export async function publicarNovidade(bot: Bot, postId: string) {
  const post = await buscarPost(postId)
  if (!post) throw new Error('Conto não encontrado')

  await publicarNoCanal(
    bot,
    await textoDoCanal(post),
    botaoLer(post.id, '📖 Clique para ler'),
    await imagemDoPost(post)
  )
}

export function registrarNovidade(bot: Bot) {
  // /novidade — lista os últimos episódios publicados. Escolhe um e decide o
  // destino: canal (rotina, custo zero) ou privado das leitoras (caro, use pouco).
  bot.command('novidade', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    if (!CANAL_ID) {
      await ctx.reply('⚙️ Defina CANAL_ID no .env para anunciar no canal.')
      return
    }

    try {
      const posts = await ultimosEpisodios()

      if (!posts.length) {
        await ctx.reply('❌ Nenhum conto publicado encontrado.')
        return
      }

      const kb = new InlineKeyboard()
      for (const post of posts) {
        const novela = post.novel_id ? await tituloDaNovela(post.novel_id) : undefined
        const prefixo = novela ? `${novela}${post.chapter ? ` cap. ${post.chapter}` : ''} — ` : ''
        kb.text(encurtar(`${prefixo}${post.title}`), `nov_sel_${post.id}`).row()
      }

      await ctx.reply(
        `🆕 *Últimos ${posts.length} episódios publicados*\n\nQual você quer anunciar?`,
        { parse_mode: 'Markdown', reply_markup: kb }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.reply(`❌ Erro: ${msg}`)
    }
  })

  // Escolheu o episódio: mostra o preview exato do privado e pergunta o destino.
  bot.callbackQuery(/^nov_sel_(.+)$/, async (ctx) => {
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    try {
      const post = await buscarPost(ctx.match[1])
      if (!post) {
        await ctx.answerCallbackQuery('❌ Conto não encontrado')
        return
      }

      await ctx.answerCallbackQuery()

      const texto = await textoDoPrivado(post)
      const imagem = await imagemDoPost(post)
      // Os dois botões que a leitora vê: ler agora e sair dos avisos.
      const teclado = comOptOut(botaoLer(post.id, '📖 Ler agora'))
      const chatId = ctx.chat!.id

      // Preview de verdade: manda pra você exatamente o que ela vai receber.
      // Se o Markdown quebrar aqui, quebraria em todos os envios — melhor
      // descobrir agora e mandar o disparo inteiro sem formatação.
      let semMarkdown = false
      try {
        if (imagem) {
          await ctx.api.sendPhoto(chatId, imagem, {
            caption: texto,
            parse_mode: 'Markdown',
            reply_markup: teclado,
          })
        } else {
          await ctx.api.sendMessage(chatId, texto, {
            parse_mode: 'Markdown',
            reply_markup: teclado,
          })
        }
      } catch {
        semMarkdown = true
        const puro = texto.replace(/[*_]/g, '')
        if (imagem) {
          await ctx.api.sendPhoto(chatId, imagem, { caption: puro, reply_markup: teclado })
        } else {
          await ctx.api.sendMessage(chatId, puro, { reply_markup: teclado })
        }
      }

      escolhido = { postId: post.id, texto, imagem, semMarkdown, criadoEm: Date.now() }

      const destinatarios = await listarAtivos()
      const foraDaLista = await contarOptOut()

      const kb = new InlineKeyboard()
        .text('📢 Publicar no canal', 'nov_canal')
        .row()
        .text(`💌 Mandar no privado (${destinatarios.length})`, 'nov_privado')
        .row()
        .text('❌ Cancelar', 'nov_cancelar')

      await ctx.reply(
        [
          '☝️ É assim que chega no privado da leitora.',
          '',
          `👥 Receberiam: *${destinatarios.length}*`,
          `🔕 Fora da lista por opção: *${foraDaLista}*`,
          `⏱ Tempo estimado: ~${Math.ceil((destinatarios.length * PAUSA_MS) / 1000)}s`,
          '',
          '_No canal vai a versão de sala cheia, sem o botão de sair._',
          '',
          'Onde você quer anunciar?',
        ].join('\n'),
        { parse_mode: 'Markdown', reply_markup: kb }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.answerCallbackQuery(`❌ Erro: ${msg}`)
    }
  })

  bot.callbackQuery('nov_cancelar', async (ctx) => {
    if (ctx.from?.id !== ADMIN_USER_ID) return
    escolhido = null
    await ctx.answerCallbackQuery('Cancelado')
    await ctx.editMessageText('❌ Anúncio cancelado.')
  })

  bot.callbackQuery('nov_canal', async (ctx) => {
    if (ctx.from?.id !== ADMIN_USER_ID) return

    if (!escolhido) {
      await ctx.answerCallbackQuery('Nada pendente')
      await ctx.editMessageText('❌ Não achei o episódio escolhido. Refaça o /novidade.')
      return
    }

    try {
      await publicarNovidade(bot, escolhido.postId)
      await ctx.answerCallbackQuery('✅ Publicado no canal!')
      await ctx.editMessageText('✅ Novidade publicada no canal.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.answerCallbackQuery(`❌ Erro: ${msg}`)
    }
  })

  bot.callbackQuery('nov_privado', async (ctx) => {
    if (ctx.from?.id !== ADMIN_USER_ID) return

    if (!escolhido) {
      await ctx.answerCallbackQuery('Nada pendente')
      await ctx.editMessageText('❌ Não achei o episódio escolhido. Refaça o /novidade.')
      return
    }
    if (Date.now() - escolhido.criadoEm > VALIDADE_MS) {
      escolhido = null
      await ctx.answerCallbackQuery('Expirou')
      await ctx.editMessageText('⌛ Essa escolha expirou. Refaça o /novidade.')
      return
    }
    if (broadcastRodando()) {
      await ctx.answerCallbackQuery('Já tem um disparo rodando')
      return
    }

    const alvo = escolhido
    escolhido = null
    const chatId = ctx.chat!.id

    await ctx.answerCallbackQuery('Disparando...')

    try {
      const teclado = comOptOut(botaoLer(alvo.postId, '📖 Ler agora'))
      const texto = alvo.semMarkdown ? alvo.texto.replace(/[*_]/g, '') : alvo.texto
      const parse_mode = alvo.semMarkdown ? undefined : ('Markdown' as const)
      const imagem = alvo.imagem

      const destinatarios = await listarAtivos()
      await ctx.editMessageText(`📤 Enviando... 0/${destinatarios.length}`)

      const r = await dispararParaTodos(
        destinatarios,
        (destino) =>
          imagem
            ? ctx.api.sendPhoto(destino, imagem, {
                caption: texto,
                parse_mode,
                reply_markup: teclado,
              })
            : ctx.api.sendMessage(destino, texto, { parse_mode, reply_markup: teclado }),
        async (feitos, total) => {
          try {
            await ctx.editMessageText(`📤 Enviando... ${feitos}/${total}`)
          } catch {
            // Editar é só cosmético; se falhar, o envio continua.
          }
        }
      )

      try {
        await ctx.editMessageText(`📤 Envio finalizado — ${destinatarios.length} tentativas.`)
      } catch {
        // Cosmético.
      }

      await ctx.api.sendMessage(
        chatId,
        [
          '✅ *Aviso de conto novo enviado*',
          '',
          `📨 Enviadas: *${r.enviadas}*`,
          `🚫 Bloquearam o bot: *${r.bloquearam}*`,
          `⚠️ Erros: *${r.erros}*`,
          '',
          '_Quem clicou em "não desejo receber mais" saiu só dos avisos — continua lendo normalmente._',
        ].join('\n'),
        { parse_mode: 'Markdown' }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.api.sendMessage(chatId, `❌ Erro no disparo: ${msg}`)
    }
  })
}
