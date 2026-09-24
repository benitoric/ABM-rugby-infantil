// Informe de alojados de una gira, en PDF: todo lo que muestra la vista
// Alojados del viaje, para mandárselo al club anfitrión y llevarlo impreso.
// Cabecera con los datos del viaje y el staff que va, una sección por casa
// (familia que recibe, teléfono, dirección, notas y los chicos con el
// contacto del tutor y sus observaciones) y, al final, los que todavía no
// tienen casa. Usa el generador propio de src/pdf.js, como el boletín.

import { nuevoPDF, partirTexto } from './pdf.js'
import {
  fechaCorta, fechasViaje, nombreCompleto, nombreStaff, papelesCompletos, PAPELES_VIAJE,
} from './helpers.js'

const AZUL = [26, 74, 158]
const AZUL_CLARO = [227, 236, 251]
const DORADO = [255, 210, 0]
const TINTA = [20, 27, 43]
const GRIS = [93, 102, 120]
const BORDE = [219, 225, 236]
const AMBAR = [184, 113, 10]
const AMBAR_FONDO = [253, 244, 227]
const AMBAR_TEXTO = [122, 76, 5]
const BLANCO = [255, 255, 255]
const VERDE = [22, 163, 74]
const VERDE_FONDO = [220, 252, 231]
const VERDE_TEXTO = [21, 128, 61]
const ROJO_FONDO = [254, 226, 226]
const ROJO_TEXTO = [185, 28, 28]

const M = 34 // margen lateral
const ALTO_CABECERA = 56
const PIE = 30 // reserva al pie para el número de página

export const nombreArchivoAlojados = (viaje) =>
  `alojados-${viaje.nombre}.pdf`.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.-]+/g, '-')

export const nombreArchivoPapeles = (viaje) =>
  `papeles-${viaje.nombre}.pdf`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.-]+/g, '-')

// Franja azul de arriba de cada hoja, común a los informes del viaje
function cabeceraHoja(doc, viaje, rotulo, continuacion) {
  const der = doc.ancho - M
  doc.rect(0, 0, doc.ancho, ALTO_CABECERA, AZUL)
  doc.rect(0, ALTO_CABECERA, doc.ancho, 3, DORADO)
  doc.texto(rotulo, M, 12, { tam: 7, negrita: true, color: DORADO })
  doc.texto(viaje.nombre, M, 23, { tam: 19, negrita: true, color: BLANCO })
  doc.texto('Rugby M12 · Tucumán Lawn Tennis', der, 41, {
    tam: 8.5, color: [207, 220, 245], alinear: 'der',
  })
  if (continuacion) {
    doc.texto('(continuación)', der, 14, { tam: 7.5, color: [207, 220, 245], alinear: 'der' })
  }
}

// Pie con la fecha de generación y "Hoja N de M", recién cuando se sabe
// cuántas hojas son
function pieDeHojas(doc, generadoPor) {
  const der = doc.ancho - M
  const total = doc.paginas
  const generado = `Generado el ${new Date().toLocaleDateString('es-AR')}` +
    (generadoPor ? ` por ${generadoPor}` : '')
  for (let i = 0; i < total; i++) {
    doc.enPagina(i, () => {
      doc.linea(M, doc.alto - 24, der, doc.alto - 24, BORDE, 0.6)
      doc.texto(generado, M, doc.alto - 19, { tam: 7, color: GRIS })
      doc.texto(`Hoja ${i + 1} de ${total}`, der, doc.alto - 19, { tam: 7, color: GRIS, alinear: 'der' })
    })
  }
}

// Listado de los chicos del viaje con cada requisito cumplido o no (los
// papeles del checklist de Managers, sin el pago). Una fila por chico con el
// tutor y su teléfono, y una columna por papel con Sí/No en color. Arriba,
// cuántos tienen cada papel y cuántos están completos.
export function generarPapelesPDF({ viaje, jugadores, generadoPor }) {
  const doc = nuevoPDF({
    titulo: `Papeles · ${viaje.nombre}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  const ancho = doc.ancho - M * 2
  const der = doc.ancho - M
  const limite = doc.alto - PIE
  const papeles = PAPELES_VIAJE
  const ANCHO_PAPEL = 68
  const ANCHO_COMPLETO = 58
  const xPapeles = der - ANCHO_COMPLETO - ANCHO_PAPEL * papeles.length

  let y = 0
  function encabezadoTabla() {
    doc.rect(M, y, ancho, 18, AZUL_CLARO)
    doc.texto('JUGADOR · TUTOR', M + 6, y + 6, { tam: 7, negrita: true, color: GRIS })
    papeles.forEach((p, i) => {
      doc.texto(p.abrev.toUpperCase(), xPapeles + i * ANCHO_PAPEL + ANCHO_PAPEL / 2, y + 6,
        { tam: 6.5, negrita: true, color: GRIS, alinear: 'centro' })
    })
    doc.texto('COMPLETO', der - ANCHO_COMPLETO / 2, y + 6, { tam: 6.5, negrita: true, color: GRIS, alinear: 'centro' })
    y += 22
  }
  function nuevaHoja(primera) {
    if (!primera) doc.nuevaPagina()
    cabeceraHoja(doc, viaje, 'PAPELES DE LA GIRA', !primera)
    y = ALTO_CABECERA + 20
    if (!primera) encabezadoTabla()
  }
  function asegurar(alto) {
    if (y + alto <= limite) return
    nuevaHoja(false)
  }
  nuevaHoja(true)

  // --- resumen ---
  const linea1 = [
    [viaje.destino, viaje.club_anfitrion].filter(Boolean).join(' · '),
    fechasViaje(viaje),
  ].filter(Boolean).join('   ·   ')
  doc.texto(linea1, M, y, { tam: 10.5, negrita: true, color: TINTA })
  y += 16
  const completos = jugadores.filter(papelesCompletos).length
  doc.texto(
    `${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'} · ` +
    `${completos} con todos los papeles · ${jugadores.length - completos} con pendientes`,
    M, y, { tam: 9, color: GRIS })
  y += 13
  doc.texto(
    papeles.map((p) => `${p.abrev} ${jugadores.filter((j) => j[p.clave]).length}/${jugadores.length}`)
      .join('   ·   '),
    M, y, { tam: 9, color: GRIS })
  y += 20

  encabezadoTabla()

  // --- una fila por chico ---
  const pastilla = (x, yy, ok) => {
    const w = 30
    doc.rect(x - w / 2, yy, w, 12, ok ? VERDE_FONDO : ROJO_FONDO)
    doc.texto(ok ? 'Sí' : 'No', x, yy + 2, {
      tam: 8, negrita: true, color: ok ? VERDE_TEXTO : ROJO_TEXTO, alinear: 'centro',
    })
  }
  for (const j of jugadores) {
    const contacto = [j.tutor_nombre, j.tutor_telefono ? `tel. ${j.tutor_telefono}` : null]
      .filter(Boolean).join(' · ')
    const alto = 26
    asegurar(alto)
    const completo = papelesCompletos(j)
    doc.linea(M, y, der, y, BORDE, 0.5)
    if (!completo) doc.rect(M, y + 1, 2.5, alto - 2, AMBAR)
    doc.texto(nombreCompleto(j), M + 6, y + 4, { tam: 9.5, negrita: true, color: TINTA })
    if (contacto) doc.texto(contacto, M + 6, y + 15, { tam: 7.5, color: GRIS })
    papeles.forEach((p, i) => pastilla(xPapeles + i * ANCHO_PAPEL + ANCHO_PAPEL / 2, y + 7, !!j[p.clave]))
    if (completo) {
      doc.rect(der - ANCHO_COMPLETO / 2 - 15, y + 7, 30, 12, VERDE)
      doc.texto('OK', der - ANCHO_COMPLETO / 2, y + 9, { tam: 8, negrita: true, color: BLANCO, alinear: 'centro' })
    } else {
      const faltan = papeles.filter((p) => !j[p.clave]).length
      doc.texto(`falta${faltan === 1 ? '' : 'n'} ${faltan}`, der - ANCHO_COMPLETO / 2, y + 9,
        { tam: 7.5, color: AMBAR_TEXTO, alinear: 'centro' })
    }
    y += alto
  }
  doc.linea(M, y, der, y, BORDE, 0.5)
  if (!jugadores.length) {
    doc.texto('Todavía no hay jugadores en este viaje.', M, y + 10, { tam: 9.5, color: GRIS })
  }

  pieDeHojas(doc, generadoPor)
  return new Blob([doc.bytes()], { type: 'application/pdf' })
}

export function generarAlojadosPDF({ viaje, staff = [], grupos, jugadores, generadoPor }) {
  const doc = nuevoPDF({
    titulo: `Alojados · ${viaje.nombre}`,
    autor: 'Rugby M12 · Tucumán Lawn Tennis',
  })
  const ancho = doc.ancho - M * 2
  const der = doc.ancho - M
  const limite = doc.alto - PIE

  // Cursor vertical con salto de hoja: cada bloque pide el alto que necesita
  // y, si no entra, sigue arriba de una hoja nueva
  let y = 0
  function cabecera(primera) {
    cabeceraHoja(doc, viaje, 'ALOJAMIENTO DE LA GIRA', !primera)
    y = ALTO_CABECERA + 20
  }
  function asegurar(alto) {
    if (y + alto <= limite) return
    doc.nuevaPagina()
    cabecera(false)
  }
  cabecera(true)

  // --- datos del viaje ---
  const linea1 = [
    [viaje.destino, viaje.club_anfitrion].filter(Boolean).join(' · '),
    fechasViaje(viaje),
  ].filter(Boolean).join('   ·   ')
  doc.texto(linea1, M, y, { tam: 10.5, negrita: true, color: TINTA })
  y += 16
  const sinAlojar = jugadores.filter((j) => !j.grupo_id)
  const resumen = `${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'}` +
    ` en ${grupos.length} ${grupos.length === 1 ? 'casa' : 'casas'}` +
    (sinAlojar.length ? ` · ${sinAlojar.length} sin alojar` : '')
  doc.texto(resumen, M, y, { tam: 9, color: GRIS })
  y += 13
  if (staff.length) {
    for (const l of partirTexto(`Staff que viaja: ${staff.map(nombreStaff).join(', ')}`, ancho, 9)) {
      doc.texto(l, M, y, { tam: 9, color: GRIS })
      y += 12
    }
  }
  if (viaje.notas) {
    y += 2
    for (const l of partirTexto(viaje.notas, ancho, 8.5)) {
      asegurar(11)
      doc.texto(l, M, y, { tam: 8.5, color: GRIS })
      y += 11
    }
  }
  y += 10

  // --- una sección por casa ---
  const miembros = (g) => jugadores.filter((j) => j.grupo_id === g.id)
  for (const g of grupos) {
    seccionCasa(g, miembros(g))
  }
  if (!grupos.length) {
    asegurar(20)
    doc.texto('Todavía no hay casas cargadas.', M, y, { tam: 9.5, color: GRIS })
    y += 20
  }

  // --- sin alojar ---
  if (sinAlojar.length) {
    asegurar(40)
    y += 4
    doc.rect(M, y, ancho, 22, AMBAR_FONDO)
    doc.rect(M, y, 3, 22, AMBAR)
    doc.texto(`SIN ALOJAR (${sinAlojar.length})`, M + 12, y + 7, { tam: 9, negrita: true, color: AMBAR_TEXTO })
    y += 26
    for (const j of sinAlojar) filaJugador(j)
  }

  pieDeHojas(doc, generadoPor)
  return new Blob([doc.bytes()], { type: 'application/pdf' })

  function seccionCasa(g, chicos) {
    // Título de la casa y datos de la familia: van juntos con al menos el
    // primer chico, para que no quede un título solo al pie de la hoja
    const titulo = g.familia_nombre ? `Casa ${g.numero} · Familia ${g.familia_nombre}` : `Casa ${g.numero}`
    const telefono = g.familia_telefono
      ? `${g.familia_contacto ? `${g.familia_contacto}: ` : 'Tel. '}${g.familia_telefono}`
      : g.familia_contacto || null
    const contacto = [telefono, g.familia_direccion].filter(Boolean).join('   ·   ')
    const notas = g.familia_notas ? partirTexto(g.familia_notas, ancho - 24, 8.5) : []
    const altoTitulo = 24 + (contacto ? 12 : 0) + notas.length * 11 + 6
    asegurar(altoTitulo + 22)

    doc.rect(M, y, ancho, 20, AZUL_CLARO)
    doc.rect(M, y, 3, 20, AZUL)
    doc.texto(titulo, M + 12, y + 6, { tam: 10.5, negrita: true, color: AZUL })
    doc.texto(`${chicos.length} ${chicos.length === 1 ? 'chico' : 'chicos'}`, der - 8, y + 7,
      { tam: 8.5, color: GRIS, alinear: 'der' })
    y += 24
    if (contacto) {
      doc.texto(contacto, M + 12, y, { tam: 9, color: TINTA })
      y += 12
    }
    for (const l of notas) {
      doc.texto(l, M + 12, y, { tam: 8.5, color: GRIS })
      y += 11
    }
    y += 6

    if (!chicos.length) {
      doc.texto('Sin chicos asignados todavía.', M + 12, y, { tam: 8.5, color: GRIS })
      y += 16
    }
    for (const j of chicos) filaJugador(j)
    y += 10
  }

  function filaJugador(j) {
    const contacto = [j.tutor_nombre, j.tutor_telefono ? `tel. ${j.tutor_telefono}` : null]
      .filter(Boolean).join(' · ')
    const obs = j.observaciones ? partirTexto(j.observaciones, ancho - 40, 8) : []
    const alto = 22 + obs.length * 10
    asegurar(alto)
    doc.linea(M + 12, y, der, y, BORDE, 0.5)
    doc.texto(nombreCompleto(j), M + 12, y + 6, { tam: 9.5, negrita: true, color: TINTA })
    if (j.fecha_nacimiento) {
      doc.texto(fechaCorta(j.fecha_nacimiento), M + 200, y + 7, { tam: 8, color: GRIS })
    }
    if (contacto) doc.texto(contacto, der, y + 7, { tam: 8.5, color: GRIS, alinear: 'der' })
    let yy = y + 20
    if (obs.length) {
      const altoObs = obs.length * 10 + 4
      doc.rect(M + 12, yy - 3, ancho - 12, altoObs, AMBAR_FONDO)
      obs.forEach((l, i) => doc.texto(`${i === 0 ? '! ' : '  '}${l}`, M + 18, yy + i * 10, { tam: 8, color: AMBAR_TEXTO }))
      yy += altoObs + 2
    }
    y = yy
  }
}
