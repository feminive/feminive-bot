import { Bot } from 'grammy'
import { supabase } from '../lib/supabase.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const JANELA_DIAS = 30
const TOP_N = 5

type EventoLeitura = {
  post_id: string
  pagina: number
  origem: string
  premium_bloqueado: boolean
  criado_em: string
}

export function registrarStats(bot: Bot) {
  // /stats — admin vê o resumo de leituras no privado
  bot.command('stats', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('leituras')
      .select('post_id, pagina, origem, premium_bloqueado, criado_em')
      .gte('criado_em', desde)
      .limit(50000)

    if (error) {
      await ctx.reply(`❌ Erro ao consultar leituras: ${error.message}`)
      return
    }

    const eventos = (data ?? []) as EventoLeitura[]
    if (!eventos.length) {
      await ctx.reply('📊 Ainda não há leituras registradas nos últimos 30 dias.')
      return
    }

    const agora = Date.now()
    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)
    const ms7d = 7 * 24 * 60 * 60 * 1000

    const aberturas = eventos.filter((e) => e.pagina === 0 && !e.premium_bloqueado)
    const viradas = eventos.filter((e) => e.pagina > 0)
    const muros = eventos.filter((e) => e.premium_bloqueado)
    const doCanal = aberturas.filter((e) => e.origem === 'canal')

    const aberturasHoje = aberturas.filter((e) => new Date(e.criado_em) >= inicioHoje).length
    const aberturas7d = aberturas.filter((e) => agora - new Date(e.criado_em).getTime() <= ms7d).length

    // Top contos por número de aberturas
    const contagem = new Map<string, number>()
    for (const e of aberturas) {
      contagem.set(e.post_id, (contagem.get(e.post_id) ?? 0) + 1)
    }
    const topIds = [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)

    // Busca os títulos dos contos do top
    const titulos = new Map<string, string>()
    if (topIds.length) {
      const { data: posts } = await supabase
        .from('posts_pt')
        .select('id, title')
        .in('id', topIds.map(([id]) => id))
      for (const p of posts ?? []) titulos.set(p.id, p.title)
    }

    const topLinhas = topIds
      .map(([id, n], i) => `${i + 1}. ${titulos.get(id) ?? id} — *${n}*`)
      .join('\n')

    const msg =
      `📊 *Leituras — últimos ${JANELA_DIAS} dias*\n\n` +
      `📖 Aberturas: *${aberturas.length}*\n` +
      `   • Hoje: *${aberturasHoje}*  ·  7 dias: *${aberturas7d}*\n` +
      `📣 Vindas do canal: *${doCanal.length}*\n` +
      `📄 Páginas viradas: *${viradas.length}*\n` +
      `🔒 Muros premium: *${muros.length}*\n\n` +
      `🏆 *Top ${TOP_N} contos*\n${topLinhas}`

    try {
      await ctx.reply(msg, { parse_mode: 'Markdown' })
    } catch {
      await ctx.reply(msg.replace(/[*_]/g, ''))
    }
  })
}
