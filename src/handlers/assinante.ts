import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'
import { stripe } from '../lib/stripe.js'

const PLANOS_URL_BASE = 'https://www.feminivefanfics.com.br/assinaturas/planos/'

// UTM para o GA4 atribuir a origem da compra ao bot do Telegram
function planosUrl(content: string): string {
  return `${PLANOS_URL_BASE}?utm_source=telegram&utm_medium=social&utm_campaign=bot_planos&utm_content=${content}`
}

// Usuários aguardando digitar o email
const aguardandoEmail = new Set<number>()

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function registrarAssinante(bot: Bot) {
  // Botão "Já sou assinante"
  bot.callbackQuery('ja_sou_assinante', async (ctx) => {
    const userId = ctx.from?.id
    if (!userId) return

    // Verifica se já está vinculado
    const { data: vinculo } = await supabase
      .from('telegram_assinantes')
      .select('email')
      .eq('telegram_user_id', userId)
      .single()

    if (vinculo) {
      await ctx.answerCallbackQuery()
      await ctx.editMessageText(
        `✅ *Você já é assinante!*\n\nEmail vinculado: \`${vinculo.email}\`\n\nAproveite o acesso completo! 💕`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard().text('🏠 Início', 'inicio'),
        }
      )
      return
    }

    aguardandoEmail.add(userId)
    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      '📧 *Digite seu email de assinante:*\n\n_Use o mesmo email cadastrado no momento da compra._',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('❌ Cancelar', 'inicio'),
      }
    )
  })

  // Botão "Ver planos"
  bot.callbackQuery('ver_planos', async (ctx) => {
    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      '💳 *Assine o Feminive*\n\nAcesse centenas de contos e novelas por apenas *R$ 14,90/mês*.',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .url('🔗 Ver planos', planosUrl('menu_ver_planos')).row()
          .text('🏠 Início', 'inicio'),
      }
    )
  })

  // Recebe o email digitado (passa adiante se não estiver aguardando email deste usuário)
  bot.on('message:text', async (ctx, next) => {
    const userId = ctx.from?.id
    if (!userId || !aguardandoEmail.has(userId)) return next()

    // Comandos não são email — devolve ao fluxo normal
    if (ctx.message.text.startsWith('/')) {
      aguardandoEmail.delete(userId)
      return next()
    }

    aguardandoEmail.delete(userId)

    const email = ctx.message.text.trim().toLowerCase()

    if (!emailValido(email)) {
      await ctx.reply(
        '❌ *Email inválido.* Verifique o formato e tente novamente.',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('🔁 Tentar novamente', 'ja_sou_assinante').row()
            .text('🏠 Início', 'inicio'),
        }
      )
      return
    }

    // Verifica no Stripe se tem acesso ativo (cartão ou pix)
    const temAcesso = await emailTemAcessoAtivo(email)

    if (!temAcesso) {
      await ctx.reply(
        '⚠️ *Nenhuma assinatura ativa encontrada.*\n\nVerifique se usou o email correto ou se sua assinatura ainda está vigente.',
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('🔁 Tentar outro email', 'ja_sou_assinante').row()
            .url('💳 Ver planos', planosUrl('email_sem_assinatura')).row()
            .text('🏠 Início', 'inicio'),
        }
      )
      return
    }

    // Vincula o telegram_user_id ao email
    await supabase
      .from('telegram_assinantes')
      .upsert({ telegram_user_id: userId, email, vinculado_em: new Date().toISOString() })

    await ctx.reply(
      '✅ *Acesso liberado!*\n\nQue bom ter você de volta! Agora você tem acesso a todo o conteúdo premium. 💕',
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard()
          .text('📚 Novelas em séries', 'novelas').row()
          .text('📝 Contos curtos', 'contos_menu').row()
          .text('🎲 Surpreenda-me', 'surpresa'),
      }
    )
  })
}

// Mapeamento price_id → dias de acesso (igual ao site)
const PIX_PRICE_DAYS: Record<string, number> = {
  'price_1SWRiG2Nl22xzN05mO394hSw': 30,
  'price_1SnMZU2Nl22xzN05QgQdnJyC': 90,
  'price_1SWRJ32Nl22xzN05rVBOhwsZ': 365,
}

// Verifica assinatura de cartão no Stripe
async function verificarCartao(email: string): Promise<boolean> {
  const customers = await stripe.customers.list({ email, limit: 10 })
  if (!customers.data.length) return false

  const customer = customers.data.sort((a, b) => b.created - a.created)[0]

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'all',
    limit: 100,
  })

  return subs.data.some(s =>
    ['active', 'trialing', 'past_due'].includes(s.status)
  )
}

// Verifica pagamento Pix no Stripe
async function verificarPix(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase()
  const doisAnosAtras = Math.floor(Date.now() / 1000) - 2 * 365 * 24 * 60 * 60

  const sessions = stripe.checkout.sessions.list({
    limit: 100,
    status: 'complete',
    created: { gte: doisAnosAtras },
    expand: ['data.line_items'],
  })

  let ativo = false

  await sessions.autoPagingEach((session) => {
    if (session.payment_status !== 'paid') return true
    const sessionEmail = (session.customer_details?.email ?? '').trim().toLowerCase()
    if (sessionEmail !== normalizedEmail) return true

    const priceId = (session as any).line_items?.data?.[0]?.price?.id
    const days = (priceId && PIX_PRICE_DAYS[priceId]) ? PIX_PRICE_DAYS[priceId] : 30
    const expiresAt = new Date(session.created * 1000 + days * 24 * 60 * 60 * 1000)

    if (expiresAt > new Date()) {
      ativo = true
      return false // para de paginar
    }

    return true
  })

  return ativo
}

// Verifica se um email tem acesso ativo (cartão OU pix)
export async function emailTemAcessoAtivo(email: string): Promise<boolean> {
  const [cartao, pix] = await Promise.allSettled([
    verificarCartao(email),
    verificarPix(email),
  ])

  return (cartao.status === 'fulfilled' && cartao.value) ||
         (pix.status === 'fulfilled' && pix.value)
}

// Verifica se um telegram_user_id tem assinatura ativa
export async function usuarioEhAssinante(telegramUserId: number): Promise<boolean> {
  const { data: vinculo } = await supabase
    .from('telegram_assinantes')
    .select('email')
    .eq('telegram_user_id', telegramUserId)
    .single()

  if (!vinculo) return false

  return emailTemAcessoAtivo(vinculo.email)
}
