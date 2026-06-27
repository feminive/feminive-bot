import { Bot, InlineKeyboard } from 'grammy'
import { BOT_USERNAME } from './start.js'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)
const CANAL_ID = process.env.CANAL_ID ?? ''

export function registrarCanal(bot: Bot) {
  // /botao — publica no canal, com um botão que abre o bot no privado.
  // Fluxo: escreva a mensagem no privado do bot (com a formatação que quiser,
  // pode ter foto/legenda) e RESPONDA a ela com /botao. O bot copia a mensagem
  // pro canal e cola o botão "📖 Começar a ler" (deep link ?start=inicio),
  // que é por onde quem ainda não falou com o bot começa a interagir.
  // Também aceita /botao <texto> direto, se preferir escrever na hora.
  bot.command('botao', async (ctx) => {
    if (ctx.chat.type !== 'private') return

    const userId = ctx.from?.id
    if (!userId || !ADMIN_USER_ID || userId !== ADMIN_USER_ID) return

    if (!CANAL_ID) {
      await ctx.reply('⚙️ Defina CANAL_ID no .env para publicar no canal.')
      return
    }

    const kb = new InlineKeyboard().url(
      '📖 Começar a ler',
      `https://t.me/${BOT_USERNAME}?start=inicio`
    )

    const respondida = ctx.message?.reply_to_message
    const textoInline = (ctx.match ?? '').trim()

    // Caso 1: respondeu a uma mensagem — copia ela pro canal com o botão.
    if (respondida) {
      try {
        await ctx.api.copyMessage(CANAL_ID, ctx.chat.id, respondida.message_id, {
          reply_markup: kb,
        })
        await ctx.reply('✅ Sua mensagem foi publicada no canal com o botão!')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'desconhecido'
        await ctx.reply(
          `❌ Erro ao publicar: ${msg}\n\nVerifique se o bot é administrador do canal com permissão de postar.`
        )
      }
      return
    }

    // Caso 2: /botao <texto> direto.
    if (textoInline) {
      try {
        await ctx.api.sendMessage(CANAL_ID, textoInline, {
          parse_mode: 'Markdown',
          reply_markup: kb,
        })
        await ctx.reply('✅ Publicado no canal com o botão!')
      } catch {
        try {
          await ctx.api.sendMessage(CANAL_ID, textoInline.replace(/[*_]/g, ''), { reply_markup: kb })
          await ctx.reply('✅ Publicado no canal com o botão (sem formatação — o Markdown estava inválido).')
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'desconhecido'
          await ctx.reply(
            `❌ Erro ao publicar: ${msg}\n\nVerifique se o bot é administrador do canal com permissão de postar.`
          )
        }
      }
      return
    }

    // Sem resposta e sem texto — explica como usar.
    await ctx.reply(
      '✏️ *Como usar o /botao:*\n\n1) Escreva aqui no privado a mensagem que você quer publicar (pode formatar, pode ter foto).\n2) *Responda* a essa mensagem com `/botao`.\n\nEu copio ela pro canal já com o botão *📖 Começar a ler*.\n\n_Atalho:_ `/botao seu texto aqui` também publica na hora.',
      { parse_mode: 'Markdown' }
    )
  })

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
