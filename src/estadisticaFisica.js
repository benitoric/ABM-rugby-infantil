// Estadística del trabajo físico: convierte las planillas de los
// entrenamientos en los números del reporte.
//
// Vive aparte de la pantalla porque el PDF y la vista tienen que contar
// exactamente lo mismo: los dos leen de acá.

import {
  intensidad, GRUPOS_FISICOS, INTENSIDADES, VARIABLES_FISICAS,
} from './trabajoFisico.js'

// Períodos de uso frecuente, para no tener que tipear las fechas
export const PERIODOS = [
  { value: 'mes', label: 'Último mes', dias: 30 },
  { value: 'trimestre', label: 'Últimos 3 meses', dias: 90 },
  { value: 'semestre', label: 'Últimos 6 meses', dias: 180 },
  { value: 'anio', label: 'Último año', dias: 365 },
  { value: 'manual', label: 'Otro rango', dias: null },
]

export const MODALIDADES_FILTRO = [
  { value: '', label: 'Todos' },
  { value: 'rutina', label: 'Solo rutina' },
  { value: 'extra', label: 'Solo extras' },
]

// Secciones que se pueden incluir o sacar del reporte
export const SECCIONES = [
  { value: 'resumen', label: 'Resumen general', ayuda: 'Sesiones, cobertura y minutos.' },
  { value: 'variables', label: 'Reparto por variable', ayuda: 'Minutos de cada variable, con su barra.' },
  { value: 'grupos', label: 'Reparto por grupo', ayuda: 'Capacidades, coordinativas y aplicación.' },
  { value: 'intensidad', label: 'Intensidad y carga', ayuda: 'Cómo se repartió el esfuerzo.' },
  { value: 'sesiones', label: 'Detalle de sesiones', ayuda: 'Fecha por fecha, con las observaciones.' },
]

export const fechaISO = (d) => d.toISOString().slice(0, 10)

// Rango { desde, hasta } de un período, tomando hoy como final
export function rangoDePeriodo(periodo, hoy = new Date()) {
  const p = PERIODOS.find((x) => x.value === periodo)
  if (!p?.dias) return null
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - p.dias)
  return { desde: fechaISO(desde), hasta: fechaISO(hoy) }
}

const porcentaje = (parte, total) => (total ? Math.round((1000 * parte) / total) / 10 : 0)

// El resumen completo a partir de las sesiones que devuelve la API. Cada
// sesión es un entrenamiento del rango; `variables` viene en null cuando ese
// día no se cargó la planilla.
export function resumir(sesiones = []) {
  const conPlanilla = sesiones.filter((s) => s.variables)
  const minutosPorVariable = {}
  const sesionesPorVariable = {}
  const intensidadesPorVariable = {}
  const minutosPorIntensidad = { baja: 0, media: 0, alta: 0, sin: 0 }

  for (const s of conPlanilla) {
    for (const [clave, dato] of Object.entries(s.variables || {})) {
      if (!VARIABLES_FISICAS[clave]) continue
      const min = Number(dato?.minutos) || 0
      minutosPorVariable[clave] = (minutosPorVariable[clave] || 0) + min
      sesionesPorVariable[clave] = (sesionesPorVariable[clave] || 0) + 1
      const nivel = dato?.intensidad
      if (nivel) {
        intensidadesPorVariable[clave] = intensidadesPorVariable[clave] || {}
        intensidadesPorVariable[clave][nivel] = (intensidadesPorVariable[clave][nivel] || 0) + 1
      }
      minutosPorIntensidad[nivel || 'sin'] += min
    }
  }

  const minutosTotales = Object.values(minutosPorVariable).reduce((a, b) => a + b, 0)

  const porVariable = Object.keys(minutosPorVariable)
    .map((clave) => {
      const cuentas = intensidadesPorVariable[clave] || {}
      // La intensidad que más veces se usó; con empate gana la más alta, que
      // es la que conviene tener a la vista
      const predominante = [...INTENSIDADES]
        .reverse()
        .reduce((mejor, i) => ((cuentas[i.value] || 0) > (cuentas[mejor?.value] || 0) ? i : mejor), null)
      return {
        ...VARIABLES_FISICAS[clave],
        minutos: minutosPorVariable[clave],
        sesiones: sesionesPorVariable[clave],
        pct: porcentaje(minutosPorVariable[clave], minutosTotales),
        intensidad: cuentas[predominante?.value] ? predominante.value : null,
      }
    })
    .sort((a, b) => b.minutos - a.minutos || a.label.localeCompare(b.label, 'es'))

  const porGrupo = GRUPOS_FISICOS.map((g) => {
    const suyas = porVariable.filter((v) => v.grupo === g.value)
    const minutos = suyas.reduce((n, v) => n + v.minutos, 0)
    return { value: g.value, label: g.label, minutos, pct: porcentaje(minutos, minutosTotales) }
  }).filter((g) => g.minutos > 0)

  const porCarga = INTENSIDADES.map((i) => ({
    ...i,
    sesiones: conPlanilla.filter((s) => s.carga === i.value).length,
  }))
  const sinCarga = conPlanilla.filter((s) => !s.carga).length

  return {
    entrenamientos: sesiones.length,
    conPlanilla: conPlanilla.length,
    sinPlanilla: sesiones.length - conPlanilla.length,
    cobertura: porcentaje(conPlanilla.length, sesiones.length),
    minutosTotales,
    promedioPorSesion: conPlanilla.length
      ? Math.round((10 * minutosTotales) / conPlanilla.length) / 10
      : 0,
    variablesDistintas: porVariable.length,
    porVariable,
    porGrupo,
    porCarga,
    sinCarga,
    minutosPorIntensidad,
    // De la más reciente a la más vieja, como el resto de los historiales
    sesiones: [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha)),
  }
}

// Resumen de una sesión en una línea, para el detalle del reporte
export function lineaDeSesion(sesion) {
  if (!sesion.variables) return 'Sin planilla cargada'
  const partes = Object.entries(sesion.variables)
    .filter(([k]) => VARIABLES_FISICAS[k])
    .sort(([, a], [, b]) => (Number(b?.minutos) || 0) - (Number(a?.minutos) || 0))
    .map(([k, v]) => {
      const nombre = VARIABLES_FISICAS[k].label
      const min = v?.minutos ? `${v.minutos}′` : ''
      const inten = intensidad(v?.intensidad)?.label
      const detalle = [min, inten].filter(Boolean).join(' ')
      return detalle ? `${nombre} (${detalle})` : nombre
    })
  return partes.join(' · ') || 'Sin variables cargadas'
}
