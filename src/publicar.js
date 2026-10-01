const fs = require("node:fs/promises")
const path = require("node:path")
const { PassThrough, Readable } = require("node:stream")
const ftp = require("basic-ftp")

const ARCHIVO = "analisis.json"
const CARPETA_LOCAL = path.resolve(__dirname, "..", "salida")
const HTACCESS = path.resolve(__dirname, "..", "publico", ".htaccess")

const usaFtp = () => Boolean(process.env.FTP_SERVIDOR)

const conectar = async () => {
  const cliente = new ftp.Client(60000)
  await cliente.access({
    host: process.env.FTP_SERVIDOR,
    port: Number(process.env.FTP_PUERTO || 21),
    user: process.env.FTP_USUARIO,
    password: process.env.FTP_CLAVE,
    // cPanel acepta FTP con TLS explícito; FTP_TLS=false solo si el hosting no lo soporta.
    secure: (process.env.FTP_TLS ?? "true").toLowerCase() !== "false",
    // En hosting compartido el certificado suele ser del servidor (p. ej. *.hostingX.com) y no del dominio:
    // conviene usar ese nombre en FTP_SERVIDOR. FTP_TLS_VERIFICAR=false solo como último recurso.
    secureOptions: { rejectUnauthorized: (process.env.FTP_TLS_VERIFICAR ?? "true").toLowerCase() !== "false" },
  })
  if (process.env.FTP_CARPETA) await cliente.ensureDir(process.env.FTP_CARPETA)
  return cliente
}

const leerJson = (texto) => {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

// La publicación anterior se usa para conservar la fecha del último cambio real y como control de seguridad.
const leerAnterior = async () => {
  if (!usaFtp()) {
    return leerJson(await fs.readFile(path.join(CARPETA_LOCAL, ARCHIVO), "utf8").catch(() => ""))
  }
  const cliente = await conectar()
  try {
    const partes = []
    const destino = new PassThrough()
    destino.on("data", (parte) => partes.push(parte))
    await cliente.downloadTo(destino, ARCHIVO)
    return leerJson(Buffer.concat(partes).toString("utf8"))
  } catch {
    return null
  } finally {
    cliente.close()
  }
}

// Se sube con nombre temporal y se renombra, para que nadie lea un archivo a medio subir.
const subirAtomico = async (cliente, contenido, nombre) => {
  const temporal = `${nombre}.subiendo`
  await cliente.uploadFrom(Readable.from([contenido]), temporal)
  try {
    await cliente.rename(temporal, nombre)
  } catch {
    // Algunos servidores FTP no renombran sobre un archivo existente.
    await cliente.remove(nombre).catch(() => undefined)
    await cliente.rename(temporal, nombre)
  }
}

const publicar = async (catalogo) => {
  const contenido = Buffer.from(JSON.stringify(catalogo), "utf8")
  const htaccess = await fs.readFile(HTACCESS)

  if (!usaFtp()) {
    await fs.mkdir(CARPETA_LOCAL, { recursive: true })
    await fs.writeFile(path.join(CARPETA_LOCAL, ARCHIVO), contenido)
    await fs.writeFile(path.join(CARPETA_LOCAL, ".htaccess"), htaccess)
    return { destino: CARPETA_LOCAL, bytes: contenido.length }
  }

  const cliente = await conectar()
  try {
    await subirAtomico(cliente, contenido, ARCHIVO)
    await subirAtomico(cliente, htaccess, ".htaccess")
    return { destino: `ftp://${process.env.FTP_SERVIDOR}/${process.env.FTP_CARPETA || ""}`, bytes: contenido.length }
  } finally {
    cliente.close()
  }
}

module.exports = { leerAnterior, publicar }
