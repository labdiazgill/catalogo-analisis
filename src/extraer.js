const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const { normalizar, separarTitulo } = require("./texto")

// El portal de Shift es una página InterSystems Zen. Las instrucciones de cada examen se podrían pedir por
// HTTP, pero la lista de exámenes exige el estado serializado de la página (con valores cifrados por
// sesión), que solo genera un navegador. Por eso se abre la página en Chrome sin ventana y se usan los
// mismos métodos que usa el portal.

const URL_PORTAL =
  process.env.PORTAL_URL ||
  "https://resultados.diazgill.com.py/shift/lis/diazgill/elis/s01.iu.interface.web.consulta.Procedimento.cls?config=&sigla="

const ESPERA_MS = 90000
const LOTE_INSTRUCCIONES = 50
// La lista de "seleccionados" muestra como máximo 100 filas por consulta.
const LOTE_NOMBRES = 50
const PASADAS_NOMBRES = 3

const RUTAS_NAVEGADOR = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

const rutaNavegador = () => {
  const ruta = process.env.CHROME_PATH || RUTAS_NAVEGADOR.find((candidata) => fs.existsSync(candidata))
  if (!ruta) throw new Error("No se encontró Chrome. Indica la ruta en la variable CHROME_PATH.")
  return ruta
}

const leerSeleccionados = async (pagina, lote) => {
  await pagina.evaluate((lista) => {
    const tabla = window.zenPage.getComponentById("listaProcedimentosSelecionados")
    tabla.getEnclosingDiv().innerHTML = ""
    window.zenPage.ProcedimentoSelecionado = lista.join(",")
    tabla.executeQuery()
  }, lote)
  await pagina.waitForFunction(
    () => window.zenPage.getComponentById("listaProcedimentosSelecionados").getEnclosingDiv().querySelector("table"),
    { timeout: ESPERA_MS },
  )
  return pagina.evaluate(() =>
    Array.from(
      window.zenPage.getComponentById("listaProcedimentosSelecionados").getEnclosingDiv().querySelectorAll("[id^=campoSelecionado_]"),
    ).map((nodo) => ({
      id: Number(nodo.id.slice("campoSelecionado_".length)),
      texto: (nodo.getAttribute("title") || nodo.textContent || "").trim(),
    })),
  )
}

// La lista de exámenes muestra cada sinónimo como una fila más ("GOT - AST", "GOT - TGO", …) sin indicar cuál
// es el nombre oficial. La lista de "seleccionados" sí lo muestra ("GOT - ASPARTATO AMINOTRANSFERASA
// (AST/GOT), Sangre"), así que se cargan los exámenes ahí por lotes. Los que falten se reintentan.
const nombresOficiales = async (pagina, ids) => {
  const oficiales = new Map()
  let pendientes = ids
  for (let pasada = 0; pasada < PASADAS_NOMBRES && pendientes.length; pasada += 1) {
    for (let inicio = 0; inicio < pendientes.length; inicio += LOTE_NOMBRES) {
      for (const titulo of await leerSeleccionados(pagina, pendientes.slice(inicio, inicio + LOTE_NOMBRES))) {
        const { sigla, nombre } = separarTitulo(titulo.texto)
        if (sigla && nombre) oficiales.set(titulo.id, { sigla, nombre })
      }
    }
    pendientes = pendientes.filter((id) => !oficiales.has(id))
  }
  await pagina.evaluate(() => {
    window.zenPage.ProcedimentoSelecionado = ""
  })
  return oficiales
}

const instrucciones = async (pagina, ids) => {
  const resultado = new Map()
  for (let inicio = 0; inicio < ids.length; inicio += LOTE_INSTRUCCIONES) {
    const detalles = await pagina.evaluate((lote) => {
      const texto = (valor) => (valor === undefined || valor === null ? "" : String(valor))
      return lote.map((id) => {
        try {
          const datos = window.zenPage.ConsultarInformacoes(String(id), window.zenPage.ConfiguracaoWeb, window.zenPage.SiglaWeb) || {}
          return {
            id,
            ayuno: texto(datos.ValorJejum),
            plazo: texto(datos.MaiorPrazo),
            material: texto(datos.Material),
            instPaciente: texto(datos.InstPaciente),
            infoLibre: texto(datos.CampoLivre),
          }
        } catch (excepcion) {
          return { id, error: String(excepcion?.message || excepcion) }
        }
      })
    }, ids.slice(inicio, inicio + LOTE_INSTRUCCIONES))

    for (const detalle of detalles) {
      if (detalle.error) throw new Error(`El portal falló al consultar el examen ${detalle.id}: ${detalle.error}`)
      resultado.set(detalle.id, detalle)
    }
  }
  return resultado
}

// Devuelve los exámenes con los valores tal como los entrega Shift (con HTML).
const extraerDelPortal = async () => {
  const perfil = await fs.promises.mkdtemp(path.join(os.tmpdir(), "analisis-shift-"))
  const navegador = await puppeteer.launch({
    executablePath: rutaNavegador(),
    headless: true,
    userDataDir: perfil,
    // Los runners Ubuntu de GitHub no permiten el sandbox de Chrome; solo se visita el portal propio.
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-extensions", ...(process.env.CI ? ["--no-sandbox"] : [])],
  })

  try {
    const pagina = await navegador.newPage()
    pagina.setDefaultTimeout(ESPERA_MS)
    // Zen muestra los errores del servidor con alert(); sin esto la página quedaría bloqueada.
    pagina.on("dialog", (dialogo) => dialogo.dismiss().catch(() => undefined))

    console.log(`Abriendo el portal de Shift: ${URL_PORTAL}`)
    await pagina.goto(URL_PORTAL, { waitUntil: "networkidle0", timeout: ESPERA_MS })
    await pagina.waitForFunction(
      () =>
        window.zenPage &&
        typeof window.zenPage.ConsultarInformacoes === "function" &&
        document.querySelectorAll("a[id^=campo_][onclick*=incluirProcedimento]").length > 1,
      { timeout: ESPERA_MS },
    )

    // Solo los enlaces que agregan un examen: la lista también tiene encabezados de grupo ("1", "7"…)
    // con el mismo id campo_N pero sin onclick, que no son exámenes.
    const filas = await pagina.evaluate(() =>
      Array.from(document.querySelectorAll("a[id^=campo_][onclick*=incluirProcedimento]")).map((enlace) => ({
        id: enlace.id.slice("campo_".length).trim(),
        texto: (enlace.getAttribute("title") || enlace.textContent || "").trim(),
      })),
    )

    const alternativos = new Map()
    for (const fila of filas) {
      const id = Number(fila.id)
      if (!Number.isInteger(id) || id <= 0 || !fila.texto) continue
      if (!alternativos.has(id)) alternativos.set(id, [])
      alternativos.get(id).push(separarTitulo(fila.texto).nombre)
    }

    const ids = [...alternativos.keys()]
    console.log(`Lista del portal: ${filas.length} filas, ${ids.length} exámenes. Leyendo nombres oficiales…`)
    const oficiales = await nombresOficiales(pagina, ids)
    console.log("Leyendo instrucciones…")
    const detalles = await instrucciones(pagina, ids)

    return ids.map((id) => {
      const oficial = oficiales.get(id)
      if (!oficial) throw new Error(`El portal no devolvió el nombre oficial del examen ${id}`)
      const sinonimos = [...new Set(alternativos.get(id))].filter(
        (nombre) => nombre && ![oficial.nombre, oficial.sigla].some((valor) => normalizar(valor) === normalizar(nombre)),
      )
      return { ...detalles.get(id), id, sigla: oficial.sigla, nombre: oficial.nombre, sinonimos }
    })
  } finally {
    await navegador.close().catch(() => undefined)
    await fs.promises.rm(perfil, { recursive: true, force: true }).catch(() => undefined)
  }
}

module.exports = { extraerDelPortal }
