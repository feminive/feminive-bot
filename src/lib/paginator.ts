const CHUNK_SIZE = 3800

export function paginarTexto(texto: string): string[] {
  const paragrafos = texto.split(/\n+/)
  const paginas: string[] = []
  let pagina = ''

  for (const paragrafo of paragrafos) {
    const linha = paragrafo.trim()
    if (!linha) continue

    if ((pagina + '\n\n' + linha).length > CHUNK_SIZE) {
      if (pagina) paginas.push(pagina.trim())
      pagina = linha
    } else {
      pagina = pagina ? pagina + '\n\n' + linha : linha
    }
  }

  if (pagina.trim()) paginas.push(pagina.trim())
  return paginas.length ? paginas : ['(sem conteúdo)']
}
