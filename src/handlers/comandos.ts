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
      '🗣 */falar* — escreva a mensagem aqui no privado e *responda* a ela com /falar: o bot copia pro canal exatamente como está (sem botão). Também aceita /falar <texto> direto.',
      '📖 */botao* — escreva a mensagem aqui no privado e *responda* a ela com /botao: o bot copia pro canal com um botão que abre o bot no privado de quem clicar (pra quem ainda não falou com o bot começar). Também aceita /botao <texto> direto.',
      '🎲 */sugerir* — publica agora uma sugestão de conto aleatório no canal.',
    ].join('\n')

    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })
}
