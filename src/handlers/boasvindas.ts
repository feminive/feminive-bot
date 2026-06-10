import { Bot, InlineKeyboard } from 'grammy'

const MENSAGEM = `👋 Bem-vinda ao *Feminive*!

Temos um acervo com centenas de contos e novelas eróticos esperando por você. 🔥

📖 Acesse agora o nosso bot e comece a ler:
👉 @feminive\\_bot

_Novelas com temporadas, contos por tema, surpresas aleatórias e muito mais._`

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

    const botaoStart = new InlineKeyboard().url('📖 Começar a ler', `https://t.me/feminivebot?start=inicio`)

    try {
      await ctx.api.sendMessage(
        userId,
        `${MENSAGEM}\n\nSeja bem-vinda, *${nome}*! 💕`,
        { parse_mode: 'Markdown', reply_markup: botaoStart }
      )
    } catch {
      // Usuário nunca abriu o bot — silencioso, não posta no grupo
    }
  })
}
