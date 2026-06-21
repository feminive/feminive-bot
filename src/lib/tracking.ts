import { supabase } from './supabase.js'

export type OrigemLeitura = 'canal' | 'bot'

// Registra um evento de leitura de forma "fire-and-forget":
// tracking nunca deve travar nem atrasar a entrega do conto ao usuário.
export function registrarLeituraEvento(
  userId: number,
  postId: string,
  pagina: number,
  origem: OrigemLeitura,
  premiumBloqueado = false
): void {
  void supabase
    .from('leituras')
    .insert({
      user_id: userId,
      post_id: postId,
      pagina,
      origem,
      premium_bloqueado: premiumBloqueado,
    })
    .then(({ error }) => {
      if (error) console.error('Erro ao registrar leitura:', error.message)
    })
}
