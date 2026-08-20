import { GrammyError } from 'grammy'
import { supabase } from './supabase.js'

// O Telegram aceita ~30 msg/s no total; 50ms entre envios deixa margem folgada.
export const PAUSA_MS = 50
// De quantos em quantos envios a barra anda. Editar mensagem tem limite proprio,
// entao nao da pra atualizar a cada envio — 25 mostra movimento sem estourar.
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

// Lista paginada — a tabela vai crescer e o PostgREST corta em 1000 por página.
// Só entra quem não bloqueou o bot (ativo) E não pediu pra sair dos avisos.
export async function listarAtivos(): Promise<number[]> {
  const ids: number[] = []
  const TAM = 1000

  for (let de = 0; ; de += TAM) {
    const { data, error } = await supabase
      .from('usuarios')
      .select('user_id')
      .eq('ativo', true)
      .eq('receber_avisos', true)
      .order('user_id')
      .range(de, de + TAM - 1)

    if (error) {
      console.error('Erro ao listar usuários:', error.message)
      break
    }
    if (!data || data.length === 0) break

    ids.push(...data.map((u) => u.user_id))
    if (data.length < TAM) break
  }

  return ids
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

// Percorre a lista mandando `enviar` pra cada uma, no ritmo que o Telegram aceita.
// Quem bloqueou o bot (403) sai da lista no fim, numa tacada só.
export async function dispararParaTodos(
  destinatarios: number[],
  enviar: (destino: number) => Promise<unknown>,
  aoProgredir?: (feitos: number, total: number) => Promise<void>
): Promise<ResultadoBroadcast> {
  if (emAndamento) throw new Error('Já tem um broadcast rodando')
  emAndamento = true

  try {
    const bloquearam: number[] = []
    let enviadas = 0
    let erros = 0

    for (let i = 0; i < destinatarios.length; i++) {
      const destino = destinatarios[i]

      try {
        await enviar(destino)
        enviadas++
      } catch (err) {
        if (err instanceof GrammyError && err.error_code === 403) {
          // Bloqueou o bot ou apagou a conta — sai da lista.
          bloquearam.push(destino)
        } else if (err instanceof GrammyError && err.error_code === 429) {
          await dormir((err.parameters?.retry_after ?? 5) * 1000)
          try {
            await enviar(destino)
            enviadas++
          } catch {
            erros++
          }
        } else {
          erros++
        }
      }

      if ((i + 1) % PASSO_PROGRESSO === 0 && aoProgredir) {
        await aoProgredir(i + 1, destinatarios.length)
      }

      await dormir(PAUSA_MS)
    }

    if (bloquearam.length > 0) {
      const { error } = await supabase
        .from('usuarios')
        .update({ ativo: false })
        .in('user_id', bloquearam)
      if (error) console.error('Erro ao marcar bloqueados:', error.message)
    }

    return { enviadas, bloquearam: bloquearam.length, erros }
  } finally {
    emAndamento = false
  }
}
