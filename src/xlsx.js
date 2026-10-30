// Generador mínimo de planillas Excel (.xlsx), sin dependencias.
//
// Un .xlsx es un zip con unos pocos XML. Acá se arma el zip sin comprimir
// (método "store"), que es válido y alcanza para planillas de miles de filas,
// y se escriben solo las partes obligatorias más un estilo para el
// encabezado. Los textos van "inline" en cada celda (sin tabla de textos
// compartidos) y los números como números, así Excel los suma y filtra sin
// convertir nada, sea cual sea el idioma de la máquina que abre el archivo.
//
// Uso: generarXLSX([{ nombre: 'Hoja 1', columnas: [...], filas: [[...], ...] }])
// devuelve un Blob. Cada columna es { titulo, ancho } (ancho en caracteres) y
// cada celda un número, un texto, null o { fecha: 'YYYY-MM-DD' } para que
// Excel la trate como fecha de verdad.

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export function generarXLSX(hojas) {
  const partes = [
    ['[Content_Types].xml', contentTypes(hojas)],
    ['_rels/.rels', RELS],
    ['xl/workbook.xml', workbook(hojas)],
    ['xl/_rels/workbook.xml.rels', workbookRels(hojas)],
    ['xl/styles.xml', STYLES],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hoja(h)]),
  ]
  return new Blob([zip(partes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ---------- las partes del libro ----------

function contentTypes(hojas) {
  return XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    hojas.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>'
}

const RELS = XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

function workbook(hojas) {
  return XML_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    hojas.map((h, i) => `<sheet name="${esc(nombreHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>'
}

function workbookRels(hojas) {
  return XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    hojas.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'
}

// Estilos: 0 normal, 1 encabezado en negrita, 2 fecha (dd/mm/yyyy)
const STYLES = XML_HEAD +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

function hoja({ columnas, filas }) {
  const ultima = ref(columnas.length - 1, filas.length)
  let xml = XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${ultima}"/>` +
    // Encabezado congelado: al bajar por la planilla siguen viéndose los títulos
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' +
    columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 12}" customWidth="1"/>`).join('') +
    '</cols><sheetData>'
  xml += fila(1, columnas.map((c) => c.titulo), 1)
  filas.forEach((f, i) => { xml += fila(i + 2, f) })
  xml += '</sheetData>' +
    `<autoFilter ref="A1:${ultima}"/>` +
    '</worksheet>'
  return xml
}

function fila(n, celdas, estilo = 0) {
  let xml = `<row r="${n}">`
  celdas.forEach((v, i) => {
    if (v == null || v === '') return
    const r = ref(i, n - 1)
    if (typeof v === 'number') {
      if (Number.isFinite(v)) xml += `<c r="${r}" s="${estilo}"><v>${v}</v></c>`
    } else if (typeof v === 'object' && v.fecha) {
      const serial = serialExcel(v.fecha)
      if (serial != null) xml += `<c r="${r}" s="2"><v>${serial}</v></c>`
    } else {
      xml += `<c r="${r}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
    }
  })
  return xml + '</row>'
}

// Referencia de celda (columna 0 = A, fila 0 = 1)
function ref(col, filaCero) {
  let letras = ''
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) {
    letras = String.fromCharCode(65 + ((c - 1) % 26)) + letras
  }
  return `${letras}${filaCero + 1}`
}

// Días desde el 30/12/1899, que es como Excel guarda las fechas
function serialExcel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  const dias = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000
  return dias + 25569
}

// Excel limita el nombre de la hoja a 31 caracteres sin estos símbolos
function nombreHoja(nombre) {
  return String(nombre || 'Hoja').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // Caracteres de control que el XML no admite
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

// ---------- zip sin compresión ----------

function zip(partes) {
  const enc = new TextEncoder()
  const locales = []
  const centrales = []
  let offset = 0
  for (const [nombre, texto] of partes) {
    const nom = enc.encode(nombre)
    const datos = enc.encode(texto)
    const crc = crc32(datos)
    const local = new Uint8Array(30 + nom.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)      // versión necesaria
    dv.setUint16(6, 0x0800, true)  // nombres en UTF-8
    dv.setUint16(8, 0, true)       // store
    dv.setUint16(10, 0, true)      // hora
    dv.setUint16(12, 0x21, true)   // fecha (1/1/1980)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, datos.length, true)
    dv.setUint32(22, datos.length, true)
    dv.setUint16(26, nom.length, true)
    dv.setUint16(28, 0, true)
    local.set(nom, 30)
    locales.push(local, datos)

    const central = new Uint8Array(46 + nom.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, datos.length, true)
    cv.setUint32(24, datos.length, true)
    cv.setUint16(28, nom.length, true)
    cv.setUint32(42, offset, true)
    central.set(nom, 46)
    centrales.push(central)
    offset += local.length + datos.length
  }
  const tamCentral = centrales.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const fv = new DataView(fin.buffer)
  fv.setUint32(0, 0x06054b50, true)
  fv.setUint16(8, partes.length, true)
  fv.setUint16(10, partes.length, true)
  fv.setUint32(12, tamCentral, true)
  fv.setUint32(16, offset, true)
  return concatenar([...locales, ...centrales, fin])
}

function concatenar(trozos) {
  const total = trozos.reduce((s, t) => s + t.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const t of trozos) { out.set(t, pos); pos += t.length }
  return out
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = TABLA_CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
