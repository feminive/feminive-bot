import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { BOT_USERNAME } from './start.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''
const INTERVALO_MS = 4 * 60 * 60 * 1000 // 4 horas
const HISTORICO_MAX = 10 // não repete os últimos N contos sorteados

const ultimosPostados: string[] = []

export async function postarSugestao(bot: Bot) {
  const { data: posts } = await supabase
    .from('posts_pt')
    .select('id, title, description')
    .eq('draft', false)
    .limit(1000)

  if (!posts?.length) return

  const candidatos = posts.filter((p) => !ultimosPostados.includes(p.id))
  const pool = candidatos.length ? candidatos : posts
  const sorteado = pool[Math.floor(Math.random() * pool.length)]

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

  try {
    await bot.api.sendMessage(CANAL_ID, texto, { parse_mode: 'Markdown', reply_markup: kb })
  } catch {
    // Markdown inválido no título/descrição — envia sem formatação
    await bot.api.sendMessage(CANAL_ID, texto.replace(/[*_]/g, ''), { reply_markup: kb })
  }
}

export function registrarDivulgacao(bot: Bot) {
  // /sugerir — admin dispara uma sugestão na hora (para testar)
  bot.command('sugerir', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    if (!CANAL_ID) {
      await ctx.reply('⚙️ Defina CANAL_ID no .env para usar a divulgação.')
      return
    }

    try {
      await postarSugestao(bot)
      await ctx.reply('✅ Sugestão publicada no canal!')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.reply(`❌ Erro ao publicar: ${msg}`)
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
