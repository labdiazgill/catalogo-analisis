# Catálogo de análisis — Díaz Gill

Publica cada 15 minutos el catálogo de análisis (nombre, sinónimos, ayuno, plazo, muestra, instrucciones
para el paciente e información clínica) como un archivo JSON en el hosting de la web, para que la página
lo muestre.

```
Portal de Shift ──(GitHub Actions, cada 15 min)──> analisis.json ──(FTP)──> cPanel: /analisis/analisis.json ──> web
```

- **Origen:** el portal público de Shift (`resultados.diazgill.com.py`, consulta de exámenes). Se abre con
  Chrome sin ventana porque el portal no entrega la lista de exámenes sin un navegador real.
- **Destino:** `https://diazgill.com.py/analisis/analisis.json` (carpeta `public_html/analisis` del cPanel).
- **Para el diseñador:** el formato de los datos y cómo usarlos está en [DATOS.md](DATOS.md).

## Seguridad de la publicación

- Si Shift devuelve menos de la mitad de los exámenes publicados la vez anterior, no se publica nada.
- Si Shift falla, no se publica nada: la web sigue mostrando la última copia buena.
- El archivo se sube con un nombre temporal y se renombra, para que nadie lea un archivo a medio subir.
- Si una ejecución falla, GitHub envía un correo a quien administra el repositorio.

## Puesta en marcha

### 1. Cuenta FTP en cPanel

cPanel → **Cuentas de FTP** → crear cuenta:

- Usuario: `analisis`
- Directorio: `public_html/analisis`. Así la cuenta solo puede escribir en esa carpeta.
- Anotar el **servidor FTP** que muestra cPanel en *Configurar cliente FTP*. Conviene usar el nombre del
  servidor de hosting que figura ahí, porque el certificado TLS suele estar emitido para ese nombre.

### 2. Repositorio en GitHub

1. Crear un repositorio **público** (por ejemplo `diazgill/catalogo-analisis`). En repositorios públicos
   las ejecuciones son ilimitadas; en uno privado el plan gratuito no alcanza para correr cada 15 minutos.
   El repositorio solo contiene este código, no claves; los datos ya son públicos en el portal de Shift.
2. Subir esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Catálogo de análisis"
   git branch -M main
   git remote add origin https://github.com/<organizacion>/catalogo-analisis.git
   git push -u origin main
   ```
3. En el repositorio: **Settings → Secrets and variables → Actions**.
   - Pestaña **Secrets** (cifrados, nadie puede leerlos después):

     | Nombre | Valor |
     | --- | --- |
     | `FTP_SERVIDOR` | servidor FTP del paso 1 |
     | `FTP_USUARIO` | usuario completo, por ejemplo `analisis@diazgill.com.py` |
     | `FTP_CLAVE` | contraseña de la cuenta FTP |

   - Pestaña **Variables** (opcionales):

     | Nombre | Cuándo usarla |
     | --- | --- |
     | `FTP_PUERTO` | si el hosting no usa el 21 |
     | `FTP_CARPETA` | si la cuenta FTP no apunta directo a `public_html/analisis` |
     | `FTP_TLS` | `false` solo si el hosting no admite FTP con TLS |
     | `FTP_TLS_VERIFICAR` | `false` solo si falla el certificado y no hay otro nombre de servidor |

4. Pestaña **Actions** → *Publicar catálogo de análisis* → **Run workflow** para la primera publicación.
5. Abrir `https://diazgill.com.py/analisis/analisis.json` y comprobar que aparece el JSON.

Desde ahí corre sola cada 15 minutos. GitHub puede atrasar algunas ejecuciones en horas de mucha carga.

## Probar en una computadora

Requiere Node.js 20 o superior y Chrome (o `CHROME_PATH` con la ruta del navegador).

```bash
npm install
npm start
```

Sin las variables `FTP_*`, el archivo se guarda en `salida/analisis.json` en lugar de subirse.
Para ver los datos con una página de prueba, abrir `ejemplo/index.html` con un servidor local
(por ejemplo `npx serve .` y luego `http://localhost:3000/ejemplo/`).

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `src/extraer.js` | Abre el portal de Shift y obtiene exámenes, nombres oficiales, sinónimos e instrucciones |
| `src/texto.js` | Convierte el HTML de Shift a texto plano |
| `src/catalogo.js` | Arma el JSON publicado y aplica los controles de seguridad |
| `src/publicar.js` | Sube el JSON por FTP (o lo guarda en `salida/`) |
| `publico/.htaccess` | Se sube junto al JSON: permite leerlo desde cualquier sitio y activa la compresión |
| `.github/workflows/publicar.yml` | La tarea programada cada 15 minutos |
| `ejemplo/index.html` | Página de prueba que muestra los datos; no es el diseño final |
