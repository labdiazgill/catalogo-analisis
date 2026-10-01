const { armarCatalogo } = require("./catalogo")
const { extraerDelPortal } = require("./extraer")
const { leerAnterior, publicar } = require("./publicar")

const ejecutar = async () => {
  const inicio = Date.now()
  const [crudos, anterior] = await Promise.all([extraerDelPortal(), leerAnterior()])
  const { catalogo, cambio } = armarCatalogo(crudos, anterior)
  const resultado = await publicar(catalogo)
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
  console.log(
    `${catalogo.total} exámenes publicados en ${resultado.destino} (${(resultado.bytes / 1024).toFixed(0)} KB, ${segundos} s). ` +
      (cambio ? "Hubo cambios respecto de la publicación anterior." : "Sin cambios respecto de la publicación anterior."),
  )
}

ejecutar().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
