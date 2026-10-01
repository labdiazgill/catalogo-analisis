const crypto = require("node:crypto")
const { informacionLibre, lineasDelExamen, normalizar, textoCorto } = require("./texto")

const VERSION_FORMATO = 1
// Si Shift devuelve muchos menos exámenes que la última publicación, se asume una falla y no se publica.
const MINIMO_RELATIVO = 0.5

const inicial = (nombre) => {
  const letra = normalizar(nombre).charAt(0).toUpperCase()
  return /^[A-Z]$/.test(letra) ? letra : "#"
}

// Solo lo que el portal público de Shift muestra al paciente.
const aExamen = (crudo) => ({
  id: crudo.id,
  sigla: crudo.sigla,
  nombre: crudo.nombre,
  sinonimos: crudo.sinonimos,
  inicial: inicial(crudo.nombre),
  ayuno: textoCorto(crudo.ayuno),
  plazo: textoCorto(crudo.plazo),
  muestra: lineasDelExamen(crudo.material, crudo.sigla),
  instrucciones: lineasDelExamen(crudo.instPaciente, crudo.sigla),
  informacion: informacionLibre(crudo.infoLibre, crudo.sigla),
})

const armarCatalogo = (crudos, anterior) => {
  if (anterior && crudos.length < anterior.total * MINIMO_RELATIVO) {
    throw new Error(
      `Shift devolvió ${crudos.length} exámenes y la última publicación tenía ${anterior.total}; no se publica para no vaciar la web.`,
    )
  }

  const examenes = crudos
    .map(aExamen)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }) || a.id - b.id)
  const huella = crypto.createHash("sha256").update(JSON.stringify(examenes)).digest("hex")
  const ahora = new Date().toISOString()
  const cambio = !anterior || anterior.huella !== huella

  return {
    cambio,
    catalogo: {
      version: VERSION_FORMATO,
      actualizado_en: cambio ? ahora : anterior.actualizado_en,
      verificado_en: ahora,
      huella,
      total: examenes.length,
      examenes,
    },
  }
}

module.exports = { armarCatalogo }
