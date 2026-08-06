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

// Línea descriptiva de un bloque de partido: rival, convocatoria y lugar
export function lineaBloque(b) {
  const partes = [`B${b.numero} vs ${b.rival || 'a definir'}`]
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

