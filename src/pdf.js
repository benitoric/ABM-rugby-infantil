// Generador de PDF mínimo, sin dependencias.
//
// Alcanza para los reportes de la app: texto, rectángulos y líneas sobre
// hojas A4. Usa las fuentes Helvetica que todo lector de PDF ya trae, así que
// no hay que incrustar ninguna: el archivo pesa unos pocos KB y se genera en
// el celular sin bajar nada. Es la misma decisión que la placa del día de
// partido, que se dibuja a mano en un canvas en vez de traer una librería.
//
// Sistema de coordenadas: el PDF mide desde abajo a la izquierda, pero acá
// todo se pide desde arriba (que es como se piensa una hoja) y la conversión
// queda adentro.

export const A4 = { ancho: 595.28, alto: 841.89 }

// Anchos de Helvetica (unidades de 1/1000 del cuerpo), códigos 32 a 126.
// Salen de las métricas AFM estándar; los acentuados miden igual que su letra
// base, así que para medirlos se les saca el acento.
const ANCHOS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const ANCHOS_NEGRITA = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

// Caracteres tipográficos que no existen en Latin-1 pero sí en WinAnsi (o que
// conviene reemplazar por su equivalente simple)
const EQUIVALENTES = {
  '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94',
  '–': '\x96', '—': '\x97', '…': '\x85', '•': '\x95',
  '€': '\x80', '−': '-', ' ': ' ',
  // Primas: los minutos se escriben 8′, que en WinAnsi no existe
  '′': "'", '″': '"',
}

// Texto listo para el PDF: WinAnsi, sin caracteres que el lector no entienda
function aWinAnsi(texto) {
  let res = ''
  for (const c of String(texto ?? '')) {
    if (EQUIVALENTES[c]) res += EQUIVALENTES[c]
    else if (c.charCodeAt(0) < 256) res += c
    else {
      // Último recurso: sacarle el acento; si tampoco entra, va un signo de
      // pregunta, que es preferible a romper el archivo
      const plano = c.normalize('NFD').replace(/[̀-ͯ]/g, '')
      res += plano.charCodeAt(0) < 256 ? plano : '?'
    }
  }
  return res
}

// Ancho de un texto en puntos, para centrar, alinear a la derecha y cortar
// párrafos en líneas
export function anchoTexto(texto, tam, negrita = false) {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS
  let total = 0
  for (const c of aWinAnsi(texto)) {
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '')[0] || c
    const cod = base.charCodeAt(0)
    total += cod >= 32 && cod <= 126 ? tabla[cod - 32] : 556
  }
  return (total * tam) / 1000
}

// Corta un párrafo en líneas que entren en `ancho`
export function partirTexto(texto, ancho, tam, negrita = false) {
  const lineas = []
  for (const parrafo of String(texto ?? '').split('\n')) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (actual && anchoTexto(prueba, tam, negrita) > ancho) {
        lineas.push(actual)
        actual = palabra
      } else {
        actual = prueba
      }
    }
    lineas.push(actual)
  }
  return lineas
}

const escapar = (s) => aWinAnsi(s).replace(/([\\()])/g, '\\$1')
const num = (n) => (Math.round(n * 100) / 100).toString()
const color = ([r, g, b]) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`

export function nuevoPDF({ titulo = '', autor = '' } = {}) {
  const paginas = []
  let actual = null

  function nuevaPagina() {
    actual = []
    paginas.push(actual)
    return api
  }

  const api = {
    ancho: A4.ancho,
    alto: A4.alto,
    nuevaPagina,
    get paginas() { return paginas.length },

    // Vuelve a una hoja ya escrita para dibujar encima. Sirve para el pie de
    // página, que recién se puede numerar cuando el documento está terminado
    // y se sabe cuántas hojas son.
    enPagina(indice, dibujar) {
      const previa = actual
      actual = paginas[indice]
      try { dibujar() } finally { actual = previa }
      return api
    },

    // `y` se mide desde el borde de arriba, igual que se lee una hoja
    texto(txt, x, y, opciones = {}) {
      const { tam = 10, negrita = false, color: c = [0, 0, 0], alinear = 'izq' } = opciones
      const t = String(txt ?? '')
      if (!t) return api
      let px = x
      if (alinear === 'der') px = x - anchoTexto(t, tam, negrita)
      else if (alinear === 'centro') px = x - anchoTexto(t, tam, negrita) / 2
      actual.push(
        `BT ${color(c)} rg /${negrita ? 'F2' : 'F1'} ${num(tam)} Tf ` +
        `${num(px)} ${num(A4.alto - y - tam * 0.8)} Td (${escapar(t)}) Tj ET`)
      return api
    },

    rect(x, y, ancho, alto, c = [0, 0, 0]) {
      if (ancho <= 0 || alto <= 0) return api
      actual.push(`${color(c)} rg ${num(x)} ${num(A4.alto - y - alto)} ${num(ancho)} ${num(alto)} re f`)
      return api
    },

    linea(x1, y1, x2, y2, c = [0, 0, 0], grosor = 0.7) {
      actual.push(
        `${color(c)} RG ${num(grosor)} w ${num(x1)} ${num(A4.alto - y1)} m ` +
        `${num(x2)} ${num(A4.alto - y2)} l S`)
      return api
    },

    // Arma el archivo: objetos, tabla de referencias cruzadas y trailer
    bytes() {
      const partes = []
      const offsets = []
      let largo = 0
      const agregar = (texto) => {
        const b = new Uint8Array(texto.length)
        for (let i = 0; i < texto.length; i++) b[i] = texto.charCodeAt(i) & 0xff
        partes.push(b)
        largo += b.length
      }
      const objeto = (id, cuerpo) => {
        offsets[id] = largo
        agregar(`${id} 0 obj\n${cuerpo}\nendobj\n`)
      }

      // 1 catálogo · 2 páginas · 3 y 4 fuentes · 5 metadatos
      const idPagina = (i) => 6 + i * 2
      const idContenido = (i) => 7 + i * 2
      const total = 5 + paginas.length * 2

      agregar('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
      objeto(1, '<< /Type /Catalog /Pages 2 0 R >>')
      objeto(2, `<< /Type /Pages /Count ${paginas.length} /Kids [${
        paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] >>`)
      objeto(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
      objeto(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
      objeto(5, `<< /Title (${escapar(titulo)}) /Author (${escapar(autor)}) /Producer (Rugby M12) >>`)

      paginas.forEach((ordenes, i) => {
        objeto(idPagina(i),
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(A4.ancho)} ${num(A4.alto)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido(i)} 0 R >>`)
        const flujo = ordenes.join('\n')
        objeto(idContenido(i), `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`)
      })

      const inicioXref = largo
      let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`
      for (let id = 1; id <= total; id++) {
        xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
      }
      agregar(xref)
      agregar(`trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`)

      const salida = new Uint8Array(largo)
      let pos = 0
      for (const p of partes) { salida.set(p, pos); pos += p.length }
      return salida
    },

    blob() {
      return new Blob([api.bytes()], { type: 'application/pdf' })
    },
  }

  // El documento nace con su primera hoja lista para escribir
  nuevaPagina()
  return api
}

// Compartir por WhatsApp y demás cuando el celular lo permite; si no, se baja
// el archivo. Mismo camino que la placa del día de partido.
export async function compartirArchivo(blob, nombre, texto) {
  const archivo = new File([blob], nombre, { type: blob.type })
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], text: texto })
      return 'compartido'
    } catch (e) {
      // Cancelado por el usuario: no hay que descargar nada a sus espaldas
      if (e?.name === 'AbortError') return 'cancelado'
    }
  }
  descargarArchivo(blob, nombre)
  return 'descargado'
}

export function descargarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
