// Reporte en PDF de un test físico: el mismo resumen que la pantalla, en
// hoja A4 para mandar al cuerpo técnico. Usa el generador propio (src/pdf.js),
// que dibuja texto, rectángulos y líneas: los gráficos son barras hechas con
// eso mismo, sin librería.

import { fechaCorta, nombreCompleto, PUESTOS } from './helpers.js'
import { nuevoPDF, partirTexto } from './pdf.js'
import { rankingPorPuesto, textoEdad } from './estadisticaTests.js'
import { conUnidad, semaforo, textoMedicion, velocidadMS } from './tests.js'

const AZUL = [26, 74, 158]
const AZUL_CLARO = [214, 226, 250]
const DORADO = [255, 210, 0]
const TEXTO = [28, 32, 40]
const SUAVE = [91, 98, 112]
const BORDE = [221, 225, 234]
const FONDO = [244, 246, 250]
const COLOR_SEM = { verde: [22, 163, 74], amarillo: [217, 119, 6], rojo: [220, 38, 38] }

const M = 40
const PIE = 60

const etiquetaPuesto = (f) => (f.puesto ? PUESTOS.find((p) => p.value === f.puesto)?.abrev : f.tipo === 'Forward' ? 'Fwd' : f.tipo || '—')

export function generarReporteTestsPDF({ resumen, generadoPor }) {
  const t = resumen.test
  const test = t.value
  const doc = nuevoPDF({
    titulo: `${t.label} ${resumen.desde} a ${resumen.hasta}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  const anchoUtil = doc.ancho - M * 2
  let y = 0

  // --- piezas de maquetado ---
  function portada() {
    doc.rect(0, 0, doc.ancho, 74, AZUL)
    doc.rect(0, 74, doc.ancho, 4, DORADO)
    doc.texto(`Reporte de ${t.label}`, M, 20, { tam: 17, negrita: true, color: [255, 255, 255] })
    doc.texto('Rugby M12 · Tucumán Lawn Tennis', M, 46, { tam: 9.5, color: AZUL_CLARO })
    doc.texto(`${fechaCorta(resumen.desde)} a ${fechaCorta(resumen.hasta)} · última medición de cada chico`,
      doc.ancho - M, 46, { tam: 9.5, color: AZUL_CLARO, alinear: 'der' })
    y = 100
  }
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
  function subtitulo(texto) {
    espacio(24)
    doc.texto(texto, M, y, { tam: 10, negrita: true, color: TEXTO })
    y += 15
  }
  function tarjetas(items) {
    const alto = 46
    espacio(alto + 12)
    const ancho = (anchoUtil - 8 * (items.length - 1)) / items.length
    items.forEach((it, i) => {
      const x = M + i * (ancho + 8)
      doc.rect(x, y, ancho, alto, FONDO)
      doc.rect(x, y, 3, alto, AZUL)
      doc.texto(it.valor, x + ancho / 2, y + 8, { tam: 14, negrita: true, color: TEXTO, alinear: 'centro' })
      doc.texto(it.etiqueta, x + ancho / 2, y + 29, { tam: 7.5, color: SUAVE, alinear: 'centro' })
    })
    y += alto + 16
  }
  function parrafo(texto, opciones = {}) {
    const tam = opciones.tam || 9
    for (const l of partirTexto(texto, anchoUtil, tam)) {
      espacio(tam + 4)
      doc.texto(l, M, y, { tam, color: opciones.color || TEXTO })
      y += tam + 3
    }
    y += 4
  }

  // Tabla de estadísticas por grupo: edad, línea o puesto
  const conRef = !!resumen.comparacion
  function tablaGrupos(columna, grupos) {
    const cols = [M, M + 110, M + 160, M + 260, M + 360, M + 470]
    espacio(16)
    const heads = [columna, 'Chicos', 'Promedio', 'Mediana', 'Mín – máx', conRef ? 'Ref.' : '']
    heads.forEach((h, i) => { if (h) doc.texto(h, cols[i], y, { tam: 8, negrita: true, color: SUAVE }) })
    y += 13
    for (const g of grupos) {
      espacio(14)
      const vals = [g.etiqueta, String(g.n), textoMedicion(test, g.promedio), textoMedicion(test, g.mediana),
        `${conUnidad(test, g.min)} – ${conUnidad(test, g.max)}`,
        conRef ? (g.percentilMediana != null ? `P${g.percentilMediana}` : '—') : '']
      vals.forEach((v, i) => { if (v) doc.texto(v, cols[i], y, { tam: 9, color: TEXTO }) })
      y += 13
    }
  }

  // Gráfico de barras horizontales. `items`: { etiqueta, valor, texto, color }.
  // La barra es proporcional a `valor` sobre el máximo; `texto` es lo que se
  // escribe al final de la barra. `marca` dibuja una línea vertical de
  // referencia (p. ej. el promedio del grupo).
  function barras(items, { anchoEtiqueta = 150, alto = 9, marca = null } = {}) {
    const max = Math.max(...items.map((i) => i.valor), marca?.valor || 0) || 1
    const x0 = M + anchoEtiqueta
    const anchoBarra = anchoUtil - anchoEtiqueta - 70
    const paso = alto + 4
    espacio(paso * Math.min(items.length, 3) + 10)
    const yInicio = y
    for (const it of items) {
      espacio(paso)
      doc.texto(it.etiqueta, x0 - 6, y, { tam: 8, color: TEXTO, alinear: 'der' })
      doc.rect(x0, y + 1, anchoBarra, alto - 2, FONDO)
      doc.rect(x0, y + 1, Math.max((it.valor / max) * anchoBarra, 1.5), alto - 2, it.color || AZUL)
      doc.texto(it.texto, x0 + anchoBarra + 6, y, { tam: 8, color: SUAVE })
      y += paso
    }
    if (marca && y - yInicio >= paso) {
      const xm = x0 + (marca.valor / max) * anchoBarra
      doc.linea(xm, yInicio - 2, xm, y - 2, SUAVE, 0.8)
      doc.texto(marca.etiqueta, xm, y, { tam: 7, color: SUAVE, alinear: 'centro' })
      y += 10
    }
    y += 8
  }

  // Lo que mide la barra: en velocidad, la velocidad media (más largo = más
  // rápido); en el resto, el valor tal cual
  const magnitud = (valor) => (test === 'velocidad_20m' ? velocidadMS(valor) || 0 : Number(valor))

  portada()

  // ---------- el grupo ----------
  titulo('El grupo')
  const g = resumen.grupo
  tarjetas([
    { valor: String(g.n), etiqueta: 'CHICOS MEDIDOS' },
    { valor: textoMedicion(test, g.promedio), etiqueta: 'PROMEDIO' },
    { valor: textoMedicion(test, g.mediana), etiqueta: 'MEDIANA' },
    { valor: `${conUnidad(test, g.min)} – ${conUnidad(test, g.max)}`, etiqueta: 'RANGO' },
  ])
  const sem = resumen.semaforos
  parrafo(`Semáforo: ${sem.verde} verde · ${sem.amarillo} amarillo · ${sem.rojo} rojo` +
    (sem.sin ? ` · ${sem.sin} sin color` : '') + '.')
  if (resumen.evolucion?.conAnterior) {
    const e = resumen.evolucion
    parrafo(`Respecto de su medición anterior: ${e.mejoraron} mejoraron, ${e.empeoraron} empeoraron, ${e.iguales} iguales (${e.conAnterior} con medición previa).`)
  }

  // Gráfico: una barra por chico, en el orden del ranking (o por valor)
  subtitulo(test === 'velocidad_20m' ? 'Cada chico, por velocidad media' : 'Cada chico')
  const porValor = t.mejor ? resumen.filas : [...resumen.filas].sort((a, b) => b.valor - a.valor)
  barras(porValor.map((f) => ({
    etiqueta: `${nombreCompleto(f)} · ${etiquetaPuesto(f)}`,
    valor: magnitud(f.valor),
    texto: textoMedicion(test, f.valor),
    color: f.semaforo ? COLOR_SEM[f.semaforo] : AZUL,
  })), { marca: { valor: magnitud(g.promedio), etiqueta: 'promedio' } })

  // ---------- por edad ----------
  if (resumen.porEdad.length) {
    titulo('Por edad')
    tablaGrupos('Edad', resumen.porEdad.map((e) => ({ etiqueta: `${e.edad} años`, ...e })))
    if (resumen.sinEdad) parrafo(`${resumen.sinEdad} sin fecha de nacimiento cargada: fuera de las comparaciones por edad.`, { color: SUAVE, tam: 8 })
    y += 6
  }

  // ---------- por línea y por puesto ----------
  if (resumen.porLinea.length || resumen.porPuesto.length) {
    titulo('Por línea y por puesto')
    if (resumen.porLinea.length) tablaGrupos('Línea', resumen.porLinea.map((x) => ({ etiqueta: x.label, ...x })))
    if (resumen.porPuesto.length) { y += 6; tablaGrupos('Puesto', resumen.porPuesto.map((x) => ({ etiqueta: x.plural, ...x }))) }
    if (resumen.sinLinea) parrafo(`${resumen.sinLinea} sin puestos cargados en la ficha.`, { color: SUAVE, tam: 8 })
    y += 6
    // Gráfico: promedio por puesto contra el promedio del grupo
    if (resumen.porPuesto.length >= 2) {
      subtitulo('Promedio por puesto principal')
      barras(resumen.porPuesto.map((x) => ({
        etiqueta: `${x.plural} (${x.n})`,
        valor: magnitud(x.promedio),
        texto: textoMedicion(test, x.promedio),
      })), { anchoEtiqueta: 120, marca: { valor: magnitud(g.promedio), etiqueta: 'promedio del grupo' } })
    }
  }

  // ---------- referencia ----------
  titulo('Contra la referencia por edad')
  const c = resumen.comparacion
  if (c) {
    const f = c.fuente
    parrafo(`Referencia: ${f.nombre}${f.organismo ? ` — ${f.organismo}` : ''}${f.anio ? `, ${f.anio}` : ''}.${f.poblacion ? ` ${f.poblacion}.` : ''}`, { color: SUAVE, tam: 8 })
    tarjetas([
      { valor: `P${c.percentilMediana}`, etiqueta: 'PERCENTIL MEDIANO' },
      { valor: String(c.bajoP25), etiqueta: 'POR DEBAJO DEL P25' },
      { valor: String(c.entreP25yP75), etiqueta: 'ENTRE P25 Y P75' },
      { valor: String(c.sobreP75), etiqueta: 'POR ENCIMA DEL P75' },
    ])
    // Gráfico: cuántos caen en cada tramo de la referencia
    subtitulo('Dónde cae el grupo en la referencia')
    barras([
      { etiqueta: 'Por debajo del P25', valor: c.bajoP25, texto: `${c.bajoP25}`, color: COLOR_SEM.rojo },
      { etiqueta: 'Entre P25 y P75', valor: c.entreP25yP75, texto: `${c.entreP25yP75}`, color: AZUL },
      { etiqueta: 'Por encima del P75', valor: c.sobreP75, texto: `${c.sobreP75}`, color: COLOR_SEM.verde },
    ], { anchoEtiqueta: 120, alto: 11 })
    if (resumen.medianaReferencia != null) {
      parrafo(`A la edad promedio del grupo (${textoEdad(resumen.edadPromedioMeses)}) la mediana de la referencia es ${conUnidad(test, resumen.medianaReferencia)}; el promedio del grupo es ${conUnidad(test, g.promedio)}.`)
    }
    parrafo(`La referencia es de varones y se lee con la edad exacta de cada chico el día de la medición.${test === 'peso' ? ' El peso se compara a través del IMC, con la talla tomada hasta 90 días antes o después.' : ''}${c.sinReferencia ? ` ${c.sinReferencia} sin comparar por falta de fecha de nacimiento${test === 'peso' ? ' o de talla cercana' : ''}.` : ''}`, { color: SUAVE, tam: 8 })
  } else {
    parrafo('Sin referencia externa cargada para este test: los números de arriba se leen solo dentro del grupo.', { color: SUAVE })
  }

  // ---------- rankings ----------
  const conPos = !!t.mejor
  const conImc = test === 'peso'

  // Una tabla de ranking: [#] Jugador · Puesto · Valor · [IMC] · Evolución · Ref.
  function tablaRanking(filas, { secundarios = false } = {}) {
    const cols = [M, M + 22, M + 200, M + 262, M + 345, M + 390, M + 470]
    espacio(16)
    const heads = [conPos ? '#' : '', 'Jugador', 'Puesto', t.abrev, conImc ? 'IMC' : '', 'Evolución', 'Ref.']
    heads.forEach((h, i) => { if (h) doc.texto(h, cols[i], y, { tam: 8, negrita: true, color: SUAVE }) })
    y += 13
    for (const f of filas) {
      espacio(15)
      const s = semaforo(f.semaforo)
      if (conPos) doc.texto(String(f.posicion), cols[0], y, { tam: 9, negrita: true, color: TEXTO })
      doc.texto(`${nombreCompleto(f)}${secundarios && f.secundario ? ' (sec.)' : ''}`, cols[1], y, { tam: 9, color: TEXTO })
      doc.texto(etiquetaPuesto(f), cols[2], y, { tam: 8.5, color: SUAVE })
      doc.texto(textoMedicion(test, f.valor), cols[3], y, { tam: test === 'velocidad_20m' ? 8 : 9, negrita: true, color: s ? COLOR_SEM[s.value] : TEXTO })
      if (conImc) doc.texto(f.imc != null ? String(f.imc) : '—', cols[4], y, { tam: 8.5, color: TEXTO })
      // Sin flechas: ▲▼ no existen en la codificación del PDF; el color alcanza
      doc.texto(f.diferencia || (f.anterior ? '=' : '—'),
        cols[5], y, { tam: 8.5, color: f.progreso === 'sube' ? COLOR_SEM.verde : f.progreso === 'baja' ? COLOR_SEM.rojo : SUAVE })
      doc.texto(f.referencia ? `P${f.referencia.percentil}` : '—', cols[6], y, { tam: 8.5, color: TEXTO })
      y += 13
      doc.linea(M, y - 3, doc.ancho - M, y - 3, BORDE, 0.4)
    }
  }

  titulo(conPos ? 'Ranking general' : 'Listado general')
  parrafo('Puesto: el principal de cada chico, según su ficha.', { color: SUAVE, tam: 8 })
  tablaRanking(resumen.filas)

  const porPuesto = rankingPorPuesto(resumen)
  if (porPuesto.length) {
    y += 10
    titulo(conPos ? 'Ranking por puesto' : 'Listado por puesto')
    parrafo('En cada puesto entran todos los que pueden jugar ahí, sea su puesto principal o uno secundario; "(sec.)" marca a los que tienen otro puesto como principal.', { color: SUAVE, tam: 8 })
    for (const grupo of porPuesto) {
      y += 4
      subtitulo(`${grupo.plural} (${grupo.filas.length})`)
      tablaRanking(grupo.filas, { secundarios: true })
    }
  }

  // ---------- pie ----------
  const hoy = fechaCorta(new Date().toISOString().slice(0, 10))
  const total = doc.paginas
  for (let i = 0; i < total; i++) {
    doc.enPagina(i, () => {
      doc.linea(M, doc.alto - 42, doc.ancho - M, doc.alto - 42, BORDE, 0.5)
      doc.texto(`Rugby M12 · Tucumán Lawn Tennis · generado el ${hoy}${generadoPor ? ` por ${generadoPor}` : ''}`, M, doc.alto - 36, { tam: 7.5, color: SUAVE })
      doc.texto(`${i + 1} de ${total}`, doc.ancho - M, doc.alto - 36, { tam: 7.5, color: SUAVE, alinear: 'der' })
    })
  }
  return doc
}

export function nombreReporteTests(test, desde, hasta) {
  return `reporte-${test}-${desde}-a-${hasta}.pdf`
}
