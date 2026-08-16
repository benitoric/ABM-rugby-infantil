// Reporte en PDF de la estadística de trabajo físico.
//
// Arma el documento con el generador propio (src/pdf.js) a partir del mismo
// resumen que muestra la pantalla, así el papel y la app nunca discrepan.

import { fechaCorta } from './helpers.js'
import { nuevoPDF, partirTexto } from './pdf.js'
import { lineaDeSesion } from './estadisticaFisica.js'
import { intensidad, INTENSIDADES, MINUTOS_BLOQUE } from './trabajoFisico.js'

// Colores institucionales, los mismos de la app
const AZUL = [26, 74, 158]
const DORADO = [255, 210, 0]
const TEXTO = [28, 32, 40]
const SUAVE = [91, 98, 112]
const BORDE = [221, 225, 234]
const COLOR_INTENSIDAD = { baja: [22, 163, 74], media: [217, 119, 6], alta: [220, 38, 38] }

const M = 40 // margen lateral
const PIE = 60 // alto reservado para el pie de página

export function generarReportePDF({ resumen, desde, hasta, modalidad, secciones, generadoPor }) {
  const incluye = (s) => secciones.includes(s)
  const doc = nuevoPDF({
    titulo: `Trabajo físico ${desde} a ${hasta}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  const anchoUtil = doc.ancho - M * 2
  let y = 0

  // --- encabezado de la primera hoja ---
  function portada() {
    doc.rect(0, 0, doc.ancho, 74, AZUL)
    doc.rect(0, 74, doc.ancho, 4, DORADO)
    doc.texto('Estadística de trabajo físico', M, 20, {
      tam: 17, negrita: true, color: [255, 255, 255],
    })
    doc.texto('Rugby M12 · Tucumán Lawn Tennis', M, 46, { tam: 9.5, color: [214, 226, 250] })
    const filtro = modalidad === 'rutina' ? 'solo rutina'
      : modalidad === 'extra' ? 'solo extras'
        : 'todos los entrenamientos'
    doc.texto(`${fechaCorta(desde)} a ${fechaCorta(hasta)} · ${filtro}`,
      doc.ancho - M, 46, { tam: 9.5, color: [214, 226, 250], alinear: 'der' })
    y = 100
  }

  // Salto de hoja cuando lo que viene no entra
  function espacio(alto) {
    if (y + alto <= doc.alto - PIE) return
    doc.nuevaPagina()
    y = 52
  }

  function titulo(texto) {
    espacio(46)
    doc.texto(texto, M, y, { tam: 12.5, negrita: true, color: AZUL })
    y += 17
    doc.linea(M, y, doc.ancho - M, y, DORADO, 1.6)
    y += 14
  }

  // Fila de números grandes, al estilo de las tarjetas de la app
  function tarjetas(items) {
    const alto = 46
    espacio(alto + 12)
    const ancho = (anchoUtil - 8 * (items.length - 1)) / items.length
    items.forEach((it, i) => {
      const x = M + i * (ancho + 8)
      doc.rect(x, y, ancho, alto, [244, 246, 250])
      doc.rect(x, y, 3, alto, AZUL)
      doc.texto(it.valor, x + ancho / 2, y + 8, { tam: 15, negrita: true, color: TEXTO, alinear: 'centro' })
      doc.texto(it.etiqueta, x + ancho / 2, y + 29, { tam: 7.5, color: SUAVE, alinear: 'centro' })
    })
    y += alto + 16
  }

  // Barra con su etiqueta a la izquierda y el dato a la derecha
  function barra({ etiqueta, valor, detalle, proporcion, color }) {
    espacio(30)
    doc.texto(etiqueta, M, y, { tam: 9.5, color: TEXTO })
    doc.texto(valor, doc.ancho - M, y, { tam: 9.5, negrita: true, color: TEXTO, alinear: 'der' })
    y += 13
    doc.rect(M, y, anchoUtil, 7, [237, 240, 246])
    doc.rect(M, y, Math.max(anchoUtil * proporcion, proporcion > 0 ? 2 : 0), 7, color)
    if (detalle) doc.texto(detalle, M, y + 10, { tam: 7.5, color: SUAVE })
    y += detalle ? 22 : 15
  }

  portada()

  if (incluye('resumen')) {
    titulo('Resumen del período')
    tarjetas([
      { valor: String(resumen.conPlanilla), etiqueta: 'SESIONES CON PLANILLA' },
      { valor: `${resumen.cobertura}%`, etiqueta: 'DE LOS ENTRENAMIENTOS' },
      { valor: `${resumen.minutosTotales}′`, etiqueta: 'MINUTOS TOTALES' },
      { valor: `${resumen.promedioPorSesion}′`, etiqueta: 'PROMEDIO POR SESIÓN' },
    ])
    const frases = [
      `Se registraron ${resumen.conPlanilla} de ${resumen.entrenamientos} entrenamientos del período.`,
      resumen.sinPlanilla
        ? `Quedaron ${resumen.sinPlanilla} sin planilla cargada: esos días no cuentan en los minutos.`
        : 'Todos los entrenamientos del período tienen su planilla cargada.',
      `Se trabajaron ${resumen.variablesDistintas} variables distintas, con un promedio de ` +
      `${resumen.promedioPorSesion} minutos por sesión sobre los ${MINUTOS_BLOQUE} de referencia.`,
    ]
    for (const f of frases) {
      espacio(16)
      doc.texto(`•  ${f}`, M, y, { tam: 9.5, color: TEXTO })
      y += 14
    }
    y += 8
  }

  if (incluye('variables') && resumen.porVariable.length) {
    titulo('Reparto por variable')
    const tope = resumen.porVariable[0].minutos || 1
    for (const v of resumen.porVariable) {
      const inten = intensidad(v.intensidad)
      barra({
        etiqueta: v.label,
        valor: `${v.minutos}′ · ${v.pct}%`,
        detalle: `${v.sesiones} ${v.sesiones === 1 ? 'sesión' : 'sesiones'}` +
          (inten ? ` · intensidad ${inten.label.toLowerCase()} la mayoría de las veces` : ''),
        proporcion: v.minutos / tope,
        color: inten ? COLOR_INTENSIDAD[inten.value] : AZUL,
      })
    }
    y += 6
  }

  if (incluye('grupos') && resumen.porGrupo.length) {
    titulo('Reparto por grupo')
    for (const g of resumen.porGrupo) {
      barra({
        etiqueta: g.label,
        valor: `${g.minutos}′ · ${g.pct}%`,
        proporcion: resumen.minutosTotales ? g.minutos / resumen.minutosTotales : 0,
        color: AZUL,
      })
    }
    y += 6
  }

  if (incluye('intensidad')) {
    titulo('Intensidad y carga')
    doc.texto('Minutos trabajados según la intensidad de cada variable', M, y, { tam: 9, color: SUAVE })
    y += 16
    for (const i of INTENSIDADES) {
      const min = resumen.minutosPorIntensidad[i.value] || 0
      barra({
        etiqueta: `Intensidad ${i.label.toLowerCase()}`,
        valor: `${min}′`,
        proporcion: resumen.minutosTotales ? min / resumen.minutosTotales : 0,
        color: COLOR_INTENSIDAD[i.value],
      })
    }
    const sinMarcar = resumen.minutosPorIntensidad.sin || 0
    if (sinMarcar) {
      espacio(16)
      doc.texto(`${sinMarcar}′ se cargaron sin marcarles intensidad.`, M, y, { tam: 8.5, color: SUAVE })
      y += 16
    }
    espacio(30)
    y += 4
    doc.texto('Carga general declarada por sesión', M, y, { tam: 9, color: SUAVE })
    y += 16
    const carga = resumen.porCarga
      .map((c) => `${c.label}: ${c.sesiones}`)
      .concat(resumen.sinCarga ? [`Sin declarar: ${resumen.sinCarga}`] : [])
      .join('   ·   ')
    espacio(16)
    doc.texto(carga, M, y, { tam: 9.5, color: TEXTO })
    y += 22
  }

  if (incluye('sesiones')) {
    titulo('Detalle de sesiones')
    for (const s of resumen.sesiones) {
      const lineas = partirTexto(lineaDeSesion(s), anchoUtil, 8.5)
      const obs = s.observaciones ? partirTexto(`Obs.: ${s.observaciones}`, anchoUtil, 8.5) : []
      espacio(20 + lineas.length * 11 + obs.length * 11)
      const carga = intensidad(s.carga)
      doc.texto(fechaCorta(s.fecha), M, y, { tam: 9.5, negrita: true, color: TEXTO })
      if (s.modalidad) {
        doc.texto(s.modalidad === 'rutina' ? 'Rutina' : 'Extra', M + 58, y, { tam: 8, color: SUAVE })
      }
      if (carga) {
        doc.texto(`Carga ${carga.label.toLowerCase()}`, doc.ancho - M, y,
          { tam: 8.5, negrita: true, color: COLOR_INTENSIDAD[carga.value], alinear: 'der' })
      }
      y += 13
      for (const l of lineas) {
        doc.texto(l, M, y, { tam: 8.5, color: s.variables ? TEXTO : SUAVE })
        y += 11
      }
      for (const l of obs) {
        doc.texto(l, M, y, { tam: 8.5, color: SUAVE })
        y += 11
      }
      y += 4
      doc.linea(M, y, doc.ancho - M, y, BORDE, 0.5)
      y += 10
    }
  }

  pieDePagina(doc, generadoPor)
  return doc
}

// Numeración y sello al pie de cada hoja, al final para saber cuántas son
function pieDePagina(doc, generadoPor) {
  const hoy = fechaCorta(new Date().toISOString().slice(0, 10))
  const total = doc.paginas
  for (let i = 0; i < total; i++) {
    doc.enPagina(i, () => {
      doc.linea(M, doc.alto - 42, doc.ancho - M, doc.alto - 42, BORDE, 0.5)
      doc.texto(`Rugby M12 · Tucumán Lawn Tennis · generado el ${hoy}${generadoPor ? ` por ${generadoPor}` : ''}`,
        M, doc.alto - 36, { tam: 7.5, color: SUAVE })
      doc.texto(`${i + 1} de ${total}`, doc.ancho - M, doc.alto - 36,
        { tam: 7.5, color: SUAVE, alinear: 'der' })
    })
  }
}

export function nombreDelReporte(desde, hasta) {
  return `trabajo-fisico-${desde}-a-${hasta}.pdf`
}
