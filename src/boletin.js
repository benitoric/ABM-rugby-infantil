// Boletín mensual de desempeño: textos y armado del PDF.
//
// La hoja está escrita para el propio jugador, de vos. No lleva nada de las
// evaluaciones periódicas ni de los tests físicos: solo asistencia y rugby
// jugado. Entra entera en una carilla A4.

import { anchoTexto, nuevoPDF, partirTexto } from './pdf.js'
import { PUESTOS } from './helpers.js'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago',
  'Sep', 'Oct', 'Nov', 'Dic']
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export const nombreDelMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} de ${a}`
}
export const tituloDelMes = (mes) => {
  const t = nombreDelMes(mes)
  return t.charAt(0).toUpperCase() + t.slice(1)
}
export const mesCorto = (mes) => MESES_CORTOS[Number(mes.split('-')[1]) - 1]

// "sáb 15/8" — la fecha viene 'YYYY-MM-DD' y se arma sin zona horaria
export function diaCorto(fecha) {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_SEMANA[new Date(a, m - 1, d).getDay()]} ${d}/${m}`
}

export function mesSiguiente(mes) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export const nombreCortoDelMes = (mes) => MESES[Number(mes.split('-')[1]) - 1]

export const mesActual = () => new Date().toISOString().slice(0, 7)
export function mesAnterior(mes = mesActual()) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Últimos N meses hasta el actual, del más nuevo al más viejo
export function ultimosMeses(cantidad = 12) {
  const hoy = new Date()
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export const nombreDelJugador = (b) => `${b.jugador.nombre} ${b.jugador.apellido}`

export function puestosDelJugador(b) {
  const propios = b.jugador.puestos || []
  const nombre = (v) => PUESTOS.find((p) => p.value === v)?.label || v
  const principal = propios.length === 1 ? propios[0]
    : (propios.includes(b.jugador.puesto_principal) ? b.jugador.puesto_principal : null)
  const otros = propios.filter((v) => v !== principal).map(nombre)
  return { principal: principal ? nombre(principal) : null, otros }
}

// Aclaración de los eventos que no cuentan porque se los perdió lesionado
export function textoLesion(b) {
  const perdidos = b.asistencia.excluidos_por_lesion
  if (!perdidos) return null
  const l = b.lesiones[0]
  const que = perdidos === 1 ? 'El evento que te perdiste esos días no te cuenta'
    : `Los ${perdidos} eventos que te perdiste esos días no te cuentan`
  const total = b.asistencia.contables + perdidos
  return (l ? `Estuviste afuera por ${l.descripcion.toLowerCase()}. ` : '') +
    `${que} como falta: tus porcentajes salen sobre ${b.asistencia.contables} ` +
    `${b.asistencia.contables === 1 ? 'evento' : 'eventos'} y no sobre ${total}.`
}

// Diferencia contra el promedio de la división, en puntos
export function contraElPromedio(b, promedio) {
  if (b.asistencia.total == null || promedio == null) return null
  const d = b.asistencia.total - promedio
  if (d === 0) return 'Justo en el promedio de la división'
  return d > 0
    ? `+${d} ${d === 1 ? 'punto' : 'puntos'} por encima del promedio`
    : `${d} ${d === -1 ? 'punto' : 'puntos'} por debajo del promedio`
}

// Cierre de la hoja: sale de los números del mes, sin inventar nada
export function mensajeDelMes(b, division) {
  const a = b.asistencia
  const partes = []
  if (b.lesiones.length && b.juego.partidos_jugados > 0) {
    partes.push('Volviste de la lesión y jugaste igual.')
  }
  if (a.total === 100) partes.push('Mes perfecto: no faltaste a nada.')
  else if (b.progreso != null && b.progreso > 0) {
    partes.push(`Mejoraste ${b.progreso} ${b.progreso === 1 ? 'punto' : 'puntos'} contra el mes pasado.`)
  } else if (b.progreso != null && b.progreso < 0) {
    partes.push('Este mes bajaste un poco: se recupera yendo.')
  }
  if (a.total != null && division?.promedio != null && a.total > division.promedio) {
    partes.push('Estás por encima del promedio de la división.')
  }
  if (a.partidos === 100 && a.partidos_contables > 0) {
    partes.push('En los partidos estuviste siempre.')
  }
  if (!partes.length) partes.push('Te esperamos en la cancha el mes que viene.')
  return partes.slice(0, 3).join(' ')
}

// ---------------------------------------------------------------- PDF ------

const AZUL = [26, 74, 158]
const AZUL_CLARO = [227, 236, 251]
const AZUL_PALIDO = [204, 216, 238]
const DORADO = [255, 210, 0]
const DORADO_FONDO = [255, 246, 204]
const DORADO_BORDE = [240, 221, 138]
const DORADO_TEXTO = [74, 60, 0]
const TINTA = [20, 27, 43]
const GRIS = [93, 102, 120]
const BORDE = [219, 225, 236]
const LINEA_SUAVE = [239, 242, 247]
const VERDE = [21, 127, 75]
const AMBAR = [184, 113, 10]
const AMBAR_FONDO = [253, 244, 227]
const AMBAR_TEXTO = [122, 76, 5]
const ROJO = [192, 57, 47]
const BLANCO = [255, 255, 255]

const M = 34 // margen lateral

export function generarBoletinPDF({ mes, division, jugadores, generadoPor }) {
  const doc = nuevoPDF({
    titulo: `Boletín ${tituloDelMes(mes)}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  // El documento arranca con una hoja hecha: la siguiente se abre recién al
  // pasar al jugador que sigue, para no dejar una en blanco al principio.
  jugadores.forEach((b, i) => {
    if (i) doc.nuevaPagina()
    hoja(doc, b, { mes, division, generadoPor })
  })
  return new Blob([doc.bytes()], { type: 'application/pdf' })
}

export const nombreArchivoBoletin = (mes, b = null) =>
  b ? `boletin-${mes}-${b.jugador.apellido}-${b.jugador.nombre}.pdf`
        .toLowerCase().replace(/[^a-z0-9.-]+/g, '-')
    : `boletines-${mes}.pdf`

function hoja(doc, b, { mes, division, generadoPor }) {
  const ancho = doc.ancho - M * 2
  const der = doc.ancho - M

  // --- cabecera ---
  doc.rect(0, 0, doc.ancho, 56, AZUL)
  doc.rect(0, 56, doc.ancho, 3, DORADO)
  doc.texto('BOLETÍN DEL MES', M, 12, { tam: 7, negrita: true, color: DORADO })
  doc.texto(tituloDelMes(mes), M, 23, { tam: 19, negrita: true, color: BLANCO })
  doc.texto('Rugby M12 · Tucumán Lawn Tennis', der, 41, {
    tam: 8.5, color: [207, 220, 245], alinear: 'der',
  })

  let y = 76

  // --- nombre y puestos ---
  doc.texto(nombreDelJugador(b), M, y, { tam: 16, negrita: true, color: TINTA })
  const { principal, otros } = puestosDelJugador(b)
  const etiquetas = [principal, otros.length ? `también: ${otros.join(', ')}` : null]
    .filter(Boolean).join('   ·   ')
  if (etiquetas) doc.texto(etiquetas, der, y + 5, { tam: 8.5, color: GRIS, alinear: 'der' })
  y += 24

  // --- nota de la lesión ---
  const lesion = textoLesion(b)
  if (lesion) {
    const lineas = partirTexto(lesion, ancho - 16, 8)
    const alto = lineas.length * 10 + 10
    doc.rect(M, y, ancho, alto, AMBAR_FONDO)
    doc.rect(M, y, 2.5, alto, AMBAR)
    lineas.forEach((l, i) => doc.texto(l, M + 10, y + 6 + i * 10, { tam: 8, color: AMBAR_TEXTO }))
    y += alto + 12
  }

  // --- tablero de números ---
  y = titulo(doc, 'Tu asistencia en ' + MESES[Number(mes.split('-')[1]) - 1], M, y, ancho)
  const a = b.asistencia
  const cajas = [
    { valor: porcentaje(a.total), rotulo: 'Asistencia total', detalle: `Fuiste a ${a.presentes} de ${a.contables}` },
    { valor: porcentaje(a.entrenamientos), rotulo: 'Entrenamientos', detalle: `${a.entrenamientos_presentes} de ${a.entrenamientos_contables}` },
    { valor: porcentaje(a.partidos), rotulo: 'Partidos', detalle: `${a.partidos_presentes} de ${a.partidos_contables}` },
    b.puesto_ranking
      ? { valor: `${b.puesto_ranking}.º`, rotulo: 'En la división', detalle: `entre ${b.de_cuantos} jugadores`, destacado: true }
      : { valor: '—', rotulo: 'En la división', detalle: 'mes con pocos eventos', destacado: true },
  ]
  const anchoCaja = (ancho - 3 * 7) / 4
  cajas.forEach((c, i) => {
    const x = M + i * (anchoCaja + 7)
    doc.rect(x, y, anchoCaja, 2.5, c.destacado ? DORADO : AZUL)
    marco(doc, x, y, anchoCaja, 44)
    doc.texto(c.valor, x + 8, y + 9, { tam: 19, negrita: true, color: c.destacado ? TINTA : AZUL })
    doc.texto(c.rotulo.toUpperCase(), x + 8, y + 29, { tam: 6.5, negrita: true, color: GRIS })
    doc.texto(c.detalle, x + 8, y + 36, { tam: 7.5, color: GRIS })
  })
  y += 44 + 14

  // --- comparación con la división y evolución, en dos columnas ---
  const media = (ancho - 20) / 2
  const xDer = M + media + 20
  const yInicio = y
  let yIzq = titulo(doc, 'Vos y el resto de la M12', M, y, media)
  yIzq = barra(doc, M, yIzq, media, 'Vos, en ' + MESES[Number(mes.split('-')[1]) - 1], a.total, AZUL, true)
  yIzq = barra(doc, M, yIzq + 6, media, 'Promedio de la división', division.promedio, AZUL_PALIDO, false)
  const dif = contraElPromedio(b, division.promedio)
  if (dif) {
    doc.texto(dif, M, yIzq + 10, {
      tam: 8.5, negrita: true,
      color: a.total >= division.promedio ? VERDE : AMBAR,
    })
    yIzq += 13
  }
  if (b.anio.total != null) {
    const texto = `En el año: vos ${b.anio.total}%, la división ${b.anio.promedio_division}%.` +
      (b.anio.puesto ? ` Vas ${b.anio.puesto}.º de ${b.anio.de_cuantos}.` : '')
    partirTexto(texto, media, 8).forEach((l, i) => {
      doc.texto(l, M, yIzq + 10 + i * 10, { tam: 8, color: GRIS })
    })
    yIzq += 10 + partirTexto(texto, media, 8).length * 10
  }

  let yDerCol = titulo(doc, 'Cómo venís mes a mes', xDer, yInicio, media)
  yDerCol = evolucion(doc, xDer, yDerCol, media, b.evolucion, mes)
  y = Math.max(yIzq, yDerCol) + 14

  // --- distinciones ---
  if (b.distinciones.length) {
    y = titulo(doc, 'Lo que te ganaste', M, y, ancho)
    y = medallas(doc, M, y, ancho, b.distinciones)
    y += 14
  }

  // --- rugby jugado y puntualidad ---
  const yFilas = y
  let yA = titulo(doc, 'Tu rugby de este mes', M, y, media)
  yA = lista(doc, M, yA, media, filasDeJuego(b))
  let yB = titulo(doc, 'Puntualidad y avisos', xDer, yFilas, media)
  yB = lista(doc, xDer, yB, media, filasDePuntualidad(b))
  y = Math.max(yA, yB) + 14

  // --- día por día, en dos columnas ---
  y = titulo(doc, 'Día por día', M, y, ancho)
  const mitad = Math.ceil(b.dias.length / 2)
  const yTabla = y
  const yT1 = agenda(doc, M, yTabla, media, b.dias.slice(0, mitad))
  const yT2 = agenda(doc, xDer, yTabla, media, b.dias.slice(mitad))
  y = Math.max(yT1, yT2) + 14

  // --- para sumar el mes que viene ---
  // Salen de la última evaluación, pero acá llega solo la frase: la hoja no
  // dice notas ni áreas, y el tono es de invitación.
  if (b.objetivos?.length && y < doc.alto - 134) {
    y = titulo(doc, `Para sumar en ${nombreCortoDelMes(mesSiguiente(mes))}`, M, y, ancho)
    for (const o of b.objetivos) {
      doc.rect(M + 1, y + 1, 4, 4, DORADO)
      const lineas = partirTexto(o.texto, ancho - 14, 9)
      lineas.forEach((l, i) => doc.texto(l, M + 12, y + i * 11, { tam: 9, color: TINTA }))
      y += lineas.length * 11 + 5
    }
  }

  // --- pie ---
  const pie = doc.alto - 74
  doc.rect(M, pie, ancho, 1.6, AZUL)
  const mensaje = mensajeDelMes(b, division)
  partirTexto(mensaje, ancho, 9.5).forEach((l, i) => {
    doc.texto(l, M, pie + 10 + i * 12, { tam: 9.5, color: TINTA })
  })
  doc.texto(`Generado el ${new Date().toLocaleDateString('es-AR')}` +
    (generadoPor ? ` por ${generadoPor}` : ''), M, doc.alto - 32, { tam: 7, color: GRIS })
  doc.texto('Rugby M12 · Tucumán Lawn Tennis', der, doc.alto - 32, {
    tam: 7, color: GRIS, alinear: 'der',
  })
}

const porcentaje = (v) => (v == null ? '—' : `${v}%`)

function marco(doc, x, y, ancho, alto) {
  doc.linea(x, y, x + ancho, y, BORDE, 0.6)
  doc.linea(x, y + alto, x + ancho, y + alto, BORDE, 0.6)
  doc.linea(x, y, x, y + alto, BORDE, 0.6)
  doc.linea(x + ancho, y, x + ancho, y + alto, BORDE, 0.6)
}

// Rótulo de sección con su línea; devuelve la y donde sigue el contenido
function titulo(doc, texto, x, y, ancho) {
  doc.texto(texto.toUpperCase(), x, y, { tam: 7, negrita: true, color: GRIS })
  doc.linea(x, y + 11, x + ancho, y + 11, BORDE, 0.6)
  return y + 19
}

function barra(doc, x, y, ancho, rotulo, valor, color, negrita) {
  doc.texto(rotulo, x, y, { tam: 8.5, negrita, color: negrita ? TINTA : GRIS })
  const yBarra = y + 12
  const anchoPista = ancho - 34
  doc.rect(x, yBarra, anchoPista, 11, LINEA_SUAVE)
  if (valor != null) doc.rect(x, yBarra, (anchoPista * valor) / 100, 11, color)
  doc.texto(porcentaje(valor), x + ancho, yBarra + 8.5, {
    tam: 9, negrita: true, color: TINTA, alinear: 'der',
  })
  return yBarra + 11
}

function evolucion(doc, x, y, ancho, serie, mesActualDelBoletin) {
  const alto = 46
  const paso = ancho / serie.length
  const base = y + 12 + alto
  serie.forEach((m, i) => {
    const centro = x + paso * i + paso / 2
    const propio = m.jugador
    const div = m.division
    const esActual = m.mes === mesActualDelBoletin
    if (propio != null) {
      doc.texto(`${propio}%`, centro, y, { tam: 7, negrita: true, color: TINTA, alinear: 'centro' })
      const h = Math.max(2, (alto * propio) / 100)
      doc.rect(centro - 9, base - h, 8, h, esActual ? DORADO : AZUL)
    }
    if (div != null) {
      const h = Math.max(2, (alto * div) / 100)
      doc.rect(centro + 1, base - h, 8, h, AZUL_PALIDO)
    }
    doc.texto(mesCorto(m.mes).toUpperCase(), centro, base + 3, {
      tam: 6.5, color: GRIS, alinear: 'centro',
    })
  })
  const yLeyenda = base + 15
  doc.rect(x, yLeyenda, 7, 7, AZUL)
  doc.texto('Vos', x + 11, yLeyenda, { tam: 7, color: GRIS })
  doc.rect(x + 30, yLeyenda, 7, 7, AZUL_PALIDO)
  doc.texto('Promedio de la división', x + 41, yLeyenda, { tam: 7, color: GRIS })
  return yLeyenda + 9
}

function medallas(doc, x, y, ancho, lista) {
  let cx = x
  let cy = y
  const alto = 24
  for (const d of lista) {
    const anchoMarca = Math.max(20, anchoTexto(d.marca, 9.5, true) + 12)
    const anchoCuerpo = Math.max(
      anchoTexto(d.titulo, 8.5, true), anchoTexto(d.detalle, 7, false)) + 14
    const total = anchoMarca + anchoCuerpo
    if (cx + total > x + ancho) { cx = x; cy += alto + 6 }
    doc.rect(cx, cy, total, alto, DORADO_FONDO)
    doc.rect(cx, cy, anchoMarca, alto, DORADO)
    marco(doc, cx, cy, total, alto)
    doc.texto(d.marca, cx + anchoMarca / 2, cy + 8, {
      tam: 9.5, negrita: true, color: DORADO_TEXTO, alinear: 'centro',
    })
    doc.texto(d.titulo, cx + anchoMarca + 7, cy + 6, { tam: 8.5, negrita: true, color: TINTA })
    doc.texto(d.detalle, cx + anchoMarca + 7, cy + 15, { tam: 7, color: [122, 106, 37] })
    cx += total + 6
  }
  return cy + alto
}

function lista(doc, x, y, ancho, filas) {
  filas.forEach((f, i) => {
    const yf = y + i * 12
    doc.texto(f[0], x, yf, { tam: 8.5, color: GRIS })
    doc.texto(f[1], x + ancho, yf, { tam: 8.5, negrita: true, color: TINTA, alinear: 'der' })
  })
  return y + filas.length * 12
}

function filasDeJuego(b) {
  const j = b.juego
  const camisetas = j.camisetas.length
    ? j.camisetas.map((c) => `${c.puesto} (${c.tiempos})`).join(' · ')
    : '—'
  return [
    ['Partidos jugados', String(j.partidos_jugados)],
    ['Tiempos en cancha', j.tiempos_posibles ? `${j.tiempos_jugados} de ${j.tiempos_posibles}` : String(j.tiempos_jugados)],
    ['Camisetas que usaste', camisetas],
    ['Jugaste prestado al rival', j.prestado === 0 ? 'ninguna vez'
      : j.prestado === 1 ? '1 vez' : `${j.prestado} veces`],
    ['Veces capitán en el año', String(j.capitanias_anio)],
  ]
}

function filasDePuntualidad(b) {
  const p = b.puntualidad
  const fechas = (lista) => lista.map((f) => diaCorto(f.fecha || f)).join(' · ')
  return [
    ['Llegadas tarde', p.tarde.length ? `${p.tarde.length} · ${fechas(p.tarde)}` : 'ninguna'],
    ['Dijiste que ibas al partido y no fuiste',
      p.falto_avisando.length ? `${p.falto_avisando.length} · ${fechas(p.falto_avisando)}` : 'ninguna vez'],
    ['Golpes en el mes', p.golpes.length ? `${p.golpes.length} · ${fechas(p.golpes)}` : 'ninguno'],
  ]
}

function agenda(doc, x, y, ancho, dias) {
  doc.texto('FECHA', x, y, { tam: 6.5, negrita: true, color: GRIS })
  doc.texto('QUÉ HUBO', x + 48, y, { tam: 6.5, negrita: true, color: GRIS })
  doc.texto('¿FUISTE?', x + ancho, y, { tam: 6.5, negrita: true, color: GRIS, alinear: 'der' })
  doc.linea(x, y + 9, x + ancho, y + 9, BORDE, 0.6)
  let yf = y + 18
  for (const d of dias) {
    const marca = d.excluido ? ['Lesión', GRIS] : d.presente ? ['Sí', VERDE] : ['No', ROJO]
    doc.texto(diaCorto(d.fecha), x, yf, { tam: 7.5, color: TINTA })
    const que = d.tipo === 'partido' ? `Partido${d.rival ? ` vs ${d.rival}` : ''}` : 'Entrenamiento'
    doc.texto(recortar(que, ancho - 92, 7.5), x + 48, yf, { tam: 7.5, color: TINTA })
    doc.texto(marca[0], x + ancho, yf, { tam: 7.5, negrita: true, color: marca[1], alinear: 'der' })
    const apuntes = []
    if (d.tarde) apuntes.push('llegaste tarde')
    if (d.falto_avisando) apuntes.push('habías avisado que ibas')
    if (d.capitan) apuntes.push('capitán')
    if (d.tiempos) apuntes.push(`${d.tiempos} ${d.tiempos === 1 ? 'tiempo' : 'tiempos'}`)
    if (apuntes.length) {
      doc.texto(recortar(apuntes.join(' · '), ancho - 92, 6.5), x + 48, yf + 8, {
        tam: 6.5, color: d.tarde || d.falto_avisando ? AMBAR : GRIS,
      })
      yf += 8
    }
    doc.linea(x, yf + 9, x + ancho, yf + 9, LINEA_SUAVE, 0.5)
    yf += 16
  }
  return yf
}

function recortar(texto, ancho, tam) {
  const linea = partirTexto(texto, ancho, tam)[0]
  return linea === texto ? texto : `${linea}…`
}
