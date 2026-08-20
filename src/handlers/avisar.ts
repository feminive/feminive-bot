import { Bot, InlineKeyboard } from 'grammy'
import {
  PAUSA_MS,
  broadcastRodando,
  contarOptOut,
  dispararParaTodos,
  listarAtivos,
} from '../lib/broadcast.js'
import { comOptOut } from './avisos.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)

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

export function registrarAvisar(bot: Bot) {
  // /avisar — manda uma mensagem no privado de todo mundo que já falou com o bot.
  // Fluxo: escreva a mensagem no privado (pode formatar, pode ter foto/legenda) e
  // RESPONDA a ela com /avisar. O bot mostra um preview com a contagem de
  // destinatários e só dispara depois que você confirmar no botão.
  // Respondendo com /avisar [texto](link), a mensagem vai com esse botão colado.
  bot.command('avisar', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    if (broadcastRodando()) {
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

    // Todo broadcast vai com a saída fácil: opt-out custa uma linha da lista,
    // bloqueio custa a leitora inteira (e a reputação do bot no Telegram).
    const teclado = comOptOut(
      linkCustom ? new InlineKeyboard().url(linkCustom[1], linkCustom[2]) : undefined
    )

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

    const foraDaLista = await contarOptOut()

    await ctx.reply(
      `☝️ É isso que vai ser enviado (o botão de sair dos avisos vai colado em toda mensagem).

👥 Destinatários: *${destinatarios.length}*
🔕 Fora da lista por opção: *${foraDaLista}*
⏱ Tempo estimado: ~${Math.ceil((destinatarios.length * PAUSA_MS) / 1000)}s

Confirma o disparo?`,
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
    if (broadcastRodando()) {
      await ctx.answerCallbackQuery('Já está enviando')
      return
    }

    const alvo = pendente
    pendente = null

    await ctx.answerCallbackQuery('Disparando...')

    try {
      const destinatarios = await listarAtivos()
      await ctx.editMessageText(`📤 Enviando... 0/${destinatarios.length}`)

      const r = await dispararParaTodos(
        destinatarios,
        (destino) =>
          ctx.api.copyMessage(destino, alvo.chatId, alvo.messageId, {
            reply_markup: alvo.teclado,
          }),
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

      const relatorio = [
        '✅ *Broadcast concluído*',
        '',
        `📨 Enviadas: *${r.enviadas}*`,
        `🚫 Bloquearam o bot: *${r.bloquearam}*`,
        `⚠️ Erros: *${r.erros}*`,
        '',
        `_Quem bloqueou saiu da lista — não entra no próximo._`,
      ].join('\n')

      await ctx.api.sendMessage(alvo.chatId, relatorio, { parse_mode: 'Markdown' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      await ctx.api.sendMessage(alvo.chatId, `❌ Erro no broadcast: ${msg}`)
    }
  })
}
