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
      '📖 */botao* — escreva a mensagem aqui no privado e *responda* a ela com /botao: o bot copia pro canal com um botão que abre o bot no privado de quem clicar (pra quem ainda não falou com o bot começar). Também aceita /botao <texto> direto. Pra um botão com link específico, responda com /botao [texto](link).',
      '🎲 */sugerir* — publica agora uma sugestão de conto aleatório no canal.',
      '🆕 */novidade* — lista os 5 últimos episódios publicados; clique em um e o bot anuncia ele no canal com imagem, chamada e botão de ler.',
      '',
      '*Mandar no privado das leitoras*',
      '🔕 */avisos* — comando das leitoras: liga/desliga os avisos no privado. Toda mensagem do /avisar já vai com o botão "Não desejo receber mais", que só desliga o broadcast — a pessoa continua lendo, no VIP e com o suporte.',
      '📢 */avisar* — escreva a mensagem aqui no privado e *responda* a ela com /avisar: o bot manda essa mensagem no privado de todo mundo que já falou com ele. Mostra um preview com a contagem e só dispara depois que você confirmar. Pra mandar com botão, responda com /avisar [texto](link).',
    ].join('\n')

    await ctx.reply(msg, { parse_mode: 'Markdown' })
  })
}
