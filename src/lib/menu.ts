import { Bot } from 'grammy'

const ADMIN_USER_ID = parseInt(process.env.ADMIN_USER_ID ?? '0', 10)

// Comandos que aparecem no botão de menu para todo mundo
const COMANDOS_PUBLICOS = [
  { command: 'start', description: 'Abrir o menu de leitura' },
  { command: 'conectar', description: 'Conectar sua assinatura VIP' },
  { command: 'suporte', description: 'Falar com o suporte' },
  { command: 'avisos', description: 'Ligar ou desligar avisos no privado' },
]

// Comandos que só o admin vê no botão de menu
const COMANDOS_ADMIN = [
  { command: 'novidade', description: 'Anunciar conto novo (canal ou privado)' },
  { command: 'start', description: 'Abrir o menu de leitura' },
  { command: 'conectar', description: 'Conectar sua assinatura VIP' },
  { command: 'suporte', description: 'Falar com o suporte' },
  { command: 'comandos', description: 'Lista de comandos com explicação' },
  { command: 'painel', description: 'Números gerais do bot e do canal' },
  { command: 'stats', description: 'Relatório de leituras dos últimos 30 dias' },
  { command: 'falar', description: 'Publicar mensagem no canal (sem botão)' },
  { command: 'botao', description: 'Publicar no canal com botão' },
  { command: 'sugerir', description: 'Publicar sugestão de conto no canal' },
  { command: 'avisar', description: 'Mandar aviso no privado das leitoras' },
  { command: 'avisos', description: 'Ligar ou desligar avisos no privado' },
]

// Define a lista que o Telegram mostra no botão "Menu" do chat.
// É config de perfil do bot: basta chamar uma vez por boot.
export async function configurarMenu(bot: Bot) {
  try {
    await bot.api.setMyCommands(COMANDOS_PUBLICOS, {
      scope: { type: 'all_private_chats' },
    })

    if (ADMIN_USER_ID) {
      await bot.api.setMyCommands(COMANDOS_ADMIN, {
        scope: { type: 'chat', chat_id: ADMIN_USER_ID },
      })
    }
  } catch (err) {
    console.error('Erro ao configurar menu de comandos:', err)
  }
}
