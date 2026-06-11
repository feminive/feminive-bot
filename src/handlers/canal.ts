import { Bot } from 'grammy'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''

export function registrarCanal(bot: Bot) {
  // /falar <texto> — publica no canal em nome do bot (só no privado, só o admin)
  bot.command('falar', async (ctx) => {
    if (ctx.chat.type !== 'private') return

    const userId = ctx.from?.id
    if (!userId) return

    if (!ADMIN_USER_ID || !CANAL_ID) {
      await ctx.reply(
        `⚙️ *Configuração pendente.*\n\nSeu user id: \`${userId}\`\n\nDefina no .env:\n\`ADMIN_USER_ID=${userId}\`\n\`CANAL_ID=@seucanal\` (ou o id numérico \`-100...\`)\n\nE adicione o bot como *administrador do canal* com permissão de postar mensagens.`,
        { parse_mode: 'Markdown' }
      )
      return
    }

    // Silencioso para quem não é o admin
    if (userId !== ADMIN_USER_ID) return

    const texto = (ctx.match ?? '').trim()
    if (!texto) {
      await ctx.reply(
        '✏️ Use: `/falar sua mensagem`\n\nO texto vai ser publicado no canal exatamente como você escrever (Markdown suportado).',
        { parse_mode: 'Markdown' }
      )
      return
    }

    try {
      await ctx.api.sendMessage(CANAL_ID, texto, { parse_mode: 'Markdown' })
      await ctx.reply('✅ Publicado no canal!')
    } catch {
      // Markdown inválido (ex.: * sem fechar) — tenta como texto puro
      try {
        await ctx.api.sendMessage(CANAL_ID, texto)
        await ctx.reply('✅ Publicado no canal (sem formatação — o Markdown estava inválido).')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'desconhecido'
        await ctx.reply(
          `❌ Erro ao publicar: ${msg}\n\nVerifique se o bot é administrador do canal e se o CANAL_ID está correto.`
        )
      }
    }
  })
}
