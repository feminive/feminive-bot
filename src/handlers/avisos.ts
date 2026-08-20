import { Bot, Context, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'

// Preferência de broadcast da leitora. Fica separada do campo `ativo` de propósito:
// `ativo = false` significa que a pessoa BLOQUEOU o bot; aqui ela só não quer os
// avisos — continua lendo, continua no VIP, continua falando com o suporte.
export const OPTOUT_DATA = 'avisos_off'
const OPTIN_DATA = 'avisos_on'
const OPTOUT_TEXTO = '🔕 Não desejo receber mais'

// Cola a linha de opt-out embaixo do teclado da mensagem (se ela tiver um).
export function comOptOut(base?: InlineKeyboard): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (const linha of base?.inline_keyboard ?? []) kb.row(...linha)
  kb.row(InlineKeyboard.text(OPTOUT_TEXTO, OPTOUT_DATA))
  return kb
}

// Upsert em vez de update: o registro do usuário é fire-and-forget no middleware,
// então a linha pode ainda não existir quando ela clica no botão.
async function definirAvisos(userId: number, receber: boolean) {
  const { error } = await supabase
    .from('usuarios')
    .upsert({ user_id: userId, receber_avisos: receber }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

async function querAvisos(userId: number): Promise<boolean> {
  const { data } = await supabase
    .from('usuarios')
    .select('receber_avisos')
    .eq('user_id', userId)
    .maybeSingle()
  // Sem registro ainda = padrão do banco = recebe.
  return data?.receber_avisos ?? true
}

// Tira só o botão de avisos da mensagem, preservando os outros (o link do conto,
// por exemplo, que ela ainda pode querer abrir).
async function tirarBotaoDeAvisos(ctx: Context) {
  const markup = ctx.callbackQuery?.message?.reply_markup
  if (!markup) return

  const restantes = markup.inline_keyboard
    .map((linha) =>
      linha.filter((b) => !('callback_data' in b) || (b.callback_data !== OPTOUT_DATA && b.callback_data !== OPTIN_DATA))
    )
    .filter((linha) => linha.length > 0)

  await ctx
    .editMessageReplyMarkup({
      reply_markup: restantes.length ? { inline_keyboard: restantes } : undefined,
    })
    .catch(() => {
      // Mensagem antiga demais pra editar — só cosmético, a preferência já foi salva.
    })
}

function tecladoDoStatus(recebendo: boolean): InlineKeyboard {
  return recebendo
    ? new InlineKeyboard().text(OPTOUT_TEXTO, OPTOUT_DATA)
    : new InlineKeyboard().text('🔔 Quero voltar a receber', OPTIN_DATA)
}

export function registrarAvisos(bot: Bot) {
  // /avisos — a leitora vê e muda se quer receber aviso no privado.
  // É o caminho de volta: sem ele, quem desligou por engano só teria o bloqueio.
  bot.command('avisos', async (ctx) => {
    if (ctx.chat.type !== 'private' || !ctx.from) return

    const recebendo = await querAvisos(ctx.from.id)
    const texto = recebendo
      ? '🔔 *Você recebe os avisos de conto novo aqui no privado.*\n\nSe preferir, pode desligar — você continua com acesso normal a tudo.'
      : '🔕 *Você não está recebendo avisos no privado.*\n\nQuando sair conto novo, você só vai ver lá no canal.'

    await ctx.reply(texto, { parse_mode: 'Markdown', reply_markup: tecladoDoStatus(recebendo) })
  })

  bot.callbackQuery(OPTOUT_DATA, async (ctx) => {
    if (!ctx.from) return

    try {
      await definirAvisos(ctx.from.id, false)
    } catch {
      await ctx.answerCallbackQuery('Não consegui salvar agora, tenta de novo?')
      return
    }

    await ctx.answerCallbackQuery('🔕 Pronto, não te mando mais avisos')
    await tirarBotaoDeAvisos(ctx)
    await ctx.reply(
      '🔕 *Pronto, não te mando mais avisos por aqui.*\n\nVocê continua com acesso normal aos contos, à sua assinatura e ao /suporte — e os contos novos continuam saindo no canal.\n\nSe mudar de ideia, é só mandar /avisos. 💕',
      { parse_mode: 'Markdown' }
    )
  })

  bot.callbackQuery(OPTIN_DATA, async (ctx) => {
    if (!ctx.from) return

    try {
      await definirAvisos(ctx.from.id, true)
    } catch {
      await ctx.answerCallbackQuery('Não consegui salvar agora, tenta de novo?')
      return
    }

    await ctx.answerCallbackQuery('🔔 Avisos religados!')
    await tirarBotaoDeAvisos(ctx)
    await ctx.reply('🔔 *Feito!* Você volta a receber os avisos de conto novo aqui. 💕', {
      parse_mode: 'Markdown',
    })
  })
}
