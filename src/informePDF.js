// Informe de gestión en PDF: lo dibuja con el generador propio (src/pdf.js) a
// partir del JSON que devuelve `GET informe` (server/informe.js).
//
// Es un documento para el cuerpo técnico y la cabeza de división, para medir
// cómo viene la gestión y decidir: cada sección arranca con los números y
// sigue con las listas que explican esos números. Las secciones se eligen
// antes de emitirlo (SECCIONES_INFORME en src/informe.js).

import { anchoTexto, nuevoPDF, partirTexto } from './pdf.js'
import { fechaCorta, PUESTOS, APTITUDES } from './helpers.js'
import { conUnidad } from './tests.js'
import {
  conComa, conPorcentaje, DIFICULTADES_LABEL, mesCortoInforme, MOTIVOS_SUSPENSION, oGuion, variacion,
} from './informe.js'

// Colores institucionales, los mismos del resto de los reportes
const AZUL = [26, 74, 158]
const DORADO = [255, 210, 0]
const TEXTO = [28, 32, 40]
const SUAVE = [91, 98, 112]
const BORDE = [221, 225, 234]
const FONDO = [244, 246, 250]
const VERDE = [22, 163, 74]
const AMBAR = [217, 119, 6]
const ROJO = [220, 38, 38]
const VIOLETA = [126, 34, 206]
const CELESTE = [214, 226, 250]

const M = 40 // margen lateral
const PIE = 60 // alto reservado para el pie de página

const COLOR_SEMAFORO = { verde: VERDE, amarillo: AMBAR, rojo: ROJO }
const COLOR_INTENSIDAD = { baja: VERDE, media: AMBAR, alta: ROJO }
const LABEL_INTENSIDAD = { baja: 'Baja', media: 'Media', alta: 'Alta', sin: 'Sin marcar' }
const LABEL_PUESTO = Object.fromEntries(PUESTOS.map((p) => [p.value, p.label]))
const LABEL_APTITUD = Object.fromEntries(APTITUDES.map((a) => [a.value, a.label]))

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const lista = (nombres, tope = 12) => (nombres.length <= tope
  ? nombres.join(', ')
  : `${nombres.slice(0, tope).join(', ')} y ${nombres.length - tope} más`)

export function generarInformePDF({ datos, secciones, generadoPor }) {
  const incluye = (s) => secciones.includes(s)
  const d = datos
  const doc = nuevoPDF({
    titulo: `Informe de gestión M12 ${d.desde} a ${d.hasta}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  const anchoUtil = doc.ancho - M * 2
  let y = 0

  // ------------------------------------------------------------------ base
  function portada() {
    doc.rect(0, 0, doc.ancho, 92, AZUL)
    doc.rect(0, 92, doc.ancho, 4, DORADO)
    doc.texto('Informe de gestión de la división', M, 22, { tam: 19, negrita: true, color: [255, 255, 255] })
    doc.texto('Rugby M12 · Tucumán Lawn Tennis', M, 50, { tam: 10, color: CELESTE })
    doc.texto(`Período: ${fechaCorta(d.desde)} a ${fechaCorta(d.hasta)}`, M, 66, { tam: 10, negrita: true, color: [255, 255, 255] })
    const cierre = d.hasta_efectivo < d.hasta ? ` · informado hasta hoy, ${fechaCorta(d.hasta_efectivo)}` : ''
    doc.texto(`${plural(d.dias, 'día', 'días')}${cierre} · comparado con ${fechaCorta(d.anterior.desde)} a ${fechaCorta(d.anterior.hasta)}`,
      doc.ancho - M, 66, { tam: 8.5, color: CELESTE, alinear: 'der' })
    y = 118
  }

  function espacio(alto) {
    if (y + alto <= doc.alto - PIE) return
    doc.nuevaPagina()
    y = 52
  }

  function titulo(texto, sub) {
    // Un título no arranca al borde de abajo: si queda poco lugar, hoja nueva
    if (y > doc.alto - PIE - 130) { doc.nuevaPagina(); y = 52 }
    else if (y > 120) y += 10
    doc.texto(texto, M, y, { tam: 13.5, negrita: true, color: AZUL })
    y += 18
    doc.linea(M, y, doc.ancho - M, y, DORADO, 1.6)
    y += 10
    if (sub) {
      for (const l of partirTexto(sub, anchoUtil, 8.5)) {
        doc.texto(l, M, y, { tam: 8.5, color: SUAVE })
        y += 11
      }
      y += 4
    } else y += 4
  }

  function subtitulo(texto) {
    espacio(40)
    y += 4
    doc.texto(texto, M, y, { tam: 10.5, negrita: true, color: TEXTO })
    y += 16
  }

  function parrafo(texto, { tam = 9, color = TEXTO, sangria = 0 } = {}) {
    const lineas = partirTexto(texto, anchoUtil - sangria, tam)
    for (const l of lineas) {
      espacio(tam + 4)
      doc.texto(l, M + sangria, y, { tam, color })
      y += tam + 3
    }
    y += 3
  }

  function vineta(texto, opciones = {}) {
    const lineas = partirTexto(texto, anchoUtil - 12, 9)
    espacio(lineas.length * 12 + 2)
    doc.texto('•', M, y, { tam: 9, color: opciones.color || TEXTO })
    for (const l of lineas) {
      doc.texto(l, M + 12, y, { tam: 9, color: opciones.color || TEXTO })
      y += 12
    }
    y += 1
  }

  // Tarjetas de números grandes, de a cuatro por fila, con la variación debajo
  function tarjetas(items, { porFila = 4 } = {}) {
    const alto = 66
    const sep = 8
    for (let i = 0; i < items.length; i += porFila) {
      const fila = items.slice(i, i + porFila)
      espacio(alto + sep)
      const ancho = (anchoUtil - sep * (porFila - 1)) / porFila
      fila.forEach((it, k) => {
        const x = M + k * (ancho + sep)
        doc.rect(x, y, ancho, alto, FONDO)
        doc.rect(x, y, 3, alto, it.color || AZUL)
        doc.texto(it.valor, x + 10, y + 8, { tam: 16, negrita: true, color: TEXTO })
        const etiqueta = partirTexto(it.etiqueta.toUpperCase(), ancho - 16, 6.8).slice(0, 2)
        etiqueta.forEach((l, j) => doc.texto(l, x + 10, y + 30 + j * 9, { tam: 6.8, color: SUAVE }))
        if (it.detalle) {
          const c = it.signo > 0 ? VERDE : it.signo < 0 ? ROJO : SUAVE
          doc.texto(partirTexto(it.detalle, ancho - 16, 7)[0], x + 10, y + 51, { tam: 7, color: it.neutro ? SUAVE : c })
        }
      })
      y += alto + sep
    }
    y += 6
  }

  // Barra horizontal con etiqueta y dato
  function barra({ etiqueta, valor, detalle, proporcion, color = AZUL }) {
    espacio(detalle ? 30 : 24)
    doc.texto(etiqueta, M, y, { tam: 9, color: TEXTO })
    doc.texto(valor, doc.ancho - M, y, { tam: 9, negrita: true, color: TEXTO, alinear: 'der' })
    y += 12
    doc.rect(M, y, anchoUtil, 6, [237, 240, 246])
    const p = Math.max(0, Math.min(1, proporcion || 0))
    doc.rect(M, y, Math.max(anchoUtil * p, p > 0 ? 2 : 0), 6, color)
    if (detalle) doc.texto(detalle, M, y + 9, { tam: 7.5, color: SUAVE })
    y += detalle ? 20 : 12
  }

  // Corta un texto para que entre en un ancho
  function recortar(texto, ancho, tam, negrita = false) {
    let t = String(texto ?? '')
    if (anchoTexto(t, tam, negrita) <= ancho) return t
    while (t.length > 1 && anchoTexto(`${t}…`, tam, negrita) > ancho) t = t.slice(0, -1)
    return `${t}…`
  }

  // Tabla sencilla: columnas con ancho (en puntos o proporción) y alineación
  function tabla(columnas, filas, { tam = 8.5, altoFila = 14 } = {}) {
    const fijos = columnas.reduce((n, c) => n + (c.ancho > 1 ? c.ancho : 0), 0)
    const flexibles = columnas.filter((c) => !(c.ancho > 1))
    const restante = Math.max(anchoUtil - fijos, 0)
    const anchos = columnas.map((c) => (c.ancho > 1 ? c.ancho : restante * (c.ancho || 1 / flexibles.length)))
    const encabezado = () => {
      doc.rect(M, y, anchoUtil, altoFila, AZUL)
      let x = M
      columnas.forEach((c, i) => {
        const px = c.alinear === 'der' ? x + anchos[i] - 5 : c.alinear === 'centro' ? x + anchos[i] / 2 : x + 5
        doc.texto(recortar(c.titulo, anchos[i] - 8, tam - 0.5, true), px, y + 3.5,
          { tam: tam - 0.5, negrita: true, color: [255, 255, 255], alinear: c.alinear || 'izq' })
        x += anchos[i]
      })
      y += altoFila
    }
    espacio(altoFila * 2)
    encabezado()
    filas.forEach((f, idx) => {
      if (y + altoFila > doc.alto - PIE) {
        doc.nuevaPagina()
        y = 52
        encabezado()
      }
      if (idx % 2) doc.rect(M, y, anchoUtil, altoFila, FONDO)
      let x = M
      columnas.forEach((c, i) => {
        const celda = typeof c.valor === 'function' ? c.valor(f) : f[c.valor]
        const texto = celda == null ? '—' : String(celda)
        const color = typeof c.color === 'function' ? (c.color(f) || TEXTO) : TEXTO
        const px = c.alinear === 'der' ? x + anchos[i] - 5 : c.alinear === 'centro' ? x + anchos[i] / 2 : x + 5
        doc.texto(recortar(texto, anchos[i] - 8, tam, !!c.negrita), px, y + 3.5,
          { tam, color, negrita: !!c.negrita, alinear: c.alinear || 'izq' })
        x += anchos[i]
      })
      y += altoFila
    })
    doc.linea(M, y, doc.ancho - M, y, BORDE, 0.5)
    y += 12
  }

  // Serie de puntos unidos por líneas, con el eje de abajo etiquetado
  function grafico(puntos, { alto = 90, etiqueta = (p) => p.fecha.slice(5), max = 100, umbral = null, colorDe = () => AZUL } = {}) {
    const validos = puntos.filter((p) => p.valor != null)
    if (validos.length < 2) return
    espacio(alto + 34)
    const x0 = M + 28
    const ancho = anchoUtil - 28
    const y0 = y
    // Rejilla
    for (const nivel of [0, 25, 50, 75, 100]) {
      const yy = y0 + alto - (alto * nivel) / max
      doc.linea(x0, yy, x0 + ancho, yy, BORDE, 0.4)
      doc.texto(`${nivel}`, x0 - 6, yy - 4, { tam: 6.5, color: SUAVE, alinear: 'der' })
    }
    if (umbral != null) {
      const yy = y0 + alto - (alto * umbral) / max
      doc.linea(x0, yy, x0 + ancho, yy, AMBAR, 0.8)
    }
    const paso = ancho / Math.max(validos.length - 1, 1)
    const coord = (p, i) => [x0 + i * paso, y0 + alto - (alto * p.valor) / max]
    validos.forEach((p, i) => {
      if (i) {
        const [xa, ya] = coord(validos[i - 1], i - 1)
        const [xb, yb] = coord(p, i)
        doc.linea(xa, ya, xb, yb, AZUL, 1.2)
      }
    })
    validos.forEach((p, i) => {
      const [x, yy] = coord(p, i)
      doc.rect(x - 2, yy - 2, 4, 4, colorDe(p))
    })
    // Etiquetas de abajo: las que entren sin pisarse
    const cada = Math.max(1, Math.ceil((validos.length * 34) / ancho))
    const ultimo = validos.length - 1
    validos.forEach((p, i) => {
      const regular = i % cada === 0 && (ultimo - i) * paso >= 30
      if (regular || i === ultimo) {
        doc.texto(etiqueta(p), x0 + i * paso, y0 + alto + 6, { tam: 6.5, color: SUAVE, alinear: 'centro' })
      }
    })
    y += alto + 24
  }

  // Leyenda chica: cuadraditos de color con su texto
  function leyenda(items) {
    espacio(14)
    let x = M
    for (const it of items) {
      doc.rect(x, y + 1, 7, 7, it.color)
      doc.texto(it.texto, x + 10, y, { tam: 7.5, color: SUAVE })
      x += anchoTexto(it.texto, 7.5) + 24
    }
    y += 14
  }

  // El calendario del período: un renglón por mes, un casillero por día
  function calendario(eventos) {
    const meses = [...new Set(eventos.map((e) => e.fecha.slice(0, 7)))]
    if (!meses.length) return
    const porDia = {}
    for (const e of eventos) (porDia[e.fecha] ||= []).push(e)
    // Todos los meses del período, aunque no tengan eventos
    const todos = []
    let m = d.desde.slice(0, 7)
    while (m <= d.hasta_efectivo.slice(0, 7)) {
      todos.push(m)
      const [a, mm] = m.split('-').map(Number)
      m = `${mm === 12 ? a + 1 : a}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}`
    }
    const anchoEtiqueta = 44
    const casillero = (anchoUtil - anchoEtiqueta) / 31
    const alto = 13
    for (const mes of todos) {
      espacio(alto + 4)
      doc.texto(mesCortoInforme(mes), M, y + 2, { tam: 8, negrita: true, color: TEXTO })
      const [a, mm] = mes.split('-').map(Number)
      const diasDelMes = new Date(Date.UTC(a, mm, 0)).getUTCDate()
      for (let dia = 1; dia <= diasDelMes; dia++) {
        const fecha = `${mes}-${String(dia).padStart(2, '0')}`
        const x = M + anchoEtiqueta + (dia - 1) * casillero
        const dentro = fecha >= d.desde && fecha <= d.hasta_efectivo
        doc.rect(x + 0.5, y, casillero - 1, alto - 1, dentro ? FONDO : [250, 251, 253])
        const evs = porDia[fecha] || []
        if (evs.length) {
          const e = evs.find((x) => x.tipo === 'partido') || evs[0]
          const color = e.suspendido ? [200, 200, 205]
            : e.tipo === 'partido' ? DORADO
              : e.modalidad === 'extra' ? VIOLETA : AZUL
          doc.rect(x + 1.5, y + 1, casillero - 3, alto - 3, color)
          if (e.parcial) doc.rect(x + 1.5, y + alto - 4, casillero - 3, 2, ROJO)
          if (e.suspendido) doc.linea(x + 1.5, y + 1, x + casillero - 1.5, y + alto - 2, ROJO, 0.8)
        }
      }
      y += alto + 2
    }
    // Numeración de los días cada 5
    espacio(10)
    for (let dia = 1; dia <= 31; dia += 5) {
      const x = M + anchoEtiqueta + (dia - 1) * casillero + casillero / 2
      doc.texto(String(dia), x, y, { tam: 6, color: SUAVE, alinear: 'centro' })
    }
    y += 12
    leyenda([
      { color: AZUL, texto: 'Entrenamiento de rutina' },
      { color: VIOLETA, texto: 'Entrenamiento extra' },
      { color: DORADO, texto: 'Partido' },
      { color: [200, 200, 205], texto: 'Suspendido (tachado)' },
      { color: ROJO, texto: 'Partido con un bloque suspendido' },
    ])
  }

  const varPP = (a, b) => variacion(a, b, { pp: true })
  const varN = (a, b, dec = 0) => variacion(a, b, { decimales: dec })

  // ============================================================== secciones
  portada()

  if (incluye('resumen')) {
    const a = d.indicadores.actual
    const p = d.indicadores.anterior
    titulo('Tablero de indicadores',
      'Los números clave del período. Debajo de cada uno, la variación contra el período inmediato anterior de igual largo. "pp" son puntos porcentuales.')
    const item = (valor, etiqueta, v, color, neutro = false) => ({ valor, etiqueta, detalle: v.texto, signo: v.signo, color, neutro })
    tarjetas([
      item(String(a.activos), 'Jugadores activos al cierre', varN(a.activos, p.activos), AZUL),
      item(conPorcentaje(a.asistencia_entrenamientos), 'Asistencia a entrenamientos', varPP(a.asistencia_entrenamientos, p.asistencia_entrenamientos), AZUL),
      item(conPorcentaje(a.asistencia_partidos), 'Asistencia a partidos', varPP(a.asistencia_partidos, p.asistencia_partidos), AZUL),
      item(String(a.entrenamientos), 'Entrenamientos realizados', varN(a.entrenamientos, p.entrenamientos), AZUL, true),
      item(String(a.partidos), 'Partidos jugados', varN(a.partidos, p.partidos), DORADO, true),
      item(conPorcentaje(a.suspendidos_pct), 'Eventos suspendidos', (() => { const v = varPP(a.suspendidos_pct, p.suspendidos_pct); return { ...v, signo: -v.signo } })(), AMBAR),
      item(String(a.evaluaciones), 'Evaluaciones cargadas', varN(a.evaluaciones, p.evaluaciones), AZUL),
      item(oGuion(conComa(a.promedio_evaluacion)), 'Promedio de evaluación (1 a 5)', varN(a.promedio_evaluacion, p.promedio_evaluacion, 1), AZUL),
      item(String(a.lesiones), 'Lesiones nuevas', (() => { const v = varN(a.lesiones, p.lesiones); return { ...v, signo: -v.signo } })(), ROJO),
      item(String(a.chicos_con_tests), 'Chicos con tests físicos', varN(a.chicos_con_tests, p.chicos_con_tests), VERDE),
      item(`${a.minutos_tecnica}′`, 'Minutos de técnica planificados', varN(a.minutos_tecnica, p.minutos_tecnica), AZUL),
      item(conPorcentaje(d.administrativo.ficha_pct), 'Fichas médicas vigentes (hoy)', { texto: `${d.administrativo.ficha_vigente} de ${d.administrativo.plantel}`, signo: 0 }, VERDE, true),
    ])
    // Lectura rápida: lo que más llama la atención
    const avisos = []
    if (d.registro.sin_asistencia.length) avisos.push(`${plural(d.registro.sin_asistencia.length, 'evento ya ocurrido', 'eventos ya ocurridos')} sin asistencia tomada: los porcentajes quedan cortos.`)
    if (d.asistencia.faltas_seguidas.length) avisos.push(`${plural(d.asistencia.faltas_seguidas.length, 'chico lleva', 'chicos llevan')} tres o más faltas seguidas al cierre.`)
    if (d.evaluaciones.sin_evaluar.length) avisos.push(`${plural(d.evaluaciones.sin_evaluar.length, 'chico del plantel', 'chicos del plantel')} sin evaluación en el período.`)
    if (d.lesiones.abiertas_cierre.length) avisos.push(`${plural(d.lesiones.abiertas_cierre.length, 'lesión abierta', 'lesiones abiertas')} al cierre.`)
    if (d.lesiones.golpes.sin_atender.length) avisos.push(`${plural(d.lesiones.golpes.sin_atender.length, 'lesión marcada en cancha', 'lesiones marcadas en cancha')} sin cargar en la ficha.`)
    if (d.administrativo.ficha_vencida + d.administrativo.sin_ficha) avisos.push(`${d.administrativo.ficha_vencida + d.administrativo.sin_ficha} chicos sin ficha médica vigente.`)
    if (avisos.length) {
      subtitulo('Para mirar primero')
      for (const a2 of avisos) vineta(a2, { color: [133, 77, 14] })
    }
  }

  if (incluye('plantel')) {
    const p = d.plantel
    titulo('Plantel',
      'Jugadores no dados de baja al inicio y al cierre del período. Las fechas marcadas con ~ salen de una reconstrucción aproximada (anteriores a que la app guardara el historial de altas y bajas).')
    tarjetas([
      { valor: String(p.activos_inicio), etiqueta: 'Activos al inicio', color: AZUL },
      { valor: String(p.activos_cierre), etiqueta: 'Activos al cierre', detalle: varN(p.activos_cierre, p.activos_inicio).texto.replace('vs. período anterior', 'en el período'), signo: varN(p.activos_cierre, p.activos_inicio).signo, color: AZUL },
      { valor: String(p.altas.length), etiqueta: 'Altas', color: VERDE },
      { valor: String(p.bajas.length), etiqueta: 'Bajas', color: ROJO },
    ])
    if (p.altas.length) vineta(`Altas: ${lista(p.altas.map((a) => `${a.nombre} (${fechaCorta(a.fecha)})`))}.`)
    if (p.bajas.length) vineta(`Bajas: ${lista(p.bajas.map((b) => `${b.nombre} (${b.aproximado ? '~' : ''}${fechaCorta(b.fecha)})`))}.`)
    if (p.reincorporaciones.length) vineta(`Reincorporaciones: ${lista(p.reincorporaciones.map((b) => `${b.nombre} (${fechaCorta(b.fecha)})`))}.`)
    vineta(p.lesionados_cierre.length
      ? `Lesionados al cierre: ${lista(p.lesionados_cierre)}.`
      : 'Ningún jugador lesionado al cierre.')
    subtitulo('Composición del plantel actual')
    const posiciones = Object.entries(p.por_posicion).sort((a, b) => b[1] - a[1])
    parrafo(`Por tipo: ${posiciones.map(([k, n]) => `${k} ${n}`).join(' · ')}.`)
    const puestos = Object.entries(p.por_puesto).sort((a, b) => b[1] - a[1])
    parrafo(`Por puesto principal: ${puestos.map(([k, n]) => `${k === 'sin_definir' ? 'sin definir' : (LABEL_PUESTO[k] || k)} ${n}`).join(' · ')}.`)
    const aptitudes = Object.entries(p.por_aptitud)
    if (aptitudes.length) parrafo(`Aptitudes marcadas: ${aptitudes.map(([k, n]) => `${LABEL_APTITUD[k] || k} ${n}`).join(' · ')}.`)
    const edades = Object.entries(p.edades).sort()
    parrafo(`Edades hoy: ${edades.map(([k, n]) => `${k === 'sin_fecha' ? 'sin fecha de nacimiento' : `${k} años`}: ${n}`).join(' · ')}.`)
  }

  if (incluye('actividad')) {
    const a = d.actividad
    titulo('Actividad', 'Entrenamientos y partidos del período. Un partido cuenta como suspendido solo cuando cayeron todos sus bloques.')
    tarjetas([
      { valor: String(a.entrenamientos.realizados), etiqueta: 'Entrenamientos', detalle: `${a.entrenamientos.rutina} de rutina · ${a.entrenamientos.extra} extra`, neutro: true },
      { valor: String(a.partidos.realizados), etiqueta: 'Partidos', detalle: `${a.partidos.bloques_jugados} bloques · ${a.partidos.tiempos} tiempos`, neutro: true, color: DORADO },
      { valor: String(a.suspendidos.total), etiqueta: 'Suspendidos', detalle: `${conPorcentaje(a.suspendidos.pct)} de lo programado`, neutro: true, color: AMBAR },
      { valor: String(a.partidos.encuentros), etiqueta: 'Encuentros', detalle: `${a.partidos.parciales} partidos con un bloque caído`, neutro: true, color: VIOLETA },
    ])
    const motivos = Object.entries(a.suspendidos.motivos)
    if (motivos.length) parrafo(`Motivos de suspensión: ${motivos.map(([k, n]) => `${MOTIVOS_SUSPENSION[k] || k} ${n}`).join(' · ')}.`)
    subtitulo('Calendario')
    calendario(a.calendario)
    if (a.por_mes.length > 1) {
      subtitulo('Por mes')
      tabla([
        { titulo: 'Mes', valor: (f) => mesCortoInforme(f.mes), ancho: 90 },
        { titulo: 'Entrenamientos', valor: 'entrenamientos', alinear: 'der' },
        { titulo: 'Partidos', valor: 'partidos', alinear: 'der' },
        { titulo: 'Suspendidos', valor: 'suspendidos', alinear: 'der' },
      ], a.por_mes)
    }
  }

  if (incluye('asistencia')) {
    const s = d.asistencia
    titulo('Asistencia de los jugadores',
      'Presentes sobre convocables: cuenta el que ya estaba en el plantel ese día y no estaba lesionado; el que estuvo cuenta siempre. Mismo criterio que el listado y el boletín. Los eventos sin asistencia tomada no entran.')
    tarjetas([
      { valor: conPorcentaje(s.division.entrenamientos), etiqueta: 'A entrenamientos', detalle: varPP(d.indicadores.actual.asistencia_entrenamientos, d.indicadores.anterior.asistencia_entrenamientos).texto, signo: varPP(d.indicadores.actual.asistencia_entrenamientos, d.indicadores.anterior.asistencia_entrenamientos).signo },
      { valor: conPorcentaje(s.division.partidos), etiqueta: 'A partidos', detalle: varPP(d.indicadores.actual.asistencia_partidos, d.indicadores.anterior.asistencia_partidos).texto, signo: varPP(d.indicadores.actual.asistencia_partidos, d.indicadores.anterior.asistencia_partidos).signo, color: DORADO },
      { valor: conPorcentaje(s.division.promedio_jugadores), etiqueta: 'Promedio por jugador', detalle: `${s.division.jugadores_con_datos} chicos con 3 o más eventos`, neutro: true },
      { valor: String(s.division.excluidos_por_lesion), etiqueta: 'Eventos perdidos por lesión', detalle: 'no cuentan como falta', neutro: true, color: AMBAR },
    ])
    if (s.por_evento.length >= 2) {
      subtitulo('Evento por evento (% de presentes)')
      grafico(s.por_evento.map((e) => ({ ...e, valor: e.pct })), {
        etiqueta: (e) => fechaCorta(e.fecha).slice(0, 5),
        colorDe: (e) => (e.tipo === 'partido' ? DORADO : AZUL),
        umbral: s.division.total,
      })
      leyenda([{ color: AZUL, texto: 'Entrenamiento' }, { color: DORADO, texto: 'Partido' }, { color: AMBAR, texto: 'Promedio del período' }])
    }
    if (s.por_mes.length > 1) {
      subtitulo('Por mes')
      tabla([
        { titulo: 'Mes', valor: (f) => mesCortoInforme(f.mes), ancho: 90 },
        { titulo: 'Entrenamientos', valor: (f) => conPorcentaje(f.entrenamientos), alinear: 'der' },
        { titulo: 'Partidos', valor: (f) => conPorcentaje(f.partidos), alinear: 'der' },
        { titulo: 'Total', valor: (f) => conPorcentaje(f.total), alinear: 'der', negrita: true },
      ], s.por_mes)
    }
    subtitulo('Cómo se reparte el plantel')
    const topeFranja = Math.max(...s.franjas.map((f) => f.jugadores), 1)
    const colorFranja = { alta: VERDE, buena: AZUL, media: AMBAR, baja: ROJO }
    for (const f of s.franjas) barra({ etiqueta: f.label, valor: plural(f.jugadores, 'jugador', 'jugadores'), proporcion: f.jugadores / topeFranja, color: colorFranja[f.value] })
    if (s.mejores.length) {
      subtitulo('Los de mejor asistencia')
      tabla([
        { titulo: 'Jugador', valor: 'nombre' },
        { titulo: 'Total', valor: (f) => conPorcentaje(f.total), ancho: 60, alinear: 'der', negrita: true },
        { titulo: 'Entren.', valor: (f) => conPorcentaje(f.entrenamientos), ancho: 60, alinear: 'der' },
        { titulo: 'Partidos', valor: (f) => conPorcentaje(f.partidos), ancho: 60, alinear: 'der' },
        { titulo: 'Presentes', valor: (f) => `${f.presentes} de ${f.contables}`, ancho: 80, alinear: 'der' },
      ], s.mejores)
    }
    if (s.peores.length) {
      subtitulo('Los de menor asistencia')
      tabla([
        { titulo: 'Jugador', valor: 'nombre' },
        { titulo: 'Total', valor: (f) => conPorcentaje(f.total), ancho: 60, alinear: 'der', negrita: true, color: (f) => (f.total < 50 ? ROJO : TEXTO) },
        { titulo: 'Entren.', valor: (f) => conPorcentaje(f.entrenamientos), ancho: 60, alinear: 'der' },
        { titulo: 'Partidos', valor: (f) => conPorcentaje(f.partidos), ancho: 60, alinear: 'der' },
        { titulo: 'Presentes', valor: (f) => `${f.presentes} de ${f.contables}`, ancho: 80, alinear: 'der' },
      ], s.peores)
    }
    subtitulo('Señales')
    vineta(s.faltas_seguidas.length
      ? `Faltas seguidas al cierre: ${lista(s.faltas_seguidas.map((f) => `${f.nombre} (${f.faltas})`))}.`
      : 'Ningún chico llega al cierre con tres o más faltas seguidas.')
    vineta(`Partidos: ${s.division.falto_avisando} veces un chico avisó que iba y no fue; ${s.division.fue_sin_avisar} veces fue sin haber avisado; ${s.division.tarde} llegadas tarde.`)
    if (s.sin_datos.length) vineta(`Sin ningún evento contable en el período: ${lista(s.sin_datos)}.`, { color: SUAVE })
  }

  if (incluye('staff')) {
    const st = d.staff
    titulo('Staff',
      `Presencia y carga de trabajo de cada integrante. La asistencia a entrenamientos se mide sobre los ${plural(st.entrenamientos_con_toma, 'entrenamiento', 'entrenamientos')} donde se tomó la del staff (${conPorcentaje(st.cobertura_toma)} de los ${st.entrenamientos_realizados} realizados); en partidos, sobre los bloques asignados con presencia marcada.`)
    tabla([
      { titulo: 'Integrante', valor: 'nombre', negrita: true },
      { titulo: 'Rol', valor: (f) => f.rol.replace('Preparador físico (PF)', 'PF').replace('Cabeza de división', 'Cabeza'), ancho: 62 },
      { titulo: 'Entren.', valor: (f) => (st.entrenamientos_con_toma ? `${conPorcentaje(f.entrenamientos.pct)} (${f.entrenamientos.presentes})` : '—'), ancho: 62, alinear: 'der', color: (f) => (f.entrenamientos.pct != null && f.entrenamientos.pct < 50 ? ROJO : TEXTO) },
      { titulo: 'Partidos', valor: (f) => (f.partidos.marcados ? `${conPorcentaje(f.partidos.pct)} (${f.partidos.presentes}/${f.partidos.marcados})` : f.partidos.asignados ? `${f.partidos.asignados} sin marcar` : '—'), ancho: 74, alinear: 'der' },
      { titulo: 'Evalúa', valor: 'evaluaciones', ancho: 44, alinear: 'der' },
      { titulo: 'Revisa', valor: 'revisiones', ancho: 44, alinear: 'der' },
      { titulo: 'Tests', valor: 'tests', ancho: 40, alinear: 'der' },
      { titulo: 'Planes', valor: 'planes', ancho: 44, alinear: 'der' },
      { titulo: 'Planillas', valor: 'planillas', ancho: 50, alinear: 'der' },
    ], st.integrantes, { tam: 8 })
    parrafo('"Evalúa" y "Revisa" son evaluaciones cargadas como evaluador y como revisor cruzado; "Planes" son planificaciones técnicas firmadas y "Planillas" las del trabajo físico. Los managers figuran porque también acompañan los partidos.', { tam: 8, color: SUAVE })
    const sinToma = st.entrenamientos_realizados - st.entrenamientos_con_toma
    if (sinToma > 0) vineta(`En ${plural(sinToma, 'entrenamiento', 'entrenamientos')} no se tomó la asistencia del staff: esos días no se sabe quién estuvo.`, { color: [133, 77, 14] })
  }

  if (incluye('evaluaciones')) {
    const e = d.evaluaciones
    titulo('Evaluaciones',
      'Cobertura del plantel, acuerdo entre las dos miradas de la revisión cruzada y promedios de la división. El progreso compara la última evaluación del período de cada chico con la anterior que tenga, de cuando sea.')
    tarjetas([
      { valor: String(e.cargadas), etiqueta: 'Evaluaciones cargadas', detalle: varN(d.indicadores.actual.evaluaciones, d.indicadores.anterior.evaluaciones).texto, signo: varN(d.indicadores.actual.evaluaciones, d.indicadores.anterior.evaluaciones).signo },
      { valor: conPorcentaje(e.cobertura), etiqueta: 'Del plantel evaluado', detalle: `${e.jugadores_evaluados} chicos`, neutro: true },
      { valor: oGuion(conComa(e.promedio_general)), etiqueta: 'Promedio general (1 a 5)', detalle: varN(d.indicadores.actual.promedio_evaluacion, d.indicadores.anterior.promedio_evaluacion, 1).texto, signo: varN(d.indicadores.actual.promedio_evaluacion, d.indicadores.anterior.promedio_evaluacion, 1).signo },
      { valor: conPorcentaje(e.acuerdo_promedio), etiqueta: 'Acuerdo entre miradas', detalle: `${e.revisadas} con revisión cruzada`, neutro: true, color: VIOLETA },
    ])
    if (e.sin_evaluar.length) vineta(`Sin evaluar en el período: ${lista(e.sin_evaluar, 20)}.`, { color: [133, 77, 14] })
    if (e.mas_discutidas.length) vineta(`Donde más difieren evaluador y revisor: ${e.mas_discutidas.map((v) => `${v.label} (${v.veces})`).join(', ')}.`)
    const pr = e.procesos
    vineta(`Procesos de evaluación: ${pr.lanzados} lanzados, ${pr.cerrados} completados${pr.cancelados ? `, ${pr.cancelados} cancelados` : ''}${pr.abiertos ? `, ${pr.abiertos} abiertos al cierre` : ''}${pr.dias_promedio_cierre != null ? `; ${plural(pr.dias_promedio_cierre, 'día', 'días')} promedio hasta completarse` : ''}.`)
    if (e.seguimientos.total) {
      vineta(`Seguimientos en la ficha: ${e.seguimientos.total} (${e.seguimientos.por_area.map((a) => `${a.area} ${a.cantidad}`).join(', ')}).`)
    }
    const conDatos = e.variables.filter((v) => v.promedio != null)
    if (conDatos.length) {
      subtitulo('Promedio de la división por área')
      for (const a of e.areas.filter((x) => x.promedio != null)) {
        const v = a.delta == null ? '' : ` · ${a.delta > 0 ? '+' : ''}${conComa(a.delta, 2)} vs. evaluación anterior`
        barra({ etiqueta: a.label, valor: `${conComa(a.promedio)}${v}`, proporcion: a.promedio / 5, color: a.delta > 0 ? VERDE : a.delta < 0 ? ROJO : AZUL })
      }
      subtitulo('Variable por variable')
      tabla([
        { titulo: 'Variable', valor: 'label' },
        { titulo: 'Área', valor: (f) => f.area_label.replace('Técnica individual', 'Técnica').replace('Comprensión de juego', 'Juego'), ancho: 70 },
        { titulo: 'Promedio', valor: (f) => conComa(f.promedio), ancho: 60, alinear: 'der', negrita: true },
        { titulo: 'Chicos', valor: 'n', ancho: 48, alinear: 'der' },
        { titulo: 'Cambio', valor: (f) => (f.delta == null ? '—' : `${f.delta > 0 ? '+' : ''}${conComa(f.delta, 2)}`), ancho: 60, alinear: 'der', color: (f) => (f.delta > 0 ? VERDE : f.delta < 0 ? ROJO : TEXTO) },
        { titulo: 'Comparados', valor: 'n_comparados', ancho: 64, alinear: 'der' },
      ], conDatos, { tam: 8 })
      const dist = e.distribucion
      parrafo(`Distribución del promedio general: ${dist['4-5']} chicos entre 4 y 5 · ${dist['3-4']} entre 3 y 4 · ${dist['2-3']} entre 2 y 3 · ${dist['1-2']} por debajo de 2.`)
    }
    if (e.comparados) {
      subtitulo(`Progreso: ${e.mejoraron} mejoraron, ${e.empeoraron} bajaron, de ${e.comparados} comparados`)
      tabla([
        { titulo: 'Mayor progreso', valor: 'nombre' },
        { titulo: 'Antes', valor: (f) => conComa(f.anterior), ancho: 56, alinear: 'der' },
        { titulo: 'Ahora', valor: (f) => conComa(f.general), ancho: 56, alinear: 'der', negrita: true },
        { titulo: 'Cambio', valor: (f) => `${f.delta > 0 ? '+' : ''}${conComa(f.delta)}`, ancho: 60, alinear: 'der', color: (f) => (f.delta > 0 ? VERDE : f.delta < 0 ? ROJO : TEXTO) },
        { titulo: 'Evaluación previa', valor: (f) => fechaCorta(f.fecha_anterior), ancho: 90, alinear: 'der' },
      ], e.mayor_progreso)
      if (e.mayor_retroceso.length) {
        tabla([
          { titulo: 'Mayor retroceso', valor: 'nombre' },
          { titulo: 'Antes', valor: (f) => conComa(f.anterior), ancho: 56, alinear: 'der' },
          { titulo: 'Ahora', valor: (f) => conComa(f.general), ancho: 56, alinear: 'der', negrita: true },
          { titulo: 'Cambio', valor: (f) => conComa(f.delta), ancho: 60, alinear: 'der', color: () => ROJO },
          { titulo: 'Evaluación previa', valor: (f) => fechaCorta(f.fecha_anterior), ancho: 90, alinear: 'der' },
        ], e.mayor_retroceso)
      }
    }
  }

  if (incluye('entrenado')) {
    const t = d.entrenado.tecnica
    const f = d.entrenado.fisico
    titulo('Qué se entrenó',
      'Técnica: minutos por aspecto según la planificación de cada entrenamiento (los aspectos sin minutos cargados se reparten la hora de técnica). Físico: la planilla del PF de la primera media hora.')
    tarjetas([
      { valor: String(t.sesiones), etiqueta: 'Entrenamientos con plan técnico', detalle: `${t.marcadas_sin_planificacion} marcados "sin planificación"`, neutro: true },
      { valor: `${t.minutos}′`, etiqueta: 'Minutos de técnica', detalle: varN(d.indicadores.actual.minutos_tecnica, d.indicadores.anterior.minutos_tecnica).texto, signo: varN(d.indicadores.actual.minutos_tecnica, d.indicadores.anterior.minutos_tecnica).signo },
      { valor: String(f.sesiones), etiqueta: 'Planillas de físico', neutro: true, color: VERDE },
      { valor: `${f.minutos}′`, etiqueta: 'Minutos de físico', neutro: true, color: VERDE },
    ])
    if (t.minutos) {
      subtitulo('Técnica: reparto por grupo')
      for (const g of t.grupos) barra({ etiqueta: g.label, valor: `${g.minutos}′ · ${conPorcentaje(g.pct)}`, proporcion: t.minutos ? g.minutos / t.minutos : 0, color: g.grupo === 'colectiva' ? AZUL : VIOLETA })
      subtitulo('Técnica: aspecto por aspecto')
      const tope = t.aspectos[0]?.minutos || 1
      for (const a of t.aspectos.filter((x) => x.veces)) {
        barra({
          etiqueta: a.label,
          valor: `${a.minutos}′ · ${conPorcentaje(a.pct)}`,
          detalle: `${plural(a.veces, 'vez', 'veces')} · última el ${fechaCorta(a.ultima)}`,
          proporcion: a.minutos / tope,
          color: a.grupo === 'colectiva' ? AZUL : VIOLETA,
        })
      }
      if (t.nunca_trabajados.length) vineta(`No se trabajaron en el período: ${t.nunca_trabajados.join(', ')}.`, { color: [133, 77, 14] })
    } else parrafo('No hay planificaciones técnicas cargadas en el período.', { color: SUAVE })
    if (f.minutos || f.sesiones) {
      subtitulo('Físico: reparto por variable')
      const tope = f.variables[0]?.minutos || 1
      for (const v of f.variables.filter((x) => x.sesiones)) {
        barra({
          etiqueta: v.label,
          valor: `${v.minutos}′ · ${conPorcentaje(v.pct)}`,
          detalle: `${plural(v.sesiones, 'sesión', 'sesiones')}${v.intensidad ? ` · intensidad ${LABEL_INTENSIDAD[v.intensidad].toLowerCase()} la mayoría de las veces` : ''}`,
          proporcion: v.minutos / tope,
          color: v.intensidad ? COLOR_INTENSIDAD[v.intensidad] : VERDE,
        })
      }
      parrafo(`Por grupo: ${f.grupos.map((g) => `${g.label} ${g.minutos}′ (${conPorcentaje(g.pct)})`).join(' · ')}.`)
      parrafo(`Minutos por intensidad: baja ${f.por_intensidad.baja}′ · media ${f.por_intensidad.media}′ · alta ${f.por_intensidad.alta}′${f.por_intensidad.sin ? ` · sin marcar ${f.por_intensidad.sin}′` : ''}. Carga declarada por sesión: baja ${f.por_carga.baja} · media ${f.por_carga.media} · alta ${f.por_carga.alta}${f.por_carga.sin ? ` · sin declarar ${f.por_carga.sin}` : ''}.`)
    } else parrafo('No hay planillas de trabajo físico cargadas en el período.', { color: SUAVE })
  }

  if (incluye('tests')) {
    const ts = d.tests
    titulo('Tests físicos',
      'Para cada test, la primera y la última medición de cada chico dentro del período. El semáforo al cierre es el de la última medición (el que puso el PF, o el de la tabla de cortes).')
    tarjetas([
      { valor: String(ts.mediciones), etiqueta: 'Mediciones cargadas', neutro: true },
      { valor: String(ts.chicos_medidos), etiqueta: 'Chicos con algún test', detalle: varN(d.indicadores.actual.chicos_con_tests, d.indicadores.anterior.chicos_con_tests).texto, signo: varN(d.indicadores.actual.chicos_con_tests, d.indicadores.anterior.chicos_con_tests).signo, color: VERDE },
      { valor: String(ts.sin_ninguna_medicion.length), etiqueta: 'Chicos sin ninguna medición', neutro: true, color: AMBAR },
      { valor: String(ts.por_test.filter((t) => t.mediciones).length), etiqueta: 'Tests distintos tomados', neutro: true },
    ])
    if (ts.sin_ninguna_medicion.length && ts.sin_ninguna_medicion.length <= 20) vineta(`Sin medir: ${lista(ts.sin_ninguna_medicion, 20)}.`, { color: SUAVE })
    for (const t of ts.por_test.filter((x) => x.mediciones)) {
      subtitulo(`${t.label} (${t.unidad})`)
      const partes = [
        `${plural(t.jugadores_medidos, 'chico medido', 'chicos medidos')}, ${t.mediciones} mediciones; ${t.sin_medir} del plantel sin medir.`,
      ]
      if (t.con_dos_mediciones) {
        partes.push(`Entre los ${t.con_dos_mediciones} con dos o más mediciones, el promedio pasó de ${conUnidad(t.test, t.promedio_inicio)} a ${conUnidad(t.test, t.promedio_cierre)}${t.mejoraron != null ? `: ${t.mejoraron} mejoraron y ${t.empeoraron} empeoraron` : ''}.`)
      } else partes.push(`Promedio de la última medición: ${conUnidad(t.test, t.promedio_ultima)}.`)
      parrafo(partes.join(' '))
      if (t.semaforos) {
        const total = t.semaforos.verde + t.semaforos.amarillo + t.semaforos.rojo + t.semaforos.sin
        const anchoBarra = anchoUtil
        espacio(26)
        doc.texto('Semáforo al cierre', M, y, { tam: 8, color: SUAVE })
        y += 11
        let x = M
        for (const k of ['verde', 'amarillo', 'rojo', 'sin']) {
          const w = total ? (anchoBarra * t.semaforos[k]) / total : 0
          if (w > 0) {
            doc.rect(x, y, w, 8, k === 'sin' ? [200, 200, 205] : COLOR_SEMAFORO[k])
            if (w > 14) doc.texto(String(t.semaforos[k]), x + w / 2, y - 0.5, { tam: 7, negrita: true, color: [255, 255, 255], alinear: 'centro' })
            x += w
          }
        }
        y += 14
        leyenda([
          { color: VERDE, texto: `Muy bueno ${t.semaforos.verde}` },
          { color: AMBAR, texto: `Regular ${t.semaforos.amarillo}` },
          { color: ROJO, texto: `Malo ${t.semaforos.rojo}` },
          { color: [200, 200, 205], texto: `Sin color ${t.semaforos.sin}` },
        ])
      }
      if (t.mejores_marcas.length) {
        tabla([
          { titulo: 'Mejores marcas al cierre', valor: 'nombre' },
          { titulo: 'Marca', valor: (f) => conUnidad(t.test, f.ultima), ancho: 70, alinear: 'der', negrita: true },
          { titulo: 'Fecha', valor: (f) => fechaCorta(f.fecha_ultima), ancho: 70, alinear: 'der' },
          { titulo: 'Cambio en el período', valor: (f) => (f.cambio == null ? '—' : `${f.cambio > 0 ? '+' : ''}${conComa(f.cambio, t.decimales)}`), ancho: 110, alinear: 'der', color: (f) => (f.mejoro ? VERDE : f.mejoro === false ? ROJO : TEXTO) },
        ], t.mejores_marcas)
      }
      if (t.mayores_progresos.length) {
        tabla([
          { titulo: 'Mayores progresos', valor: 'nombre' },
          { titulo: 'Primera', valor: (f) => conUnidad(t.test, f.primera), ancho: 70, alinear: 'der' },
          { titulo: 'Última', valor: (f) => conUnidad(t.test, f.ultima), ancho: 70, alinear: 'der', negrita: true },
          { titulo: 'Cambio', valor: (f) => `${f.cambio > 0 ? '+' : ''}${conComa(f.cambio, t.decimales)}`, ancho: 110, alinear: 'der', color: () => VERDE },
        ], t.mayores_progresos)
      }
      if (!t.mejor && t.jugadores.length) {
        tabla([
          { titulo: 'Jugador', valor: 'nombre' },
          { titulo: 'Primera', valor: (f) => conUnidad(t.test, f.primera), ancho: 80, alinear: 'der' },
          { titulo: 'Última', valor: (f) => conUnidad(t.test, f.ultima), ancho: 80, alinear: 'der', negrita: true },
          { titulo: 'Cambio', valor: (f) => (f.cambio == null ? '—' : `${f.cambio > 0 ? '+' : ''}${conComa(f.cambio, t.decimales)}`), ancho: 80, alinear: 'der' },
        ], t.jugadores, { tam: 8, altoFila: 12 })
      }
    }
  }

  if (incluye('lesiones')) {
    const l = d.lesiones
    titulo('Lesiones y golpes',
      'Lesiones cargadas en la ficha con fecha dentro del período, más los golpes y lesiones marcados en la cancha al tomar asistencia.')
    tarjetas([
      { valor: String(l.nuevas), etiqueta: 'Lesiones nuevas', detalle: varN(d.indicadores.actual.lesiones, d.indicadores.anterior.lesiones).texto, signo: -varN(d.indicadores.actual.lesiones, d.indicadores.anterior.lesiones).signo, color: ROJO },
      { valor: String(l.abiertas_cierre.length), etiqueta: 'Abiertas al cierre', neutro: true, color: AMBAR },
      { valor: l.dias_promedio_alta == null ? '—' : String(l.dias_promedio_alta), etiqueta: 'Días promedio hasta el alta', detalle: `${l.recuperadas} con alta registrada`, neutro: true },
      { valor: String(l.eventos_perdidos), etiqueta: 'Eventos perdidos por lesión', neutro: true },
    ])
    const g = l.golpes
    vineta(`En la cancha: ${g.entrenamiento.golpeados} golpes y ${g.entrenamiento.lesionados} lesiones en entrenamientos; ${g.partido.golpeados} golpes y ${g.partido.lesionados} lesiones en partidos.`)
    if (g.sin_atender.length) vineta(`Lesiones marcadas en cancha sin cargar en la ficha: ${lista(g.sin_atender.map((s) => `${s.nombre} (${fechaCorta(s.fecha)})`))}.`, { color: [133, 77, 14] })
    if (l.repetidas.length) vineta(`Con más de una lesión en el período: ${l.repetidas.map((r) => `${r.nombre} (${r.n})`).join(', ')}.`)
    if (l.por_mes.length > 1 && l.nuevas) parrafo(`Por mes: ${l.por_mes.map((m) => `${mesCortoInforme(m.mes)} ${m.lesiones}`).join(' · ')}.`)
    if (l.detalle.length) {
      subtitulo('Detalle')
      tabla([
        { titulo: 'Fecha', valor: (f) => fechaCorta(f.fecha), ancho: 62 },
        { titulo: 'Jugador', valor: 'nombre', ancho: 130 },
        { titulo: 'Lesión', valor: 'descripcion' },
        { titulo: 'Estado', valor: (f) => (f.recuperado ? (f.recuperado_en ? `Alta ${fechaCorta(f.recuperado_en)}` : 'Recuperado') : f.retorno_estimado ? `Vuelve ${fechaCorta(f.retorno_estimado)}` : 'Abierta'), ancho: 90, color: (f) => (f.recuperado ? VERDE : ROJO) },
        { titulo: 'Días', valor: (f) => (f.dias == null ? '—' : String(f.dias)), ancho: 40, alinear: 'der' },
      ], l.detalle, { tam: 8 })
    }
    if (l.abiertas_cierre.length) {
      subtitulo('Abiertas al cierre')
      for (const a of l.abiertas_cierre) vineta(`${a.nombre}: ${a.descripcion} (desde ${fechaCorta(a.fecha)}${a.retorno_estimado ? `, retorno estimado ${fechaCorta(a.retorno_estimado)}` : ''}).`)
    }
  }

  if (incluye('partidos')) {
    const p = d.partidos
    titulo('Partidos',
      'La app no lleva resultados: la medida del rendimiento es la valoración de 1 a 5 que el staff le pone a cada bloque y a cada tiempo. Los tiempos jugados por chico miden la equidad de minutos.')
    tarjetas([
      { valor: String(p.bloques), etiqueta: 'Bloques jugados', detalle: `${p.cerrados} cerrados`, neutro: true, color: DORADO },
      { valor: oGuion(conComa(p.valoracion_promedio)), etiqueta: 'Valoración promedio', detalle: `${p.valorados} bloques valorados`, neutro: true },
      { valor: oGuion(conComa(p.valoracion_tiempos)), etiqueta: 'Valoración de los tiempos', neutro: true },
      { valor: String(p.tiempos.total), etiqueta: 'Tiempos jugados', detalle: `${p.tiempos.prestados} prestados al rival`, neutro: true },
    ])
    if (p.valorados) {
      subtitulo('Valoración de los bloques')
      const tope = Math.max(...p.distribucion_valoracion.map((v) => v.bloques), 1)
      for (const v of p.distribucion_valoracion) barra({ etiqueta: `Valoración ${v.valoracion} de 5`, valor: plural(v.bloques, 'bloque', 'bloques'), proporcion: v.bloques / tope, color: v.valoracion >= 4 ? VERDE : v.valoracion === 3 ? AMBAR : ROJO })
      parrafo(`Según el rival: ${p.por_dificultad.map((x) => `${DIFICULTADES_LABEL[x.dificultad]} ${x.valoracion == null ? '—' : conComa(x.valoracion)} (${x.bloques})`).join(' · ')}.`)
      if (p.por_mes.length > 1) parrafo(`Por mes: ${p.por_mes.filter((m) => m.bloques).map((m) => `${mesCortoInforme(m.mes)} ${m.valoracion == null ? '—' : conComa(m.valoracion)} (${m.bloques})`).join(' · ')}.`)
    }
    if (p.rivales.length) {
      subtitulo('Rivales')
      tabla([
        { titulo: 'Rival', valor: 'rival' },
        { titulo: 'Bloques', valor: 'bloques', ancho: 60, alinear: 'der' },
        { titulo: 'Valoración', valor: (f) => conComa(f.valoracion), ancho: 70, alinear: 'der', negrita: true },
      ], p.rivales.slice(0, 15))
      parrafo(`Canchas: ${p.lugares.slice(0, 8).map((x) => `${x.lugar} (${x.bloques})`).join(' · ')}.`, { tam: 8, color: SUAVE })
    }
    if (p.tiempos.jugadores_citados) {
      subtitulo(`Equidad de tiempos: ${conComa(p.tiempos.promedio_por_jugador)} por chico citado`)
      tabla([
        { titulo: 'Los que menos jugaron', valor: 'nombre' },
        { titulo: 'Tiempos', valor: 'tiempos', ancho: 60, alinear: 'der', negrita: true },
        { titulo: 'Posibles', valor: 'posibles', ancho: 60, alinear: 'der' },
        { titulo: 'Partidos', valor: 'partidos', ancho: 60, alinear: 'der' },
      ], p.tiempos.menos_jugaron)
      tabla([
        { titulo: 'Los que más jugaron', valor: 'nombre' },
        { titulo: 'Tiempos', valor: 'tiempos', ancho: 60, alinear: 'der', negrita: true },
        { titulo: 'Posibles', valor: 'posibles', ancho: 60, alinear: 'der' },
        { titulo: 'Partidos', valor: 'partidos', ancho: 60, alinear: 'der' },
      ], p.tiempos.mas_jugaron)
    }
    const c = p.capitanias
    subtitulo('Capitanías')
    vineta(`${plural(c.total, 'capitanía', 'capitanías')} en el período, repartidas entre ${c.jugadores_distintos} chicos${c.repetidos.length ? ` (repitieron: ${c.repetidos.map((r) => `${r.nombre} ${r.veces}`).join(', ')})` : ''}.`)
    vineta(c.nunca.length ? `Todavía nunca fueron capitanes (${c.nunca.length} de ${c.plantel}): ${lista(c.nunca, 25)}.` : 'Todos los chicos del plantel ya fueron capitanes alguna vez.')
  }

  if (incluye('administrativo')) {
    const ad = d.administrativo
    titulo('Administrativo', 'Papeles del plantel actual (a hoy) y giras o encuentros con salida dentro del período.')
    tarjetas([
      { valor: conPorcentaje(ad.ficha_pct), etiqueta: 'Fichas médicas vigentes', detalle: `${ad.ficha_vencida} vencidas · ${ad.sin_ficha} sin ficha`, neutro: true, color: ad.ficha_pct >= 90 ? VERDE : AMBAR },
      { valor: `${ad.dni_cargado}/${ad.plantel}`, etiqueta: 'Con DNI cargado', detalle: `${ad.dni_escaneado} con el DNI escaneado`, neutro: true },
      { valor: `${ad.tutor_completo}/${ad.plantel}`, etiqueta: 'Tutor y teléfono completos', neutro: true },
      { valor: `${ad.puestos_cargados}/${ad.plantel}`, etiqueta: 'Con puestos cargados', detalle: `${ad.fecha_nacimiento} con fecha de nacimiento`, neutro: true },
    ])
    if (ad.sin_ficha_nombres.length) vineta(`Sin ficha médica vigente: ${lista(ad.sin_ficha_nombres, 25)}.`, { color: [133, 77, 14] })
    if (ad.sin_dni_nombres.length) vineta(`Sin DNI cargado: ${lista(ad.sin_dni_nombres, 25)}.`, { color: [133, 77, 14] })
    if (ad.viajes.length) {
      subtitulo('Giras y encuentros')
      tabla([
        { titulo: 'Salida', valor: (f) => fechaCorta(f.fecha_salida), ancho: 60 },
        { titulo: 'Tipo', valor: (f) => (f.tipo === 'gira' ? 'Gira' : 'Encuentro'), ancho: 60 },
        { titulo: 'Nombre', valor: 'nombre' },
        { titulo: 'Destino', valor: (f) => f.destino || f.club_anfitrion || '—', ancho: 90 },
        { titulo: 'Chicos', valor: 'jugadores', ancho: 44, alinear: 'der' },
        { titulo: 'Staff', valor: 'staff', ancho: 36, alinear: 'der' },
        { titulo: 'Cobrado', valor: (f) => (f.cobrado_pct == null ? '—' : conPorcentaje(f.cobrado_pct)), ancho: 54, alinear: 'der', color: (f) => (f.cobrado_pct != null && f.cobrado_pct < 100 ? AMBAR : TEXTO) },
      ], ad.viajes, { tam: 8 })
    } else parrafo('No hubo giras ni encuentros con salida en el período.', { color: SUAVE })
  }

  if (incluye('registro')) {
    const r = d.registro
    titulo('Calidad del registro',
      'Lo que faltó cargar en la app durante el período. Cuanto más completo el registro, más vale todo lo anterior.')
    tarjetas([
      { valor: String(r.sin_asistencia.length), etiqueta: 'Eventos sin asistencia tomada', detalle: `de ${r.eventos_pasados} ya ocurridos`, neutro: true, color: r.sin_asistencia.length ? ROJO : VERDE },
      { valor: String(r.sin_asistencia_staff), etiqueta: 'Entrenamientos sin asistencia del staff', detalle: `de ${r.entrenamientos}`, neutro: true, color: AMBAR },
      { valor: String(r.sin_plan_tecnico.length), etiqueta: 'Entrenamientos sin plan técnico', detalle: `${r.marcados_sin_planificacion} marcados "sin planificación"`, neutro: true, color: AMBAR },
      { valor: String(r.sin_planilla_fisica.length), etiqueta: 'Sin planilla de físico', detalle: `de ${r.entrenamientos} entrenamientos`, neutro: true, color: AMBAR },
    ])
    if (r.sin_asistencia.length) vineta(`Sin asistencia tomada: ${lista(r.sin_asistencia.map(fechaCorta), 20)}.`)
    if (r.sin_plan_tecnico.length) vineta(`Sin plan técnico: ${lista(r.sin_plan_tecnico.map(fechaCorta), 20)}.`)
    if (r.sin_planilla_fisica.length) vineta(`Sin planilla de físico: ${lista(r.sin_planilla_fisica.map(fechaCorta), 20)}.`)
    vineta(`Partidos: ${r.bloques_sin_cerrar} bloques sin cerrar${r.partidos_sin_tiempos.length ? `; sin tiempos cargados: ${lista(r.partidos_sin_tiempos.map(fechaCorta), 10)}` : ''}.`)
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
      doc.texto(`Informe de gestión · Rugby M12 · Tucumán Lawn Tennis · generado el ${hoy}${generadoPor ? ` por ${generadoPor}` : ''} · uso interno del cuerpo técnico`,
        M, doc.alto - 36, { tam: 7.5, color: SUAVE })
      doc.texto(`${i + 1} de ${total}`, doc.ancho - M, doc.alto - 36, { tam: 7.5, color: SUAVE, alinear: 'der' })
    })
  }
}
