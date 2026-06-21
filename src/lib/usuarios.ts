import { supabase } from './supabase.js'

// Cache em memória para não martelar o banco a cada mensagem:
// só faz upsert na primeira vez que vemos o usuário neste processo.
const conhecidos = new Set<number>()

// Registra (ou atualiza) um usuário de forma "fire-and-forget".
// Nunca deve travar nem atrasar a resposta ao usuário.
export function registrarUsuario(
  userId: number,
  username?: string,
  firstName?: string
): void {
  if (conhecidos.has(userId)) return
  conhecidos.add(userId)

  void supabase
    .from('usuarios')
    .upsert(
      {
        user_id: userId,
        username: username ?? null,
        first_name: firstName ?? null,
        ativo: true, // se voltou a falar, está ativo de novo
        visto_em: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .then(({ error }) => {
      if (error) console.error('Erro ao registrar usuário:', error.message)
    })
}
