# Datos del catálogo de análisis

Este documento describe los datos que se publican para mostrar el menú de análisis en la web de
Díaz Gill. El diseño y la forma de mostrarlos quedan a criterio de la web; acá está qué hay disponible
y cómo leerlo.

## Dónde están

```
https://diazgill.com.py/analisis/analisis.json
```

- Es un único archivo JSON con todos los análisis (unos 1400, 164 KB comprimido).
- Se actualiza solo cada 15 minutos aproximadamente, a partir del sistema del laboratorio (Shift).
- Se puede leer desde cualquier sitio (tiene CORS abierto), así que sirve también en entornos de prueba.
- El navegador lo guarda hasta 5 minutos en caché.

**Hay que leerlo siempre desde esa dirección**, no copiar los datos dentro de la web: así la web muestra
los cambios del laboratorio sin que nadie tenga que tocarla.

```js
const respuesta = await fetch("https://diazgill.com.py/analisis/analisis.json")
const catalogo = await respuesta.json()
```

## Estructura

```json
{
  "version": 1,
  "actualizado_en": "2026-10-01T14:38:41.678Z",
  "verificado_en": "2026-10-01T14:53:12.004Z",
  "huella": "5f3a…",
  "total": 1436,
  "examenes": [
    {
      "id": 318,
      "sigla": "GOT",
      "nombre": "ASPARTATO AMINOTRANSFERASA (AST/GOT), Sangre",
      "sinonimos": ["AST", "Aspartato aminotransferasa", "TGO", "Transaminasa glutamico oxalacetica"],
      "inicial": "A",
      "ayuno": "6 hora(s)",
      "plazo": "10 hora(s)",
      "muestra": ["Suero"],
      "instrucciones": [
        "Indicar edad y clínica del paciente.",
        "Indicar si recibe algún tipo de medicación"
      ],
      "informacion": [
        { "titulo": "Utilidad Clínica", "texto": "En enfermedades que afectan estos tejidos…" }
      ]
    }
  ]
}
```

### Datos generales

| Campo | Qué es |
| --- | --- |
| `version` | Versión del formato. Si alguna vez cambia la estructura, este número sube. |
| `actualizado_en` | Fecha y hora (UTC, formato ISO) del último cambio real en los análisis. Es la que conviene mostrar como "Información actualizada el …". |
| `verificado_en` | Última vez que se revisó el sistema del laboratorio, haya o no cambios. |
| `huella` | Código que cambia solo cuando cambian los datos. Útil si se guarda una copia en el navegador. |
| `total` | Cantidad de análisis. |
| `examenes` | La lista, ordenada alfabéticamente por `nombre`. |

### Cada análisis

| Campo | Tipo | Qué es | Puede venir vacío |
| --- | --- | --- | --- |
| `id` | número | Identificador del análisis. No cambia; sirve para enlaces (`/analisis?id=318`). | No |
| `sigla` | texto | Código corto del laboratorio (`GOT`, `HEM`). | No |
| `nombre` | texto | Nombre oficial, tal como figura en el laboratorio. Suele venir en mayúsculas e incluir el tipo de muestra (`…, Sangre`, `…, Orina 24h`). | No |
| `sinonimos` | lista de textos | Otros nombres con los que se conoce el análisis (`AST`, `TGO`). Importante para la búsqueda. | Sí (`[]`) |
| `inicial` | texto | Letra A–Z para un índice alfabético. `#` si el nombre empieza con número o símbolo. | No |
| `ayuno` | texto | Horas de ayuno, por ejemplo `6 hora(s)`. | Sí (`""`) |
| `plazo` | texto | Plazo de entrega del resultado, por ejemplo `10 hora(s)` o `15 día(s) hábil(es)`. | Sí (`""`) |
| `muestra` | lista de textos | Tipo de muestra (`Suero`, `Orina 24h`). | Sí (`[]`) |
| `instrucciones` | lista de textos | Preparación e indicaciones para el paciente. Cada elemento es un párrafo o línea. | Sí (`[]`) |
| `informacion` | lista de `{ titulo, texto }` | Información adicional, por ejemplo "Utilidad Clínica". `texto` puede tener saltos de línea (`\n`). `titulo` puede venir vacío. | Sí (`[]`) |

Todos los textos son **texto plano** (sin HTML). Al mostrarlos conviene respetar los saltos de línea
(`white-space: pre-line` en CSS) y no insertarlos como HTML.

## Recomendaciones

- **Búsqueda:** buscar en `sigla`, `nombre` y `sinonimos`, ignorando mayúsculas y tildes. Muchas personas
  buscan "glucemia", "TGO" o "hemograma", que pueden estar solo en los sinónimos.
  ```js
  const normalizar = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const coincide = (examen, busqueda) =>
    normalizar([examen.sigla, examen.nombre, ...examen.sinonimos].join(" ")).includes(normalizar(busqueda))
  ```
- **Campos vacíos:** si un análisis no trae `ayuno`, `instrucciones`, etc., es porque el laboratorio no
  cargó ese dato, no porque no haga falta preparación. Conviene no mostrar el bloque, o mostrar un texto
  neutro como "Consultá las indicaciones con nuestro equipo", en lugar de afirmar "sin preparación".
- **Ayuno "0 hora(s)":** algunos análisis lo indican así; equivale a que no se requiere ayuno.
- **Fechas:** `actualizado_en` está en UTC. Para Paraguay:
  `new Date(catalogo.actualizado_en).toLocaleString("es-PY", { dateStyle: "long", timeStyle: "short" })`.
- **Si el archivo no carga:** mostrar un mensaje del tipo "No pudimos cargar el listado de análisis" con un
  contacto, en lugar de dejar la sección vacía.

## Ejemplo

`ejemplo/index.html` en este repositorio es una página de prueba mínima (buscador, índice A–Z y ficha) que
lee el archivo publicado. Sirve como referencia de uso de los datos, no como diseño.
