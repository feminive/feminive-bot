import { Bot, InlineKeyboard } from 'grammy'
import { supabase } from '../lib/supabase.js'

export function registrarSurpresa(bot: Bot) {
  bot.callbackQuery('surpresa', async (ctx) => {
    // Pega um conto aleatório
    const { data: posts } = await supabase
      .from('posts_pt')
      .select('id, title')
      .eq('draft', false)
      .is('novel_id', null) // só avulsos para surpresa
      .limit(500)

    if (!posts?.length) {
      await ctx.answerCallbackQuery('Nenhum conto disponível.')
      return
    }

    const sorteado = posts[Math.floor(Math.random() * posts.length)]

    const kb = new InlineKeyboard()
      .text('📖 Ler agora', `ler:${sorteado.id}:0`)
      .row()
      .text('🎲 Outro', 'surpresa')
      .text('🏠 Início', 'inicio')

    await ctx.answerCallbackQuery()
    await ctx.editMessageText(
      `🎲 *Surpresa!*\n\n_${sorteado.title}_\n\nQuer ler este?`,
      { parse_mode: 'Markdown', reply_markup: kb }
    )
  })
}
