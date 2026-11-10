// PDFs de la encuesta a los jugadores, con el generador propio (src/pdf.js):
//
// - El cuestionario (`generarCuestionarioPDF`): la encuesta tal cual la ven
//   los chicos, en papel, con casilleros para marcar. Sirve para mostrársela
//   al staff o a los padres antes de abrirla, o para tomarla en papel a un
//   chico que no tiene celular.
// - El reporte (`generarReporteEncuestaPDF`): los resultados de una encuesta
//   cerrada con su análisis (src/encuesta.js, analizarEncuesta). Lleva solo
//   números de conjunto: nada de nombres, tampoco el de los chicos que
//   pidieron hablar con alguien.

import { anchoTexto, nuevoPDF, partirTexto } from './pdf.js'
import { fechaCorta } from './helpers.js'
import {
  analizarEncuesta, bloquesDe, conOpciones, MINIMO_RESPUESTAS, opcionesDe, pedidoAyudaDe, textoEnLista,
} from './encuesta.js'

const AZUL = [26, 74, 158]
const DORADO = [255, 210, 0]
const TEXTO = [28, 32, 40]
const SUAVE = [91, 98, 112]
const BORDE = [221, 225, 234]
const FONDO = [244, 246, 250]
const VERDE = [22, 163, 74]
const VERDE_CLARO = [134, 239, 172]
const AMBAR = [217, 119, 6]
const ROJO = [220, 38, 38]
const ROJO_CLARO = [252, 165, 165]
const GRIS = [200, 200, 205]
const VIOLETA = [126, 34, 206]
const CELESTE = [214, 226, 250]
const ALERTA_FONDO = [254, 243, 199]
const ALERTA_TEXTO = [133, 77, 14]

const M = 40
const PIE = 60

const conComa = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d).replace('.', ','))
const colorFavorable = (v) => (v == null ? AZUL : v >= 75 ? VERDE : v >= 60 ? AMBAR : ROJO)

// Lo común a los dos documentos: márgenes, saltos de hoja, textos y pie
function documento({ titulo, subtitulo, derecha }) {
  const doc = nuevoPDF({ titulo, autor: 'Rugby M12 · Tucumán Lawn Tennis' })
  const ancho = doc.ancho - M * 2
  const h = { doc, ancho, y: 0 }

  doc.rect(0, 0, doc.ancho, 86, AZUL)
  doc.rect(0, 86, doc.ancho, 4, DORADO)
  doc.texto(titulo, M, 20, { tam: 18, negrita: true, color: [255, 255, 255] })
  doc.texto('Rugby M12 · Tucumán Lawn Tennis', M, 46, { tam: 10, color: CELESTE })
  if (subtitulo) doc.texto(subtitulo, M, 62, { tam: 10, negrita: true, color: [255, 255, 255] })
  if (derecha) doc.texto(derecha, doc.ancho - M, 62, { tam: 8.5, color: CELESTE, alinear: 'der' })
  h.y = 110

  h.espacio = (alto) => {
    if (h.y + alto <= doc.alto - PIE) return
    doc.nuevaPagina()
    h.y = 52
  }
  h.titulo = (texto, sub) => {
    if (h.y > doc.alto - PIE - 110) { doc.nuevaPagina(); h.y = 52 } else if (h.y > 120) h.y += 8
    doc.texto(texto, M, h.y, { tam: 13, negrita: true, color: AZUL })
    h.y += 17
    doc.linea(M, h.y, doc.ancho - M, h.y, DORADO, 1.6)
    h.y += 10
    if (sub) h.parrafo(sub, { tam: 8.5, color: SUAVE })
    h.y += 2
  }
  h.subtitulo = (texto) => {
    h.espacio(36)
    h.y += 4
    for (const l of partirTexto(texto, ancho, 10.5, true)) {
      doc.texto(l, M, h.y, { tam: 10.5, negrita: true, color: TEXTO })
      h.y += 14
    }
    h.y += 2
  }
  h.parrafo = (texto, { tam = 9, color = TEXTO, sangria = 0, negrita = false } = {}) => {
    for (const l of partirTexto(texto, ancho - sangria, tam, negrita)) {
      h.espacio(tam + 4)
      doc.texto(l, M + sangria, h.y, { tam, color, negrita })
      h.y += tam + 3
    }
    h.y += 3
  }
  h.vineta = (texto, { color = TEXTO, marca = '•' } = {}) => {
    const lineas = partirTexto(texto, ancho - 14, 9)
    h.espacio(lineas.length * 12 + 2)
    doc.texto(marca, M, h.y, { tam: 9, color })
    for (const l of lineas) {
      doc.texto(l, M + 14, h.y, { tam: 9, color })
      h.y += 12
    }
    h.y += 2
  }
  // Recuadro de color con renglones adentro (las alertas)
  h.recuadro = (renglones, { fondo = ALERTA_FONDO, color = ALERTA_TEXTO } = {}) => {
    const lineas = renglones.flatMap((r) => partirTexto(r, ancho - 34, 9).map((l, i) => ({ l, primera: i === 0 })))
    const alto = lineas.length * 12 + 14
    h.espacio(Math.min(alto, 200))
    let inicio = h.y
    doc.rect(M, inicio, ancho, Math.min(alto, doc.alto - PIE - inicio), fondo)
    h.y += 8
    for (const { l, primera } of lineas) {
      if (h.y + 12 > doc.alto - PIE) {
        doc.nuevaPagina()
        h.y = 52
        inicio = h.y
        doc.rect(M, inicio, ancho, 14, fondo)
      }
      if (primera) doc.texto('!', M + 10, h.y, { tam: 9, negrita: true, color })
      doc.texto(l, M + 22, h.y, { tam: 9, color })
      h.y += 12
    }
    h.y += 12
  }
  h.tarjetas = (items) => {
    const alto = 62
    const sep = 8
    h.espacio(alto + sep)
    const w = (ancho - sep * (items.length - 1)) / items.length
    items.forEach((it, k) => {
      const x = M + k * (w + sep)
      doc.rect(x, h.y, w, alto, FONDO)
      doc.rect(x, h.y, 3, alto, it.color || AZUL)
      doc.texto(it.valor, x + 10, h.y + 8, { tam: 16, negrita: true, color: TEXTO })
      partirTexto(it.etiqueta.toUpperCase(), w - 16, 6.8).slice(0, 2)
        .forEach((l, j) => doc.texto(l, x + 10, h.y + 30 + j * 9, { tam: 6.8, color: SUAVE }))
      if (it.detalle) doc.texto(partirTexto(it.detalle, w - 16, 7)[0], x + 10, h.y + 49, { tam: 7, color: SUAVE })
    })
    h.y += alto + 14
  }
  h.barra = ({ etiqueta, valor, proporcion, color = AZUL, detalle }) => {
    const lineas = partirTexto(etiqueta, ancho - 110, 9)
    h.espacio(lineas.length * 12 + (detalle ? 22 : 12))
    lineas.forEach((l, i) => doc.texto(l, M, h.y + i * 12, { tam: 9, color: TEXTO }))
    doc.texto(valor, doc.ancho - M, h.y, { tam: 9, negrita: true, color: TEXTO, alinear: 'der' })
    h.y += lineas.length * 12
    doc.rect(M, h.y, ancho, 6, [237, 240, 246])
    const p = Math.max(0, Math.min(1, proporcion || 0))
    doc.rect(M, h.y, Math.max(ancho * p, p > 0 ? 2 : 0), 6, color)
    if (detalle) doc.texto(detalle, M, h.y + 9, { tam: 7.5, color: SUAVE })
    h.y += detalle ? 22 : 13
  }
  h.cerrar = (generadoPor, leyenda) => {
    const hoy = fechaCorta(new Date().toISOString().slice(0, 10))
    const total = doc.paginas
    for (let i = 0; i < total; i++) {
      doc.enPagina(i, () => {
        doc.linea(M, doc.alto - 42, doc.ancho - M, doc.alto - 42, BORDE, 0.5)
        doc.texto(`${leyenda} · Rugby M12 · Tucumán Lawn Tennis · generado el ${hoy}${generadoPor ? ` por ${generadoPor}` : ''}`,
          M, doc.alto - 36, { tam: 7.5, color: SUAVE })
        doc.texto(`${i + 1} de ${total}`, doc.ancho - M, doc.alto - 36, { tam: 7.5, color: SUAVE, alinear: 'der' })
      })
    }
    return doc
  }
  return h
}

// ---------------------------------------------------------------------------
// Cuestionario para imprimir o compartir
// ---------------------------------------------------------------------------
// `pedidoAyuda`: el pedido para hablar del final como lo configuró la encuesta
// (sin él va el de siempre; sacado, no sale)
export function generarCuestionarioPDF({ titulo, preguntas, cierra, generadoPor, pedidoAyuda }) {
  const pedido = pedidoAyudaDe(pedidoAyuda)
  const h = documento({
    titulo: titulo || 'Encuesta a los jugadores',
    subtitulo: 'Encuesta anónima',
    derecha: cierra ? `Se puede contestar hasta el ${fechaCorta(cierra)}` : '',
  })
  const { doc, ancho } = h

  h.recuadro([
    'Es anónima: nadie va a saber qué contestaste, tampoco los entrenadores.',
    'Contestala vos solo. No es un examen: no hay respuestas buenas ni malas.',
    preguntas.some((p) => p.tipo === 'varias')
      ? 'Marcá una sola opción en cada pregunta, salvo donde dice que podés marcar varias. Las que dicen "opcional" las podés dejar en blanco.'
      : 'Marcá una sola opción en cada pregunta. Las que dicen "opcional" las podés dejar en blanco.',
  ], { fondo: [227, 236, 251], color: AZUL })

  const casillero = (x, y) => {
    doc.rect(x, y, 9, 9, TEXTO)
    doc.rect(x + 0.8, y + 0.8, 7.4, 7.4, [255, 255, 255])
  }

  let n = 0
  for (const b of bloquesDe(preguntas)) {
    h.titulo(b.nombre)
    for (const p of b.preguntas) {
      n++
      const escala = p.tipo === 'estrellas' ? ' (de 1 a 5 estrellas: 5 es la más alta)'
        : p.tipo === 'varias' ? ' (podés marcar varias)'
        : p.tipo === 'opciones' ? ' (marcá una)' : ''
      const enunciado = `${n}. ${p.texto}${escala}${p.obligatoria ? '' : ' (opcional)'}`
      const lineas = partirTexto(enunciado, ancho, 10, true)
      const opciones = opcionesDe(p)
      // Cuánto lugar ocupan las opciones, para no partir una pregunta entre hojas
      let altoOpciones = 18
      if (p.tipo === 'abierta') altoOpciones = 66
      else if (conOpciones(p.tipo)) altoOpciones = opciones.length * 15 + 4
      h.espacio(lineas.length * 13 + altoOpciones + 8)
      for (const l of lineas) {
        doc.texto(l, M, h.y, { tam: 10, negrita: true, color: TEXTO })
        h.y += 13
      }
      h.y += 3
      if (p.tipo === 'abierta') {
        for (let i = 0; i < 3; i++) {
          h.y += 18
          doc.linea(M, h.y, doc.ancho - M, h.y, GRIS, 0.6)
        }
        h.y += 10
      } else if (conOpciones(p.tipo)) {
        for (const o of opciones) {
          casillero(M + 4, h.y)
          doc.texto(o.label, M + 20, h.y, { tam: 9.5, color: TEXTO })
          h.y += 15
        }
        h.y += 6
      } else {
        // En fila: casillero y texto, repartidos a lo ancho
        let x = M + 4
        const paso = p.tipo === 'nota' ? ancho / 10 : Math.min(ancho / opciones.length, 120)
        for (const o of opciones) {
          casillero(x, h.y)
          doc.texto(o.label, x + 14, h.y, { tam: 9.5, color: TEXTO })
          x += paso
        }
        h.y += 22
      }
      if (p.tipo !== 'abierta') doc.linea(M, h.y - 6, doc.ancho - M, h.y - 6, BORDE, 0.4)
      h.y += 4
    }
  }

  // El pedido de ayuda va en la última parte si ya se llama "Para cerrar"
  // (como en las preguntas de siempre); si no, con su propio título
  if (pedido.activo) {
    const partes = bloquesDe(preguntas)
    if (partes[partes.length - 1]?.nombre !== 'Para cerrar') h.titulo('Para cerrar')
    else h.y += 6
    const lineas = partirTexto(pedido.texto, ancho - 20, 10, true)
    h.espacio(lineas.length * 13 + 30)
    casillero(M + 4, h.y)
    for (const l of lineas) {
      doc.texto(l, M + 20, h.y, { tam: 10, negrita: true, color: TEXTO })
      h.y += 13
    }
    h.y += 2
    if (pedido.aclaracion) h.parrafo(pedido.aclaracion, { tam: 8.5, color: SUAVE, sangria: 20 })
    h.y += 6
  } else {
    h.y += 12
  }
  h.parrafo('¡Gracias por contestar!', { tam: 11, negrita: true, color: AZUL })

  return h.cerrar(generadoPor, 'Encuesta a los jugadores')
}

export const nombreCuestionario = (titulo) =>
  `encuesta-${String(titulo || 'jugadores').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.pdf`

// ---------------------------------------------------------------------------
// Reporte de resultados con análisis
// ---------------------------------------------------------------------------

// Colores de cada respuesta en la barra apilada: del lado favorable a verde,
// del otro a rojo; las opciones sin lado, en azules
function coloresDe(p) {
  if (p.tipo === 'nota') return p.opciones.map((o) => (o.value >= 9 ? VERDE : o.value >= 7 ? VERDE_CLARO : o.value >= 5 ? ROJO_CLARO : ROJO))
  if (p.tipo === 'estrellas') return p.opciones.map((o) => (o.value === 5 ? VERDE : o.value === 4 ? VERDE_CLARO : o.value === 3 ? GRIS : o.value === 2 ? ROJO_CLARO : ROJO))
  if (conOpciones(p.tipo)) {
    const azules = [AZUL, [59, 130, 246], [147, 197, 253], [96, 165, 250], [30, 64, 175], [191, 219, 254], [37, 99, 235], [219, 234, 254]]
    return p.opciones.map((_, i) => azules[i % azules.length])
  }
  const favorables = p.opciones.filter((o) => o.favorable)
  const otras = p.opciones.filter((o) => !o.favorable)
  return p.opciones.map((o) => {
    if (o.favorable) return favorables.indexOf(o) === 0 ? VERDE : VERDE_CLARO
    // "No sé" va en gris: no es ni a favor ni en contra
    if (o.value === 'nose') return GRIS
    return otras.indexOf(o) === otras.length - 1 ? ROJO : ROJO_CLARO
  })
}

export function generarReporteEncuestaPDF({ encuesta, resultados: r, links, respondieron, pedidos, pedidosPendientes, generadoPor }) {
  const h = documento({
    titulo: 'Reporte de la encuesta a los jugadores',
    subtitulo: encuesta.titulo,
    derecha: `${encuesta.cerrada ? `Cerró el ${fechaCorta(encuesta.cerrada)} · ` : ''}respondieron ${respondieron} de ${links}`,
  })
  const { doc, ancho } = h

  if (!r?.suficientes) {
    h.titulo('Resultados')
    h.parrafo(`Llegaron ${r?.respuestas ?? 0} respuestas. Con menos de ${MINIMO_RESPUESTAS} no se muestran resultados: en un grupo tan chico se podría adivinar quién dijo qué.`)
    return h.cerrar(generadoPor, 'Reporte de la encuesta')
  }

  const a = analizarEncuesta(r, { links, respondieron, pedidos, pedidos_pendientes: pedidosPendientes })
  const conPedido = pedidoAyudaDe(encuesta.pedido_ayuda).activo

  // --- resumen
  h.titulo('Resumen')
  h.tarjetas([
    { valor: `${a.participacion ?? '—'}%`, etiqueta: 'Participación', detalle: `${respondieron} de ${links} chicos`, color: AZUL },
    { valor: String(r.indice ?? '—'), etiqueta: 'Índice general (0 a 100)', detalle: r.indice_anterior != null ? `antes ${r.indice_anterior}` : 'primera medición', color: VIOLETA },
    { valor: r.nota ? conComa(r.nota.promedio) : '—', etiqueta: 'Nota al año (1 a 10)', detalle: r.nota?.anterior != null ? `antes ${conComa(r.nota.anterior)}` : '', color: DORADO },
    conPedido
      ? { valor: String(pedidos || 0), etiqueta: 'Pidieron hablar con alguien', detalle: pedidosPendientes ? `${pedidosPendientes} sin atender` : 'ninguno pendiente', color: pedidosPendientes ? ROJO : VERDE }
      : { valor: '—', etiqueta: 'Pedido para hablar', detalle: 'no se ofreció en esta encuesta', color: GRIS },
  ])

  h.subtitulo('Lectura general')
  for (const f of a.lectura) h.vineta(f)

  if (a.alertas.length) {
    h.subtitulo('Alertas de cuidado')
    h.recuadro(a.alertas)
  }

  if (a.fortalezas.length) {
    h.subtitulo('Lo más fuerte')
    for (const p of a.fortalezas) h.barra({ etiqueta: textoEnLista(p), valor: `${p.favorable}% favorable`, proporcion: p.favorable / 100, color: VERDE })
  }
  if (a.aMejorar.length) {
    h.subtitulo('Lo que más hay que trabajar')
    for (const p of a.aMejorar) h.barra({ etiqueta: textoEnLista(p), valor: `${p.favorable}% favorable`, proporcion: p.favorable / 100, color: colorFavorable(p.favorable) })
  }

  h.titulo('Por parte', 'El índice de cada parte es el promedio del porcentaje favorable de sus preguntas cerradas.')
  for (const b of r.bloques) h.barra({ etiqueta: b.nombre, valor: String(b.indice), proporcion: b.indice / 100, color: colorFavorable(b.indice) })
  if (r.segmentos.length) {
    h.subtitulo(r.segmento)
    for (const s of r.segmentos) {
      if (s.suficientes) {
        h.barra({
          etiqueta: s.label, valor: `índice ${s.indice ?? '—'}${s.nota != null ? ` · nota ${conComa(s.nota)}` : ''}`,
          proporcion: (s.indice || 0) / 100, color: colorFavorable(s.indice), detalle: `${s.respuestas} respuestas`,
        })
      } else {
        h.parrafo(`${s.label}: ${s.respuestas} ${s.respuestas === 1 ? 'respuesta' : 'respuestas'}, muy pocas para mostrar sin identificar a nadie.`, { tam: 8.5, color: SUAVE })
      }
    }
  }

  if (a.mejoras.length || a.caidas.length) {
    h.titulo('Cambios contra la encuesta anterior', r.anterior ? `Comparada con "${r.anterior.titulo}". Van las preguntas que se movieron 10 puntos o más.` : '')
    for (const p of a.mejoras) h.vineta(`Subió: ${textoEnLista(p)} De ${p.favorable_anterior}% a ${p.favorable}% (+${p.variacion}).`, { color: VERDE, marca: '+' })
    for (const p of a.caidas) h.vineta(`Bajó: ${textoEnLista(p)} De ${p.favorable_anterior}% a ${p.favorable}% (${p.variacion}).`, { color: ROJO, marca: '-' })
  }

  // --- pregunta por pregunta, con la barra apilada de las respuestas
  h.titulo('Pregunta por pregunta', 'Cada barra reparte las respuestas: verde del lado favorable, rojo del otro y gris para "no sé".')
  let n = 0
  for (const p of r.preguntas.filter((x) => x.tipo !== 'abierta')) {
    n++
    const lineas = partirTexto(`${n}. ${p.texto}`, ancho - 120, 9.5, true)
    h.espacio(lineas.length * 12 + 40)
    lineas.forEach((l, i) => doc.texto(l, M, h.y + i * 12, { tam: 9.5, negrita: true, color: TEXTO }))
    const resumen = p.tipo === 'nota' ? `promedio ${conComa(p.promedio)}`
      : p.tipo === 'estrellas' ? `${p.favorable}% favorable · ${conComa(p.promedio)} de 5`
      : p.favorable != null ? `${p.favorable}% favorable` : `${p.n} respuestas`
    doc.texto(resumen, doc.ancho - M, h.y, { tam: 9, negrita: true, color: conOpciones(p.tipo) ? TEXTO : colorFavorable(p.favorable), alinear: 'der' })
    if (p.variacion != null) {
      doc.texto(`${p.variacion > 0 ? '+' : ''}${p.variacion} vs. anterior`, doc.ancho - M, h.y + 11,
        { tam: 7.5, color: p.variacion > 0 ? VERDE : p.variacion < 0 ? ROJO : SUAVE, alinear: 'der' })
    }
    h.y += Math.max(lineas.length * 12, p.variacion != null ? 22 : 12) + 2
    // Casilleros: una barra por opción (cada chico pudo marcar varias, así
    // que no se apilan: los porcentajes suman más de 100)
    if (p.tipo === 'varias') {
      for (const o of [...p.opciones].sort((a, b) => b.cantidad - a.cantidad)) {
        h.espacio(14)
        const etiqueta = partirTexto(o.label, ancho * 0.45, 8.5)[0]
        doc.texto(etiqueta, M, h.y, { tam: 8.5, color: TEXTO })
        const x0 = M + ancho * 0.47
        const w = ancho * 0.4
        doc.rect(x0, h.y + 1, w, 8, [237, 240, 246])
        doc.rect(x0, h.y + 1, (w * (o.pct || 0)) / 100, 8, AZUL)
        doc.texto(`${o.cantidad} · ${o.pct ?? 0}%`, doc.ancho - M, h.y, { tam: 8.5, negrita: true, color: TEXTO, alinear: 'der' })
        h.y += 13
      }
      doc.texto('Cada chico pudo marcar varias: los porcentajes pueden sumar más de 100.', M, h.y, { tam: 7.5, color: SUAVE })
      h.y += 16
      continue
    }
    // Barra apilada
    const colores = coloresDe(p)
    const total = p.opciones.reduce((s, o) => s + o.cantidad, 0) || 1
    let x = M
    p.opciones.forEach((o, i) => {
      const w = (ancho * o.cantidad) / total
      if (w <= 0) return
      doc.rect(x, h.y, w, 11, colores[i])
      if (w > 16) {
        // Número oscuro sobre los colores claros, blanco sobre los oscuros
        const [cr, cg, cb] = colores[i]
        const claro = 0.299 * cr + 0.587 * cg + 0.114 * cb > 160
        doc.texto(String(o.cantidad), x + w / 2, h.y + 1.5, { tam: 7.5, negrita: true, color: claro ? TEXTO : [255, 255, 255], alinear: 'centro' })
      }
      x += w
    })
    h.y += 15
    // Leyenda de esa pregunta (en la nota alcanza con la escala)
    if (p.tipo === 'nota') {
      doc.texto(`Notas: ${p.opciones.filter((o) => o.cantidad).map((o) => `${o.label} (${o.cantidad})`).join(' · ')}`, M, h.y, { tam: 7.5, color: SUAVE })
      h.y += 14
    } else {
      let lx = M
      p.opciones.forEach((o, i) => {
        const etiqueta = `${o.label} ${o.cantidad}`
        const w = anchoTexto(etiqueta, 7.5) + 22
        if (lx + w > doc.ancho - M) { lx = M; h.y += 11 }
        doc.rect(lx, h.y + 1, 7, 7, colores[i])
        doc.texto(etiqueta, lx + 10, h.y, { tam: 7.5, color: SUAVE })
        lx += w
      })
      h.y += 16
    }
  }

  // --- respuestas libres
  const abiertas = r.preguntas.filter((p) => p.tipo === 'abierta')
  if (abiertas.length) {
    h.titulo('Lo que escribieron', 'Las respuestas libres, tal cual, en orden alfabético (no en el orden en que llegaron).')
    for (const p of abiertas) {
      h.subtitulo(`${p.texto} (${p.textos.length})`)
      if (!p.textos.length) h.parrafo('Nadie escribió nada.', { color: SUAVE })
      for (const t of p.textos) h.vineta(`“${t}”`)
    }
  }

  // --- sugerencias
  if (a.sugerencias.length) {
    h.titulo('Sugerencias para conversar en el staff',
      'Salen solas de las preguntas con menos de 60% favorable. Son un punto de partida para la charla, no una receta.')
    for (const s of a.sugerencias) {
      h.parrafo(`${s.pregunta} (${s.favorable}% favorable)`, { negrita: true, tam: 9 })
      h.parrafo(s.sugerencia, { sangria: 12, tam: 9 })
    }
  }

  h.titulo('Cómo se hizo')
  h.parrafo(`Cada chico recibió un link personal de un solo uso. Las respuestas se guardan sin el nombre, sin el link y sin la hora, así que nadie puede saber qué contestó cada uno. Los resultados se ven recién con la encuesta cerrada y solo con ${MINIMO_RESPUESTAS} respuestas o más, también en los cortes por años en el club. El porcentaje favorable cuenta "siempre" y "casi siempre", "sí" (o "no" en las preguntas en negativo, como "me molestaron"), 4 o 5 estrellas y las notas de 7 o más. ${conPedido ? 'Los pedidos para hablar con alguien del club los ve solo la cabeza de división, con el nombre; acá va solo la cantidad.' : 'Esta encuesta no ofreció la opción de pedir que alguien del club hable con el chico.'}`,
    { tam: 8.5, color: SUAVE })

  return h.cerrar(generadoPor, 'Reporte de la encuesta')
}

export const nombreReporteEncuesta = (titulo) => `reporte-${nombreCuestionario(titulo)}`
