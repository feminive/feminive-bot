import { Bot } from 'grammy'
import { supabase } from '../lib/supabase.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''

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

    // Leituras
    const { count: totalLeituras } = await supabase
      .from('leituras')
      .select('id', { count: 'exact', head: true })
    const { count: aberturas } = await supabase
      .from('leituras')
      .select('id', { count: 'exact', head: true })
      .eq('pagina', 0)

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
      `📚 Total de leituras: *${totalLeituras ?? 0}*`,
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
