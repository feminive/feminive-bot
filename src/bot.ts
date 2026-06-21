import 'dotenv/config'
import { Bot, webhookCallback, InlineKeyboard } from 'grammy'
import { createServer } from 'node:http'
import { registrarStart } from './handlers/start.js'
import { registrarNovelas } from './handlers/novelas.js'
import { registrarContos } from './handlers/contos.js'
import { registrarLeitura } from './handlers/leitura.js'
import { registrarSurpresa } from './handlers/surpresa.js'
import { registrarBoasVindas } from './handlers/boasvindas.js'
import { registrarAssinante } from './handlers/assinante.js'
import { registrarCanal } from './handlers/canal.js'
import { registrarDivulgacao } from './handlers/divulgacao.js'
import { registrarStats } from './handlers/stats.js'
import { registrarAvisar } from './handlers/avisar.js'
import { registrarComandos } from './handlers/comandos.js'
import { registrarPainel } from './handlers/painel.js'
import { registrarUsuario } from './lib/usuarios.js'

const bot = new Bot(process.env.BOT_TOKEN!)

// Registra todo usuário que fala com o bot no privado (lista do broadcast).
// Precisa vir antes dos handlers para capturar qualquer mensagem.
bot.use(async (ctx, next) => {
  if (ctx.chat?.type === 'private' && ctx.from) {
    registrarUsuario(ctx.from.id, ctx.from.username, ctx.from.first_name)
  }
  await next()
})

// Handlers
registrarStart(bot)
registrarNovelas(bot)
registrarContos(bot)
registrarLeitura(bot)
registrarSurpresa(bot)
registrarBoasVindas(bot)
registrarAssinante(bot)
registrarCanal(bot)
registrarDivulgacao(bot)
registrarStats(bot)
registrarAvisar(bot)
registrarComandos(bot)
registrarPainel(bot)

// Botão de início (volta ao menu principal)
bot.callbackQuery('inicio', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('📚 Novelas em séries', 'novelas').row()
    .text('📝 Contos curtos', 'contos_menu').row()
    .text('🎲 Surpreenda-me', 'surpresa').row()
    .text('✅ Já sou assinante', 'ja_sou_assinante').text('💳 Ver planos', 'ver_planos')

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
