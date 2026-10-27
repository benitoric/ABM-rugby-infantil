// Reporte en PDF de un test físico: el mismo resumen que la pantalla, en
// hoja A4 para mandar al cuerpo técnico. Usa el generador propio (src/pdf.js).

import { fechaCorta, nombreCompleto } from './helpers.js'
import { nuevoPDF, partirTexto } from './pdf.js'
import { textoEdad } from './estadisticaTests.js'
import { conUnidad, semaforo } from './tests.js'

const AZUL = [26, 74, 158]
const DORADO = [255, 210, 0]
const TEXTO = [28, 32, 40]
const SUAVE = [91, 98, 112]
const BORDE = [221, 225, 234]
const COLOR_SEM = { verde: [22, 163, 74], amarillo: [217, 119, 6], rojo: [220, 38, 38] }

const M = 40
const PIE = 60

export function generarReporteTestsPDF({ resumen, generadoPor }) {
  const t = resumen.test
  const doc = nuevoPDF({
    titulo: `${t.label} ${resumen.desde} a ${resumen.hasta}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  const anchoUtil = doc.ancho - M * 2
  let y = 0

  function portada() {
    doc.rect(0, 0, doc.ancho, 74, AZUL)
    doc.rect(0, 74, doc.ancho, 4, DORADO)
    doc.texto(`Reporte de ${t.label}`, M, 20, { tam: 17, negrita: true, color: [255, 255, 255] })
    doc.texto('Rugby M12 · Tucumán Lawn Tennis', M, 46, { tam: 9.5, color: [214, 226, 250] })
    doc.texto(`${fechaCorta(resumen.desde)} a ${fechaCorta(resumen.hasta)} · última medición de cada chico`,
      doc.ancho - M, 46, { tam: 9.5, color: [214, 226, 250], alinear: 'der' })
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
  function tarjetas(items) {
    const alto = 46
    espacio(alto + 12)
    const ancho = (anchoUtil - 8 * (items.length - 1)) / items.length
    items.forEach((it, i) => {
      const x = M + i * (ancho + 8)
      doc.rect(x, y, ancho, alto, [244, 246, 250])
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

  portada()

  // --- resumen ---
  titulo('El grupo')
  const g = resumen.grupo
  tarjetas([
    { valor: String(g.n), etiqueta: 'CHICOS MEDIDOS' },
    { valor: conUnidad(t.value, g.promedio), etiqueta: 'PROMEDIO' },
    { valor: conUnidad(t.value, g.mediana), etiqueta: 'MEDIANA' },
    { valor: `${conUnidad(t.value, g.min)} – ${conUnidad(t.value, g.max)}`, etiqueta: 'RANGO' },
  ])
  const sem = resumen.semaforos
  parrafo(`Semáforo: ${sem.verde} verde · ${sem.amarillo} amarillo · ${sem.rojo} rojo` +
    (sem.sin ? ` · ${sem.sin} sin color` : '') + '.')
  if (resumen.evolucion?.conAnterior) {
    const e = resumen.evolucion
    parrafo(`Respecto de su medición anterior: ${e.mejoraron} mejoraron, ${e.empeoraron} empeoraron, ${e.iguales} iguales (${e.conAnterior} con medición previa).`)
  }

  // --- por edad ---
  if (resumen.porEdad.length) {
    titulo('Por edad')
    const cols = [M, M + 90, M + 160, M + 260, M + 360]
    espacio(16)
    for (const [i, h] of ['Edad', 'Chicos', 'Promedio', 'Mediana', 'Mín – máx'].entries()) {
      doc.texto(h, cols[i], y, { tam: 8, negrita: true, color: SUAVE })
    }
    y += 13
    for (const e of resumen.porEdad) {
      espacio(14)
      const vals = [`${e.edad} años`, String(e.n), conUnidad(t.value, e.promedio), conUnidad(t.value, e.mediana),
        `${conUnidad(t.value, e.min)} – ${conUnidad(t.value, e.max)}`]
      vals.forEach((v, i) => doc.texto(v, cols[i], y, { tam: 9, color: TEXTO }))
      y += 13
    }
    if (resumen.sinEdad) parrafo(`${resumen.sinEdad} sin fecha de nacimiento cargada: fuera de las comparaciones por edad.`, { color: SUAVE, tam: 8 })
    y += 6
  }

  // --- referencia ---
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
    if (resumen.medianaReferencia != null) {
      parrafo(`A la edad promedio del grupo (${textoEdad(resumen.edadPromedioMeses)}) la mediana de la referencia es ${conUnidad(t.value, resumen.medianaReferencia)}; el promedio del grupo es ${conUnidad(t.value, g.promedio)}.`)
    }
    parrafo(`La referencia es de varones y se lee con la edad exacta de cada chico el día de la medición.${t.value === 'peso' ? ' El peso se compara a través del IMC, con la talla tomada hasta 90 días antes o después.' : ''}${c.sinReferencia ? ` ${c.sinReferencia} sin comparar por falta de fecha de nacimiento${t.value === 'peso' ? ' o de talla cercana' : ''}.` : ''}`, { color: SUAVE, tam: 8 })
  } else {
    parrafo('Sin referencia externa cargada para este test: los números de arriba se leen solo dentro del grupo.', { color: SUAVE })
  }

  // --- ranking ---
  titulo(t.mejor ? 'Ranking' : 'Listado')
  const conPos = !!t.mejor
  const conImc = t.value === 'peso'
  const cols = conPos ? [M, M + 24, M + 190, M + 250, M + 320, M + 360, M + 440] : [M, M, M + 190, M + 250, M + 320, M + 360, M + 440]
  espacio(16)
  const heads = ['#', 'Jugador', 'Edad', t.abrev, conImc ? 'IMC' : '', 'Evolución', 'Ref.']
  heads.forEach((h, i) => { if (h && (i !== 0 || conPos)) doc.texto(h, cols[i], y, { tam: 8, negrita: true, color: SUAVE }) })
  y += 13
  for (const f of resumen.filas) {
    espacio(15)
    const s = semaforo(f.semaforo)
    if (conPos) doc.texto(String(f.posicion), cols[0], y, { tam: 9, negrita: true, color: TEXTO })
    doc.texto(nombreCompleto(f), cols[1], y, { tam: 9, color: TEXTO })
    // La columna es angosta: sin fecha de nacimiento va una raya, no la frase
    doc.texto(f.edadMeses == null ? '—' : textoEdad(f.edadMeses), cols[2], y, { tam: 8.5, color: SUAVE })
    doc.texto(conUnidad(t.value, f.valor), cols[3], y, { tam: 9, negrita: true, color: s ? COLOR_SEM[s.value] : TEXTO })
    if (conImc) doc.texto(f.imc != null ? String(f.imc) : '—', cols[4], y, { tam: 8.5, color: TEXTO })
    doc.texto(f.diferencia ? `${f.diferencia}${f.progreso === 'sube' ? ' ▲' : f.progreso === 'baja' ? ' ▼' : ''}` : (f.anterior ? '=' : '—'),
      cols[5], y, { tam: 8.5, color: f.progreso === 'sube' ? COLOR_SEM.verde : f.progreso === 'baja' ? COLOR_SEM.rojo : SUAVE })
    doc.texto(f.referencia ? `P${f.referencia.percentil}` : '—', cols[6], y, { tam: 8.5, color: TEXTO })
    y += 13
    doc.linea(M, y - 3, doc.ancho - M, y - 3, BORDE, 0.4)
  }

  // pie
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
