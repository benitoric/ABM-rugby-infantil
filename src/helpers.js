export function edad(fechaNacimiento) {
  if (!fechaNacimiento) return null
  const hoy = new Date()
  const fn = new Date(fechaNacimiento + 'T00:00:00')
  let e = hoy.getFullYear() - fn.getFullYear()
  const m = hoy.getMonth() - fn.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) e--
  return e
}

export function fechaCorta(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

// Fecha compacta dd/mm/aa, para los renglones angostos del listado en móvil
export function fechaCompacta(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function nombreCompleto(j) {
  return `${j.apellido}, ${j.nombre}`
}

// Nombre para mostrar de un miembro del staff (el apellido es opcional)
export function nombreStaff(s) {
  return [s.nombre, s.apellido].filter(Boolean).join(' ') || s.email
}

export const APTITUDES = [
  { value: 'conduccion', label: 'Conducción', abrev: 'Cond' },
  { value: 'penetracion', label: 'Penetración', abrev: 'Pen' },
  { value: 'definicion', label: 'Definición', abrev: 'Def' },
]

export function abrevAptitudes(j) {
  const lista = j.aptitudes || []
  return APTITUDES.filter((a) => lista.includes(a.value)).map((a) => a.abrev).join('·')
}

// Puestos del rugby infantil. Cada jugador tiene en `puestos` la lista de
// los que puede ocupar (puede ser más de uno); la clasificación forward/
// back/mixto se deriva de ahí.
export const PUESTOS = [
  { value: 'pilar', label: 'Pilar', abrev: 'Pil', tipo: 'forward' },
  { value: 'hooker', label: 'Hooker', abrev: 'Hoo', tipo: 'forward' },
  { value: 'segunda', label: 'Segunda línea', abrev: '2ª', tipo: 'forward' },
  { value: 'octavo', label: 'Octavo', abrev: '8vo', tipo: 'forward' },
  { value: 'medio_scrum', label: 'Medio scrum', abrev: 'MS', tipo: 'back' },
  { value: 'apertura', label: 'Apertura', abrev: 'Ap', tipo: 'back' },
  { value: 'centro', label: 'Centro', abrev: 'Ce', tipo: 'back' },
  { value: 'wing', label: 'Wing', abrev: 'Wg', tipo: 'back' },
  { value: 'fullback', label: 'Fullback', abrev: 'FB', tipo: 'back' },
]

const TIPO_PUESTO = Object.fromEntries(PUESTOS.map((p) => [p.value, p.tipo]))

// Forward / Back / Mixto derivado de los puestos cargados; si no hay
// puestos, vale la posición genérica vieja (jugadores sin actualizar).
export function tipoJugador(j) {
  const tipos = new Set((j.puestos || []).map((k) => TIPO_PUESTO[k]).filter(Boolean))
  if (tipos.size === 2) return 'Mixto'
  if (tipos.has('forward')) return 'Forward'
  if (tipos.has('back')) return 'Back'
  return j.posicion || null
}

// El puesto donde de verdad juega. Con uno solo cargado es ese; con varios,
// el que se haya marcado (puede no haberse elegido todavía).
export function puestoPrincipal(j) {
  const propios = j.puestos || []
  if (propios.length === 1) return propios[0]
  return propios.includes(j.puesto_principal) ? j.puesto_principal : null
}

// Los puestos del jugador, con el principal siempre primero
export function puestosOrdenados(j) {
  const propios = PUESTOS.filter((p) => (j.puestos || []).includes(p.value))
  const principal = puestoPrincipal(j)
  if (!principal) return propios
  return [...propios].sort((a, b) =>
    (b.value === principal) - (a.value === principal))
}

// "Pilar/Hooker" para listados; abreviado "Pil·Hoo" para renglones chicos
export function etiquetaPuestos(j) {
  const propios = puestosOrdenados(j)
  return propios.length ? propios.map((p) => p.label).join('/') : (j.posicion || '')
}

export function abrevPuestos(j) {
  const propios = puestosOrdenados(j)
  return propios.length ? propios.map((p) => p.abrev).join('·') : (j.posicion || '')
}

// Reparto de un grupo de jugadores por línea (forwards/backs) y, dentro de
// cada una, por el puesto principal de cada uno. Los que juegan en varios
// puestos sin haber elegido el principal caen en "sinPuesto" de su línea, y
// los que no tienen ningún dato de puesto (o son mixtos sin principal) en
// "sinDefinir", así la suma siempre cierra con el total.
export function resumenPorPuesto(jugadores) {
  const lineas = [
    { clave: 'forward', label: 'Forwards' },
    { clave: 'back', label: 'Backs' },
  ].map((l) => ({
    ...l,
    total: 0,
    sinPuesto: [],
    puestos: PUESTOS.filter((p) => p.tipo === l.clave).map((p) => ({ ...p, jugadores: [] })),
  }))
  const sinDefinir = []

  for (const j of jugadores) {
    const principal = puestoPrincipal(j)
    const linea = lineas.find((l) => l.clave === TIPO_PUESTO[principal])
    if (linea) {
      linea.puestos.find((p) => p.value === principal).jugadores.push(j)
      linea.total++
      continue
    }
    // Sin puesto principal definido todavía: al menos se ubica la línea si
    // todos sus puestos son de la misma (o si tiene la posición vieja)
    const porTipo = lineas.find((l) => l.clave === (tipoJugador(j) || '').toLowerCase())
    if (porTipo) {
      porTipo.sinPuesto.push(j)
      porTipo.total++
    } else {
      sinDefinir.push(j)
    }
  }
  return { lineas, sinDefinir, total: jugadores.length }
}

// Formación de 13 del rugby infantil: 6 forwards y 7 backs. El 9 y el 10
// (pareja de medios) además deberían tener la aptitud de conducción.
export const FORMACION = [
  { num: 1, label: 'Pilar', tipo: 'forward', puesto: 'pilar' },
  { num: 2, label: 'Hooker', tipo: 'forward', puesto: 'hooker' },
  { num: 3, label: 'Pilar', tipo: 'forward', puesto: 'pilar' },
  { num: 4, label: 'Segunda línea', tipo: 'forward', puesto: 'segunda' },
  { num: 5, label: 'Segunda línea', tipo: 'forward', puesto: 'segunda' },
  { num: 8, label: 'Octavo', tipo: 'forward', puesto: 'octavo' },
  { num: 9, label: 'Medio scrum', tipo: 'back', puesto: 'medio_scrum', conductor: true },
  { num: 10, label: 'Apertura', tipo: 'back', puesto: 'apertura', conductor: true },
  { num: 11, label: 'Wing izquierdo', tipo: 'back', puesto: 'wing' },
  { num: 12, label: 'Primer centro', tipo: 'back', puesto: 'centro' },
  { num: 13, label: 'Segundo centro', tipo: 'back', puesto: 'centro' },
  { num: 14, label: 'Wing derecho', tipo: 'back', puesto: 'wing' },
  { num: 15, label: 'Fullback', tipo: 'back', puesto: 'fullback' },
]

export function puestoFormacion(num) {
  return FORMACION.find((f) => f.num === num)
}

// ¿El jugador puede ocupar ese puesto? Con puestos cargados vale la lista
// específica; sin cargar, la posición genérica (y los mixtos van a cualquier
// lado). Sin ningún dato, no se marca alerta.
export function puedeJugarDe(jugador, puestoNum) {
  const p = puestoFormacion(puestoNum)
  if (!p) return true
  if (jugador.puestos?.length) return jugador.puestos.includes(p.puesto)
  if (!jugador.posicion || jugador.posicion === 'Mixto') return true
  return jugador.posicion.toLowerCase() === p.tipo
}

export const AREAS = [
  { value: 'tecnica', label: 'Técnica' },
  { value: 'fisica', label: 'Física' },
  { value: 'tactica', label: 'Táctica' },
  { value: 'actitudinal', label: 'Actitudinal' },
  { value: 'social', label: 'Social' },
]

// Estado de la ficha médica: prioriza la fecha de vencimiento si está cargada.
export function fichaMedica(j) {
  if (j.ficha_medica_vence) {
    const hoy = new Date().toISOString().slice(0, 10)
    const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    if (j.ficha_medica_vence < hoy) {
      return { clase: 'medica-vencida', texto: `Ficha vencida ${fechaCorta(j.ficha_medica_vence)}` }
    }
    if (j.ficha_medica_vence <= en30) {
      return { clase: 'medica-pronto', texto: `Ficha vence ${fechaCorta(j.ficha_medica_vence)}` }
    }
    return { clase: 'medica-ok', texto: 'Ficha médica ✓' }
  }
  return j.ficha_medica_vigente
    ? { clase: 'medica-ok', texto: 'Ficha médica ✓' }
    : { clase: 'medica-no', texto: 'Sin ficha médica' }
}

// Estado efectivo del jugador. La baja ('inactivo') y la lesión vienen de la
// base; 'inhabilitado' se deriva de la ficha médica (vencida o inexistente).
export const ESTADOS = {
  activo: 'Activo',
  inhabilitado: 'Inhabilitado',
  lesionado: 'Lesionado',
  inactivo: 'Inactivo',
}

export function estadoJugador(j) {
  if (j.estado === 'inactivo') return 'inactivo'
  if (j.estado === 'lesionado') return 'lesionado'
  const c = fichaMedica(j).clase
  if (c === 'medica-vencida' || c === 'medica-no') return 'inhabilitado'
  return 'activo'
}

// Descarga en el navegador un CSV (separado por ; para que Excel en español
// lo abra directo en columnas).
export function descargarCSV(nombreArchivo, filas) {
  const escapar = (v) => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const texto = '﻿' + filas.map((f) => f.map(escapar).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  URL.revokeObjectURL(url)
}

// Grado de dificultad esperado del rival de un bloque
export const DIFICULTADES = [
  { value: 'bueno', label: 'Bueno' },
  { value: 'regular', label: 'Regular' },
  { value: 'malo', label: 'Malo' },
]

export function etiquetaDificultad(d) {
  return DIFICULTADES.find((x) => x.value === d)?.label || ''
}

// Línea descriptiva de un bloque de partido: rival, convocatoria y lugar
export function lineaBloque(b) {
  const partes = [`B${b.numero} vs ${b.rival || 'a definir'}`]
  if (b.dificultad) partes.push(`dificultad ${etiquetaDificultad(b.dificultad).toLowerCase()}`)
  if (b.hora_convocatoria) partes.push(`conv. ${b.hora_convocatoria.slice(0, 5)} hs`)
  if (b.lugar) partes.push(b.lugar)
  if (b.valoracion) partes.push('★'.repeat(b.valoracion))
  if (b.suspendido) partes.push(`⛔ suspendido${b.motivo_suspension ? ` (${etiquetaMotivo(b.motivo_suspension)})` : ''}`)
  return partes.join(' · ')
}

// ---------- entrenamientos de rutina ----------
// El entrenamiento fijo de la división: lunes y miércoles de 19:30 a 21:00.
export const RUTINA = { hora: '19:30', hora_fin: '21:00', dias: [1, 3] }

export const MODALIDADES = {
  rutina: 'Rutina',
  extra: 'Extra',
}

// ¿La fecha cae un día de entrenamiento de rutina? (lunes o miércoles)
export function esDiaDeRutina(fecha) {
  if (!fecha) return true
  return RUTINA.dias.includes(new Date(fecha + 'T00:00:00').getDay())
}

// "19:30 a 21:00 hs" / "19:30 hs" / '' si no hay horario cargado
export function horarioEvento(ev) {
  if (!ev?.hora) return ''
  const desde = ev.hora.slice(0, 5)
  return ev.hora_fin ? `${desde} a ${ev.hora_fin.slice(0, 5)} hs` : `${desde} hs`
}

// ---------- suspensiones ----------
export const MOTIVOS_SUSPENSION = [
  { value: 'clima', label: 'Clima' },
  { value: 'feriado', label: 'Feriado' },
  { value: 'otro', label: 'Otro' },
]

export function etiquetaMotivo(motivo) {
  return MOTIVOS_SUSPENSION.find((m) => m.value === motivo)?.label || 'Sin motivo'
}

// Estado de suspensión de un evento. En los partidos puede caerse un solo
// bloque: ahí el evento queda "parcial" (el otro bloque se juega igual).
export function suspensionEvento(ev) {
  const bloques = ev?.bloques || []
  const caidos = bloques.filter((b) => b.suspendido)
  if (ev?.suspendido || (bloques.length > 0 && caidos.length === bloques.length)) {
    const motivo = ev?.suspendido ? ev.motivo_suspension : caidos[0]?.motivo_suspension
    return {
      estado: 'total',
      texto: `Suspendido${motivo ? ` · ${etiquetaMotivo(motivo)}` : ''}`,
    }
  }
  if (caidos.length) {
    return {
      estado: 'parcial',
      texto: `Suspendido ${caidos.map((b) => `B${b.numero}`).join(' y ')}`,
    }
  }
  return { estado: null, texto: '' }
}

export function etiquetaPartido(ev) {
  const rivales = (ev.bloques || []).filter((b) => b.rival).map((b) => `B${b.numero} vs ${b.rival}`)
  if (rivales.length) return `Partido · ${rivales.join(' / ')}`
  return `Partido${ev.rival ? ` vs ${ev.rival}` : ''}`
}

export const ROLES_STAFF = [
  'Cabeza de división',
  'Entrenador',
  'Preparador físico (PF)',
  'PF/entrenador',
  'Manager principal',
  'Manager asistente',
]

