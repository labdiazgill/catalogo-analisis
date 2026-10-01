// Conversión del HTML que devuelve Shift a texto plano, para que la web no tenga que interpretar HTML
// de un sistema externo.

const normalizar = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

const ENTIDADES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

const decodificarEntidades = (texto) =>
  texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entidad) => {
    if (entidad[0] === "#") {
      const codigo = entidad[1].toLowerCase() === "x" ? parseInt(entidad.slice(2), 16) : Number(entidad.slice(1))
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : original
    }
    return ENTIDADES[entidad.toLowerCase()] ?? original
  })

const htmlALineas = (html) =>
  decodificarEntidades(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((linea) => linea.replace(/\s+/g, " ").trim())
    .filter(Boolean)

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Shift antepone a cada bloque la sigla del examen ("- (GOT)") y la repite en la muestra ("- Suero (GOT)").
// En la ficha de un solo examen eso no aporta, así que se quita.
const lineasDelExamen = (html, sigla) => {
  const marca = new RegExp(`\\s*\\(${escaparRegex(sigla)}\\)$`, "i")
  return htmlALineas(html)
    .filter((linea) => !/^-\s*\([^)]*\)$/.test(linea))
    .map((linea) => linea.replace(/^-\s*/, "").replace(marca, "").trim())
    .filter((linea) => linea && linea !== "-")
}

const textoCorto = (html) => htmlALineas(html).join(" ").replace(/\.$/, "")

// "Información libre": bloques título + contenido (por ejemplo "GOT - Utilidad Clínica").
const informacionLibre = (html, sigla) => {
  const bloques = []
  const patron = /<div class=['"]zenLabel['"]>([\s\S]*?)<\/div>\s*<div class=['"]zenLabel corFonteSecundaria['"]>([\s\S]*?)<\/div>/gi
  const prefijo = new RegExp(`^${escaparRegex(sigla)}\\s*-\\s*`, "i")
  for (const [, titulo, contenido] of String(html || "").matchAll(patron)) {
    const texto = htmlALineas(contenido).join("\n")
    if (texto) bloques.push({ titulo: htmlALineas(titulo).join(" ").replace(prefijo, ""), texto })
  }
  if (!bloques.length) {
    const texto = htmlALineas(html).join("\n")
    if (texto) bloques.push({ titulo: "", texto })
  }
  return bloques
}

// "ACOND -  Acondroplasia Gen FGFR3 exon 10" -> { sigla: "ACOND", nombre: "Acondroplasia Gen FGFR3 exon 10" }
const separarTitulo = (texto) => {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim()
  const posicion = limpio.indexOf(" - ")
  if (posicion < 0) return { sigla: "", nombre: limpio }
  return { sigla: limpio.slice(0, posicion).trim(), nombre: limpio.slice(posicion + 3).trim() }
}

module.exports = { informacionLibre, lineasDelExamen, normalizar, separarTitulo, textoCorto }
