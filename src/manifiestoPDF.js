// Manifiesto para bus: el listado formal que pide la empresa de transporte
// con el documento de todos los que viajan. Un PDF por bloque, porque cada
// bloque suele viajar en su propio micro y a su propia cancha.
//
// Es un papel que se entrega, así que va sobrio: sin colores de relleno ni
// adornos, tipografía chica y pareja, una fila por persona y el pie con los
// totales y el espacio para la firma del responsable.

import { nuevoPDF } from './pdf.js'
import { fechaCorta, nombreCompleto, nombreStaff } from './helpers.js'

const TINTA = [20, 27, 43]
const GRIS = [93, 102, 120]
const BORDE = [160, 168, 180]
const LINEA_SUAVE = [213, 218, 226]

// 48000000 se lee mejor como 48.000.000, que es como se escribe en un papel
// formal. Lo que no sea solo números se deja tal cual se cargó.
const formatearDni = (dni) => {
  const limpio = String(dni ?? '').replace(/\D/g, '')
  if (!dni) return ''
  if (limpio.length < 7 || limpio.length > 9 || limpio !== String(dni).trim()) return String(dni).trim()
  return limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const M = 42 // margen lateral
const PIE = 56 // reserva al pie para la firma y el número de hoja

export function nombreArchivoManifiesto(partido, bloque) {
  return `manifiesto-bus-b${bloque.numero}-${partido.fecha}.pdf`
}

export function manifiestoBus({ partido, bloque, jugadores, staff, generadoPor }) {
  const doc = nuevoPDF({
    titulo: `Manifiesto para bus · Bloque ${bloque.numero} · ${fechaCorta(partido.fecha)}`,
    autor: 'Tucumán Lawn Tennis Club',
  })
  const der = doc.ancho - M
  const ancho = der - M
  let y = 0

  // ---- encabezado
  const encabezado = (continuacion) => {
    y = 46
    doc.texto('TUCUMÁN LAWN TENNIS CLUB', M, y, { tam: 10, negrita: true, color: GRIS })
    y += 16
    doc.texto('MANIFIESTO PARA BUS', M, y, { tam: 19, negrita: true, color: TINTA })
    if (continuacion) {
      doc.texto('(continuación)', der, y + 6, { tam: 8, color: GRIS, alinear: 'der' })
    }
    y += 26
    doc.linea(M, y, der, y, BORDE, 1.2)
    y += 14
    // Datos del viaje, en dos columnas de etiqueta y valor
    const datos = [
      ['División', 'M12 (clase 2014)'],
      ['Fecha', fechaCorta(partido.fecha)],
      ['Bloque', `${bloque.numero}${bloque.rival ? ` — vs ${bloque.rival}` : ''}`],
      ['Destino', bloque.lugar || partido.lugar || 'A confirmar'],
      ['Hora de convocatoria', bloque.hora_convocatoria
        ? `${bloque.hora_convocatoria.slice(0, 5)} hs` : 'A confirmar'],
    ]
    const col = ancho / 2
    datos.forEach(([etiqueta, valor], i) => {
      const x = M + (i % 2) * col
      const fy = y + Math.floor(i / 2) * 15
      doc.texto(`${etiqueta}:`, x, fy, { tam: 9, color: GRIS })
      doc.texto(valor, x + 112, fy, { tam: 9, negrita: true, color: TINTA })
    })
    y += Math.ceil(datos.length / 2) * 15 + 10
    doc.linea(M, y, der, y, BORDE, 1.2)
    y += 16
  }

  // ---- tabla
  const COL_N = 26
  const COL_DNI = 92
  const ALTO_FILA = 17

  const tituloTabla = (texto, cantidad) => {
    doc.texto(texto.toUpperCase(), M, y, { tam: 9, negrita: true, color: TINTA })
    doc.texto(`${cantidad} ${cantidad === 1 ? 'persona' : 'personas'}`, der, y,
      { tam: 8.5, color: GRIS, alinear: 'der' })
    y += 14
  }

  const cabeceraTabla = (etiquetaMedio) => {
    doc.texto('N°', M, y, { tam: 7.5, negrita: true, color: GRIS })
    doc.texto('APELLIDO Y NOMBRE', M + COL_N, y, { tam: 7.5, negrita: true, color: GRIS })
    doc.texto(etiquetaMedio, der - COL_DNI - 110, y, { tam: 7.5, negrita: true, color: GRIS })
    doc.texto('DNI', der, y, { tam: 7.5, negrita: true, color: GRIS, alinear: 'der' })
    y += 10
    doc.linea(M, y, der, y, BORDE, 0.9)
    y += 11
  }

  // Corta la hoja cuando no entra una fila más y repite el encabezado
  const asegurarEspacio = (alto, etiquetaMedio) => {
    if (y + alto <= doc.alto - PIE) return
    doc.nuevaPagina()
    encabezado(true)
    if (etiquetaMedio != null) cabeceraTabla(etiquetaMedio)
  }

  // Todas las celdas de la fila van con el mismo cuerpo: el generador apoya
  // el texto según su tamaño, así que mezclarlos desalinea los renglones
  const TAM_FILA = 9
  const fila = (n, nombre, medio, dni) => {
    doc.texto(n == null ? '' : String(n), M, y, { tam: TAM_FILA, color: GRIS })
    doc.texto(nombre, M + COL_N, y, { tam: TAM_FILA, color: TINTA })
    doc.texto(medio || '', der - COL_DNI - 110, y, { tam: TAM_FILA, color: GRIS })
    doc.texto(formatearDni(dni) || 'SIN DNI', der, y, {
      tam: TAM_FILA, negrita: !!dni, color: dni ? TINTA : GRIS, alinear: 'der',
    })
    y += ALTO_FILA - 6
    doc.linea(M, y, der, y, LINEA_SUAVE, 0.5)
    y += 6
  }

  encabezado(false)

  tituloTabla('Jugadores', jugadores.length)
  cabeceraTabla('FECHA DE NAC.')
  jugadores.forEach((j, i) => {
    asegurarEspacio(ALTO_FILA, 'FECHA DE NAC.')
    fila(i + 1, nombreCompleto(j).toUpperCase(),
      j.fecha_nacimiento ? fechaCorta(j.fecha_nacimiento) : '', j.dni)
  })
  if (!jugadores.length) fila(null, 'Sin jugadores asignados a este bloque.', '', '')

  y += 14
  asegurarEspacio(60)
  tituloTabla('Staff a cargo', staff.length)
  cabeceraTabla('ROL')
  staff.forEach((s, i) => {
    asegurarEspacio(ALTO_FILA, 'ROL')
    fila(i + 1, nombreStaff(s).toUpperCase(), s.rol || '', s.dni)
  })
  if (!staff.length) fila(null, 'Sin staff asignado a este bloque.', '', '')

  // ---- total y firma
  y += 16
  asegurarEspacio(70)
  doc.linea(M, y, der, y, BORDE, 1.2)
  y += 14
  const total = jugadores.length + staff.length
  doc.texto(`TOTAL DE PASAJEROS: ${total}`, M, y, { tam: 10, negrita: true, color: TINTA })
  doc.texto(`${jugadores.length} jugadores · ${staff.length} del staff`, der, y,
    { tam: 8.5, color: GRIS, alinear: 'der' })

  const faltan = [...jugadores, ...staff].filter((x) => !x.dni).length
  if (faltan) {
    y += 14
    doc.texto(
      `Observación: ${faltan} ${faltan === 1 ? 'pasajero' : 'pasajeros'} sin DNI cargado en el sistema.`,
      M, y, { tam: 8, color: GRIS })
  }

  y += 46
  asegurarEspacio(40)
  doc.linea(M, y, M + 190, y, BORDE, 0.9)
  doc.linea(der - 190, y, der, y, BORDE, 0.9)
  y += 10
  doc.texto('Firma del responsable del bloque', M, y, { tam: 8, color: GRIS })
  doc.texto('Aclaración', der - 190, y, { tam: 8, color: GRIS })

  // ---- pie de todas las hojas
  const generado = `Emitido el ${new Date().toLocaleDateString('es-AR')}` +
    (generadoPor ? ` por ${generadoPor}` : '')
  for (let i = 0; i < doc.paginas; i++) {
    doc.enPagina(i, () => {
      doc.texto(generado, M, doc.alto - 26, { tam: 7, color: GRIS })
      doc.texto(`Hoja ${i + 1} de ${doc.paginas}`, der, doc.alto - 26,
        { tam: 7, color: GRIS, alinear: 'der' })
    })
  }

  return doc.blob()
}
