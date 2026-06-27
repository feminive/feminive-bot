import { Bot, InlineKeyboard } from 'grammy'

const MENSAGEM_DM = `👋 Que bom ter você no *Feminive*!

Temos um acervo com centenas de contos e novelas eróticos esperando por você.

_Novelas com temporadas, contos por tema, surpresas aleatórias e muito mais._`

// Quantas boas-vindas o bot mantém visíveis ao mesmo tempo em cada grupo.
const MAX_BOAS_VINDAS = 3

// Fila (FIFO) dos ids das últimas boas-vindas que o bot postou em cada grupo.
// Ao passar de MAX_BOAS_VINDAS, apaga a mais antiga — assim o canal nunca
// acumula mais de 3 boas-vindas (sem flood), mantendo só as recentes.
const boasVindasPorGrupo = new Map<number, number[]>()

export function registrarBoasVindas(bot: Bot) {
  bot.on('chat_member', async (ctx) => {
    const membro = ctx.chatMember
    console.log('[chat_member]', JSON.stringify({
      old: membro.old_chat_member.status,
      new: membro.new_chat_member.status,
      user: membro.new_chat_member.user.id,
    }))

    // Só dispara quando alguém entra (member ou administrator)
    const statusEntrou = ['member', 'administrator', 'creator']
    const statusForaAntes = ['left', 'kicked']
    const entrou =
      statusEntrou.includes(membro.new_chat_member.status) &&
      statusForaAntes.includes(membro.old_chat_member.status)

    if (!entrou) return

    const nome = membro.new_chat_member.user.first_name
    const userId = membro.new_chat_member.user.id

    const botoes = new InlineKeyboard()
      .url('📖 Ler no Privado', `https://t.me/feminivebot?start=inicio`).row()
      .url('🌐 Ler no Site', `https://www.feminivefanfics.com.br`)

    // 1) DM no privado (só chega para quem já iniciou o bot — Telegram bloqueia o resto)
    try {
      await ctx.api.sendMessage(
        userId,
        `${MENSAGEM_DM}\n\nQue bom ter você por aqui, *${nome}*! 💕`,
        { parse_mode: 'Markdown', reply_markup: botoes }
      )
      console.log('[boasvindas] DM enviado', userId)
    } catch {
      console.log('[boasvindas] DM bloqueado (nunca iniciou o bot)', userId)
    }

    // 2) Boas-vindas no grupo, marcando a pessoa. Mantém no máximo
    //    MAX_BOAS_VINDAS visíveis: ao postar a nova, se a fila passar do
    //    limite, apaga a mais antiga (empilhamento FIFO).
    const chatId = ctx.chat.id

    const mencao = `[${nome}](tg://user?id=${userId})`
    const textoGrupo =
      `👋 Que bom ter você por aqui, ${mencao}!\n\n` +
      `Temos um acervo com centenas de contos e novelas eróticos esperando por você.\n` +
      `Toque abaixo para começar a ler 👇`

    try {
      const enviada = await ctx.api.sendMessage(chatId, textoGrupo, {
        parse_mode: 'Markdown',
        reply_markup: botoes,
      })

      const fila = boasVindasPorGrupo.get(chatId) ?? []
      fila.push(enviada.message_id)

      // Remove as mais antigas até sobrar no máximo MAX_BOAS_VINDAS.
      while (fila.length > MAX_BOAS_VINDAS) {
        const antiga = fila.shift()!
        try {
          await ctx.api.deleteMessage(chatId, antiga)
        } catch {
          // já apagada / muito antiga — ignora
        }
      }

      boasVindasPorGrupo.set(chatId, fila)
      console.log('[boasvindas] boas-vindas postada; na fila:', fila.length)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'desconhecido'
      console.error('[boasvindas] falhou ao postar no grupo:', msg)
    }
  })
}
