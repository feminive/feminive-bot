import { Bot } from 'grammy'
import { supabase } from '../lib/supabase.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''

// São Paulo é UTC-3 fixo (sem horário de verão desde 2019).
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000

// Retorna os instantes (ISO, em UTC) de início do dia, da semana (segunda) e do mês,
// calculados no fuso de São Paulo.
function inicioDosPeriodos(): { dia: string; semana: string; mes: string } {
  const spNow = new Date(Date.now() - TZ_OFFSET_MS) // "agora" em SP, expresso como se fosse UTC
  const ano = spNow.getUTCFullYear()
  const mes = spNow.getUTCMonth()
  const dia = spNow.getUTCDate()

  const diffSegunda = (spNow.getUTCDay() + 6) % 7 // 0=dom -> volta até segunda

  const inicioDiaSP = Date.UTC(ano, mes, dia)
  const inicioSemanaSP = Date.UTC(ano, mes, dia - diffSegunda)
  const inicioMesSP = Date.UTC(ano, mes, 1)

  return {
    dia: new Date(inicioDiaSP + TZ_OFFSET_MS).toISOString(),
    semana: new Date(inicioSemanaSP + TZ_OFFSET_MS).toISOString(),
    mes: new Date(inicioMesSP + TZ_OFFSET_MS).toISOString(),
  }
}

async function contarLeituras(desde?: string): Promise<number> {
  let q = supabase.from('leituras').select('id', { count: 'exact', head: true })
  if (desde) q = q.gte('criado_em', desde)
  const { count } = await q
  return count ?? 0
}

export function registrarPainel(bot: Bot) {
  // /painel — admin vê o panorama geral de números (só no privado)
  bot.command('painel', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    // Membros do canal (vem direto do Telegram)
    let membrosCanal: number | null = null
    if (CANAL_ID) {
      try {
        membrosCanal = await ctx.api.getChatMemberCount(CANAL_ID)
      } catch {
        membrosCanal = null
      }
    }

    // Usuários do bot (tabela usuarios)
    const { count: totalUsuarios } = await supabase
      .from('usuarios')
      .select('user_id', { count: 'exact', head: true })
    const { count: bloqueados } = await supabase
      .from('usuarios')
      .select('user_id', { count: 'exact', head: true })
      .eq('ativo', false)

    // Aberturas de conto (página 0)
    const { count: aberturas } = await supabase
      .from('leituras')
      .select('id', { count: 'exact', head: true })
      .eq('pagina', 0)

    // Leituras segmentadas por período (fuso de São Paulo)
    const periodos = inicioDosPeriodos()
    const [leiturasDia, leiturasSemana, leiturasMes, totalLeituras] = await Promise.all([
      contarLeituras(periodos.dia),
      contarLeituras(periodos.semana),
      contarLeituras(periodos.mes),
      contarLeituras(),
    ])

    // Leitores únicos (dedup pelo user_id)
    const { data: linhasLeitores } = await supabase
      .from('leituras')
      .select('user_id')
      .limit(100000)
    const leitoresUnicos = new Set((linhasLeitores ?? []).map((l) => l.user_id)).size

    const ativos = (totalUsuarios ?? 0) - (bloqueados ?? 0)

    const linhas = [
      '📊 *Painel Feminive*',
      '',
      `📣 Membros do canal: *${membrosCanal ?? '—'}*`,
      '',
      `👥 Usuários do bot: *${totalUsuarios ?? 0}*`,
      `   • Ativos: *${ativos}*  ·  🚫 Bloquearam: *${bloqueados ?? 0}*`,
      '',
      `📖 Leitores únicos: *${leitoresUnicos}*`,
      '',
      '📚 *Leituras*',
      `   • Hoje: *${leiturasDia}*`,
      `   • Esta semana: *${leiturasSemana}*`,
      `   • Este mês: *${leiturasMes}*`,
      `   • Total: *${totalLeituras}*`,
      `   • Aberturas de conto: *${aberturas ?? 0}*`,
      '',
      '_Use /stats para o detalhamento dos últimos 30 dias._',
    ]

    try {
      await ctx.reply(linhas.join('\n'), { parse_mode: 'Markdown' })
    } catch {
      await ctx.reply(linhas.join('\n').replace(/[*_]/g, ''))
    }
  })
}
