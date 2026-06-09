import 'dotenv/config'
import { Bot, webhookCallback, InlineKeyboard } from 'grammy'
import { createServer } from 'node:http'
import { registrarStart } from './handlers/start.js'
import { registrarNovelas } from './handlers/novelas.js'
import { registrarContos } from './handlers/contos.js'
import { registrarLeitura } from './handlers/leitura.js'
import { registrarSurpresa } from './handlers/surpresa.js'
import { registrarBoasVindas } from './handlers/boasvindas.js'

const bot = new Bot(process.env.BOT_TOKEN!)

// Handlers
registrarStart(bot)
registrarNovelas(bot)
registrarContos(bot)
registrarLeitura(bot)
registrarSurpresa(bot)
registrarBoasVindas(bot)

// Botão de início (volta ao menu principal)
bot.callbackQuery('inicio', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('📖 Novelas', 'novelas:0')
    .text('📝 Contos', 'contos_menu')
    .row()
    .text('🎲 Surpreenda-me', 'surpresa')

  await ctx.answerCallbackQuery()
  await ctx.editMessageText('✨ *O que você quer ler hoje?*', {
    parse_mode: 'Markdown',
    reply_markup: kb,
  })
})

bot.catch((err) => {
  console.error('Erro no bot:', err)
})

if (process.env.NODE_ENV === 'production') {
  const PORT = parseInt(process.env.PORT ?? '3000')
  const handleUpdate = webhookCallback(bot, 'http')

  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
      await handleUpdate(req, res)
    } else {
      res.writeHead(200).end('OK')
    }
  })

  server.listen(PORT, () => {
    console.log(`Bot rodando na porta ${PORT}`)
  })
} else {
  bot.start({ allowed_updates: ['message', 'callback_query', 'chat_member'] })
  console.log('Bot rodando em modo polling (dev)')
}
