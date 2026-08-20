import { GrammyError } from 'grammy'
import { supabase } from './supabase.js'

// O Telegram aceita ~30 msg/s no total; 50ms entre envios deixa margem folgada.
export const PAUSA_MS = 50
const PAGINA = 1000
// De quantos em quantos envios a barra anda. Editar mensagem tem limite próprio,
// então não dá pra atualizar a cada envio — 25 mostra movimento sem estourar.
const PASSO_PROGRESSO = 25

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Um disparo por vez no processo inteiro: dois broadcasts simultâneos
// estouram o limite do Telegram e derrubam os dois.
let emAndamento = false
export function broadcastRodando(): boolean {
  return emAndamento
}

export type ResultadoBroadcast = {
  enviadas: number
  bloquearam: number
  erros: number
}

// Público do broadcast: quem não bloqueou o bot E não pediu pra sair dos avisos.
export async function contarAtivos(): Promise<number> {
  const { count, error } = await supabase
    .from('usuarios')
    .select('user_id', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('receber_avisos', true)

  if (error) throw new Error(error.message)
  return count ?? 0
}

// Quantos ainda usam o bot mas desligaram os avisos — termômetro do broadcast.
export async function contarOptOut(): Promise<number> {
  const { count } = await supabase
    .from('usuarios')
    .select('user_id', { count: 'exact', head: true })
    .eq('ativo', true)
    .eq('receber_avisos', false)

  return count ?? 0
}

// Uma tentativa por leitora, com uma repetição só no flood limit (429).
async function tentarEnviar(
  enviar: (destino: number) => Promise<unknown>,
  destino: number
): Promise<'ok' | 'bloqueado' | 'falha'> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await enviar(destino)
      return 'ok'
    } catch (err) {
      if (err instanceof GrammyError) {
        // Bloqueou o bot ou apagou a conta.
        if (err.error_code === 403) return 'bloqueado'
        // Flood limit: espera o tempo pedido e tenta de novo uma vez.
        if (err.error_code === 429) {
          await dormir((err.parameters?.retry_after ?? 5) * 1000)
          continue
        }
      }
      return 'falha'
    }
  }
  return 'falha'
}

// Percorre a lista mandando `enviar` pra cada uma, no ritmo que o Telegram aceita.
// Pagina por cursor (user_id) em vez de offset: como o próprio disparo marca gente
// como inativa enquanto roda, um offset iria pular linhas no meio do caminho.
export async function dispararParaTodos(
  enviar: (destino: number) => Promise<unknown>,
  aoProgredir?: (feitos: number) => Promise<void>
): Promise<ResultadoBroadcast> {
  if (emAndamento) throw new Error('Já tem um broadcast rodando')
  emAndamento = true

  try {
    const bloquearam: number[] = []
    let enviadas = 0
    let erros = 0
    let feitos = 0
    let ultimoId = 0

    for (;;) {
      const { data, error } = await supabase
        .from('usuarios')
        .select('user_id')
        .eq('ativo', true)
        .eq('receber_avisos', true)
        .gt('user_id', ultimoId)
        .order('user_id', { ascending: true })
        .limit(PAGINA)

      if (error) throw new Error(error.message)
      if (!data?.length) break

      for (const u of data) {
        const resultado = await tentarEnviar(enviar, u.user_id)
        if (resultado === 'ok') enviadas++
        else if (resultado === 'bloqueado') bloquearam.push(u.user_id)
        else erros++

        feitos++
        if (feitos % PASSO_PROGRESSO === 0 && aoProgredir) await aoProgredir(feitos)

        await dormir(PAUSA_MS)
      }

      ultimoId = data[data.length - 1].user_id
      if (data.length < PAGINA) break
    }

    // Quem bloqueou sai da lista de uma vez só, no fim. O carimbo de data permite
    // separar, no próximo disparo, quem bloqueou agora de quem já tinha bloqueado
    // há tempos e só foi descoberto aqui.
    if (bloquearam.length > 0) {
      const { error } = await supabase
        .from('usuarios')
        .update({ ativo: false, inativo_em: new Date().toISOString() })
        .in('user_id', bloquearam)
      if (error) console.error('Erro ao marcar bloqueados:', error.message)
    }

    return { enviadas, bloquearam: bloquearam.length, erros }
  } finally {
    emAndamento = false
  }
}
