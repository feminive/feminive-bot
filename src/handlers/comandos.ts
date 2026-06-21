import { Bot } from 'grammy'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)

export function registrarComandos(bot: Bot) {
  // /comandos — admin vê a lista de comandos do bot com explicação (só no privado)
  bot.command('comandos', async (ctx) => {
    if (ctx.chat.type !== 'private') return
    if (!ADMIN_USER_ID || ctx.from?.id !== ADMIN_USER_ID) return

    const msg = [
      '🛠 *Comandos disponíveis*',
      '',
      '📖 */start* — abre o menu de leitura (é o que as leitoras usam).',
      '🗂 */comandos* — mostra esta lista.',
      '',
      '*Painel e dados*',
      '📊 */painel* — números gerais: membros do canal, usuários do bot, leitores e leituras.',
      '📈 */stats* — relatório de leituras dos últimos 30 dias (aberturas, top contos, etc.).',
      '',
      '*Publicar no canal*',
      '🗣 */falar <texto>* — publica a mensagem no canal em nome do bot (Markdown suportado).',
      '🎲 */sugerir* — publica agora uma sugestão de conto aleatório no canal.',
      '',
      '*Mensagem no privado de todos*',
      '📣 */avisar* — responda a uma mensagem com este comando para enviá-la no privado de todos os usuários (com confirmação antes de disparar).',
    ].join('\n')

    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })
}
