import { Bot } from 'grammy'

const MENSAGEM = `👋 Bem-vinda ao *Feminive*!

Temos um acervo com centenas de contos e novelas eróticos esperando por você. 🔥

📖 Acesse agora o nosso bot e comece a ler:
👉 @feminive\\_bot

_Novelas com temporadas, contos por tema, surpresas aleatórias e muito mais._`

export function registrarBoasVindas(bot: Bot) {
  bot.on('chat_member', async (ctx) => {
    const membro = ctx.chatMember

    // Só dispara quando alguém entra (member ou administrator)
    const entrou =
      membro.new_chat_member.status === 'member' &&
      membro.old_chat_member.status !== 'member'

    if (!entrou) return

    const nome = membro.new_chat_member.user.first_name

    await ctx.reply(
      `${MENSAGEM}\n\nSeja bem-vinda, *${nome}*! 💕`,
      { parse_mode: 'Markdown' }
    )
  })
}
