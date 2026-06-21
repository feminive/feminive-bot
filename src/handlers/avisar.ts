import { Bot, InlineKeyboard, GrammyError } from 'grammy'
import { supabase } from '../lib/supabase.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)

// Throttle de envio: ~20 msg/s para respeitar o limite de broadcast do Telegram.
const DELAY_MS = 50
const PAGINA = 1000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Broadcast aguardando confirmação, chaveado pelo admin.
type Pendente = { fromChatId: number; messageId: number }
const pendentes = new Map<number, Pendente>()

// Copia a mensagem para um usuário, tratando o flood limit (429) com uma
// nova tentativa após o tempo pedido pelo Telegram.
async function copiarParaUsuario(
  bot: Bot,
  userId: number,
  pend: Pendente
): Promise<'ok' | 'bloqueado' | 'falha'> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await bot.api.copyMessage(userId, pend.fromChatId, pend.messageId)
      return 'ok'
    } catch (err) {
      if (err instanceof GrammyError) {
        // Usuário bloqueou o bot ou desativou a conta.
        if (err.error_code === 403) return 'bloqueado'
        // Flood limit: espera o tempo pedido e tenta de novo uma vez.
        if (err.error_code === 429) {
          const espera = (err.parameters?.retry_after ?? 1) * 1000
          await sleep(espera)
          continue
        }
      }
      return 'falha'
    }
  }
  return 'falha'
}

export function registrarAvisar(bot: Bot) {
  // /avisar — admin responde a uma mensagem para enviá-la a todos os usuários.
  bot.command('avisar', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    const alvo = ctx.message?.reply_to_message
    if (!alvo) {
      await ctx.reply('✍️ Responda à mensagem que quer enviar usando /avisar.')
      return
    }

    const { count, error } = await supabase
      .from('usuarios')
      .select('user_id', { count: 'exact', head: true })
      .eq('ativo', true)

    if (error) {
      await ctx.reply(`❌ Erro ao contar usuários: ${error.message}`)
      return
    }

    pendentes.set(ctx.from.id, { fromChatId: ctx.chat.id, messageId: alvo.message_id })

    const kb = new InlineKeyboard()
      .text('✅ Enviar', 'avisar_confirmar')
      .text('❌ Cancelar', 'avisar_cancelar')

    await ctx.reply(
      `📣 Vou enviar a mensagem que você respondeu para *${count ?? 0}* usuário(s).\n\nConfirmar?`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })

  bot.callbackQuery('avisar_cancelar', async (ctx) => {
    if (ctx.from?.id !== ADMIN_USER_ID) {
      await ctx.answerCallbackQuery()
      return
    }
    pendentes.delete(ctx.from.id)
    await ctx.answerCallbackQuery()
    await ctx.editMessageText('❌ Envio cancelado.')
  })

  bot.callbackQuery('avisar_confirmar', async (ctx) => {
    if (ctx.from?.id !== ADMIN_USER_ID) {
      await ctx.answerCallbackQuery()
      return
    }

    const pend = pendentes.get(ctx.from.id)
    if (!pend) {
      await ctx.answerCallbackQuery({ text: 'Nada para enviar.' })
      return
    }
    pendentes.delete(ctx.from.id)
    await ctx.answerCallbackQuery()
    await ctx.editMessageText('🚀 Enviando... isso pode levar alguns minutos.')

    let enviados = 0
    let bloqueados = 0
    let falhas = 0

    // Paginação por cursor (user_id) — robusta mesmo marcando inativos durante o envio.
    let ultimoId = 0
    for (;;) {
      const { data, error } = await supabase
        .from('usuarios')
        .select('user_id')
        .eq('ativo', true)
        .gt('user_id', ultimoId)
        .order('user_id', { ascending: true })
        .limit(PAGINA)

      if (error) {
        await ctx.reply(`❌ Erro ao buscar usuários: ${error.message}`)
        break
      }
      if (!data?.length) break

      for (const u of data) {
        const resultado = await copiarParaUsuario(bot, u.user_id, pend)
        if (resultado === 'ok') enviados++
        else if (resultado === 'bloqueado') {
          bloqueados++
          void supabase.from('usuarios').update({ ativo: false }).eq('user_id', u.user_id)
        } else falhas++
        await sleep(DELAY_MS)
      }

      ultimoId = data[data.length - 1].user_id
      if (data.length < PAGINA) break
    }

    await ctx.reply(
      `✅ *Broadcast concluído*\n\n` +
        `📨 Enviados: *${enviados}*\n` +
        `🚫 Bloquearam o bot: *${bloqueados}*\n` +
        `❌ Falhas: *${falhas}*`,
      { parse_mode: 'Markdown' }
    )
  })
}
