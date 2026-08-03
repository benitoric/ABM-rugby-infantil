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
