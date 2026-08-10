import { Bot, InlineKeyboard, GrammyError } from 'grammy'
import { supabase } from '../lib/supabase.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)

// O Telegram aceita ~30 msg/s no total; 50ms entre envios deixa margem folgada.
const PAUSA_MS = 50
// Preview antigo não vale mais — evita confirmar por engano uma mensagem de ontem.
const VALIDADE_MS = 10 * 60 * 1000

type Pendente = {
  chatId: number
  messageId: number
  teclado?: InlineKeyboard
  criadoEm: number
}

// Só o admin dispara broadcast, então um pendente global basta.
let pendente: Pendente | null = null
let enviando = false

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Lista paginada — a tabela vai crescer e o PostgREST corta em 1000 por página.
async function listarAtivos(): Promise<number[]> {
  const ids: number[] = []
  const TAM = 1000

  for (let de = 0; ; de += TAM) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('user_id')
      .eq('ativo', true)
      .order('user_id')
      .range(de, de + TAM - 1)

    if (error) {
      console.error('Erro ao listar usuários:', error.message)
      break
    }
    if (!data || data.length === 0) break

    ids.push(...data.map((u) => u.user_id))
    if (data.length < TAM) break
  }

  return ids
}

export function registrarAvisar(bot: Bot) {
  // /avisar — manda uma mensagem no privado de todo mundo que já falou com o bot.
  // Fluxo: escreva a mensagem no privado (pode formatar, pode ter foto/legenda) e
  // RESPONDA a ela com /avisar. O bot mostra um preview com a contagem de
  // destinatários e só dispara depois que você confirmar no botão.
  // Respondendo com /avisar [texto](link), a mensagem vai com esse botão colado.
  bot.command('avisar', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    if (enviando) {
      await ctx.reply('⏳ Já tem um broadcast rodando. Espere ele terminar.')
      return
    }

    const respondida = ctx.message?.reply_to_message
    const textoInline = (ctx.match ?? '').trim()
    const linkCustom = textoInline.match(/^\[(.+)\]\((https?:\/\/\S+)\)$/)

    if (linkCustom) {
      try {
        new URL(linkCustom[2])
      } catch {
        await ctx.reply('❌ Link inválido. Use o formato: `/avisar [texto](https://...)`', {
          parse_mode: 'Markdown',
        })
        return
      }
    }

    if (!respondida) {
      await ctx.reply(
        '✏️ *Como usar o /avisar:*\n\n1) Escreva aqui no privado a mensagem que você quer mandar (pode formatar, pode ter foto).\n2) *Responda* a essa mensagem com `/avisar`.\n\nEu mostro um preview com quantas pessoas vão receber e só disparo depois que você confirmar.\n\n_Com botão:_ responda com `/avisar [texto](link)` pra mandar a mensagem com um botão colado.',
        { parse_mode: 'Markdown' }
      )
      return
    }

    const destinatarios = await listarAtivos()
    if (destinatarios.length === 0) {
      await ctx.reply('🤷 Nenhum usuário ativo na lista — não tem pra quem mandar.')
      return
    }

    const teclado = linkCustom
      ? new InlineKeyboard().url(linkCustom[1], linkCustom[2])
      : undefined

    pendente = {
      chatId: ctx.chat.id,
      messageId: respondida.message_id,
      teclado,
      criadoEm: Date.now(),
    }

    // Preview: manda pra você exatamente o que as pessoas vão receber.
    try {
      await ctx.api.copyMessage(ctx.chat.id, ctx.chat.id, respondida.message_id, {
        reply_markup: teclado,
      })
    } catch (err) {
      pendente = null
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.reply(`❌ Não consegui montar o preview: ${msg}`)
      return
    }

    const kb = new InlineKeyboard()
      .text(`✅ Enviar para ${destinatarios.length}`, 'avisar_confirmar')
      .text('❌ Cancelar', 'avisar_cancelar')

    await ctx.reply(
      `☝️ É isso que vai ser enviado${teclado ? ' (com o botão acima)' : ''}.\n\n👥 Destinatários: *${destinatarios.length}*\n⏱ Tempo estimado: ~${Math.ceil((destinatarios.length * PAUSA_MS) / 1000)}s\n\nConfirma o disparo?`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })

  bot.callbackQuery('avisar_cancelar', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return
    pendente = null
    await ctx.answerCallbackQuery('Cancelado')
    await ctx.editMessageText('❌ Broadcast cancelado.')
  })

  bot.callbackQuery('avisar_confirmar', async (ctx) => {
    if (ctx.from.id !== ADMIN_USER_ID) return

    if (!pendente) {
      await ctx.answerCallbackQuery('Nada pendente')
      await ctx.editMessageText('❌ Não achei a mensagem pendente. Refaça o /avisar.')
      return
    }
    if (Date.now() - pendente.criadoEm > VALIDADE_MS) {
      pendente = null
      await ctx.answerCallbackQuery('Expirou')
      await ctx.editMessageText('⌛ Esse preview expirou. Refaça o /avisar.')
      return
    }
    if (enviando) {
      await ctx.answerCallbackQuery('Já está enviando')
      return
    }

    const alvo = pendente
    pendente = null
    enviando = true

    await ctx.answerCallbackQuery('Disparando...')

    try {
      const destinatarios = await listarAtivos()
      const bloquearam: number[] = []
      let enviadas = 0
      let erros = 0

      await ctx.editMessageText(`📤 Enviando... 0/${destinatarios.length}`)

      for (let i = 0; i < destinatarios.length; i++) {
        const destino = destinatarios[i]

        try {
          await ctx.api.copyMessage(destino, alvo.chatId, alvo.messageId, {
            reply_markup: alvo.teclado,
          })
          enviadas++
        } catch (err) {
          if (err instanceof GrammyError && err.error_code === 403) {
            // Bloqueou o bot ou apagou a conta — sai da lista.
            bloquearam.push(destino)
          } else if (err instanceof GrammyError && err.error_code === 429) {
            await dormir((err.parameters?.retry_after ?? 5) * 1000)
            try {
              await ctx.api.copyMessage(destino, alvo.chatId, alvo.messageId, {
                reply_markup: alvo.teclado,
              })
              enviadas++
            } catch {
              erros++
            }
          } else {
            erros++
          }
        }

        // Progresso a cada 50 — não dá pra editar mensagem a cada envio (rate limit).
        if ((i + 1) % 50 === 0) {
          try {
            await ctx.editMessageText(`📤 Enviando... ${i + 1}/${destinatarios.length}`)
          } catch {
            // Editar é só cosmético; se falhar, o envio continua.
          }
        }

        await dormir(PAUSA_MS)
      }

      // Quem bloqueou sai da lista de uma vez só, não a cada erro.
      if (bloquearam.length > 0) {
        const { error } = await supabase
          .from('usuarios')
          .update({ ativo: false })
          .in('user_id', bloquearam)
        if (error) console.error('Erro ao marcar bloqueados:', error.message)
      }

      try {
        await ctx.editMessageText(`📤 Envio finalizado — ${destinatarios.length} tentativas.`)
      } catch {
        // Cosmético.
      }

      const relatorio = [
        '✅ *Broadcast concluído*',
        '',
        `📨 Enviadas: *${enviadas}*`,
        `🚫 Bloquearam o bot: *${bloquearam.length}*`,
        `⚠️ Erros: *${erros}*`,
        '',
        `_Quem bloqueou saiu da lista — não entra no próximo._`,
      ].join('\n')

      await ctx.api.sendMessage(alvo.chatId, relatorio, { parse_mode: 'Markdown' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.api.sendMessage(alvo.chatId, `❌ Erro no broadcast: ${msg}`)
    } finally {
      enviando = false
    }
  })
}
