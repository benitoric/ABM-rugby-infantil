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

export function nombreCompleto(j) {
  return `${j.apellido}, ${j.nombre}`
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

export const ROLES_STAFF = [
  'Cabeza de división',
  'Entrenador',
  'Preparador físico (PF)',
  'PF/entrenador',
  'Manager principal',
  'Manager asistente',
]

export const ESTADOS_ASISTENCIA = [
  { value: 'presente', label: 'P', title: 'Presente', color: 'var(--ok)' },
  { value: 'tarde', label: 'T', title: 'Llegó tarde', color: 'var(--warn)' },
  { value: 'justificado', label: 'J', title: 'Ausente justificado', color: 'var(--info)' },
  { value: 'ausente', label: 'A', title: 'Ausente', color: 'var(--bad)' },
]
