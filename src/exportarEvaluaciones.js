// Exportación de las evaluaciones a una planilla (CSV con punto y coma, el
// que abre bien el Excel en castellano).
//
// Una fila por "mirada": si la evaluación tiene revisión cruzada salen tres
// filas —la del evaluador, la del revisor y la consolidada (promedio de las
// dos)—; si no, una sola, consolidada, que es la del único evaluador. Así en
// la planilla se puede filtrar por "Consolidada" para quedarse con la nota
// final de cada evaluación, o comparar las dos miradas cuando las hay.
import { AREAS_EVAL, acuerdo, promediosResumen, valoresConsolidados, GRUPOS } from './evaluacion.js'
import { descargarCSV, fechaCorta } from './helpers.js'

const VARIABLES = AREAS_EVAL.flatMap((a) => a.variables.map((v) => ({ ...v, area: a.label })))

export function encabezadoEvaluaciones() {
  return [
    'Apellido', 'Nombre', 'Fecha', 'Mirada', 'Quién',
    ...GRUPOS.map((g) => `Promedio ${g.label.toLowerCase()}`),
    'Acuerdo entre miradas (%)',
    ...VARIABLES.map((v) => `${v.area} · ${v.label}`),
    'Comentario',
  ]
}

// Las filas de una evaluación (ya con el jugador y los nombres del staff)
export function filasDeEvaluacion(ev) {
  const fila = (mirada, quien, valores, comentario) => {
    const proms = promediosResumen(valores)
    return [
      ev.apellido, ev.nombre, fechaCorta(ev.fecha), mirada, quien,
      ...GRUPOS.map((g) => numero(proms[g.value])),
      mirada === 'Consolidada' ? numero(acuerdo(ev)) : '',
      ...VARIABLES.map((v) => numero(valores?.[v.value])),
      comentario || '',
    ]
  }
  const evaluador = ev.autor_nombre || ev.autor_email || ''
  if (!ev.valores_revisor) {
    return [fila('Consolidada', evaluador, ev.valores, ev.comentario)]
  }
  const revisor = ev.revisor_nombre || ev.revisor_email || ''
  return [
    fila('Evaluador', evaluador, ev.valores, ev.comentario),
    fila('Revisor', revisor, ev.valores_revisor, ev.comentario_revisor),
    fila('Consolidada', `${evaluador} + ${revisor}`, valoresConsolidados(ev),
      [ev.comentario, ev.comentario_revisor].filter(Boolean).join(' / ')),
  ]
}

export function exportarEvaluaciones(evaluaciones) {
  const hoy = new Date().toISOString().slice(0, 10)
  descargarCSV(`evaluaciones-${hoy}.csv`, [
    encabezadoEvaluaciones(),
    ...evaluaciones.flatMap(filasDeEvaluacion),
  ])
}

// Los decimales van con coma, que es como los lee el Excel en castellano
function numero(v) {
  if (v == null || v === '') return ''
  return String(v).replace('.', ',')
}
