// Informe de gestión de la división: períodos, secciones y textos comunes a la
// pantalla (src/pages/Informe.jsx) y al PDF (src/informePDF.js).
//
// Los números los arma el servidor (server/informe.js); acá solo se eligen el
// rango y qué hojas entran, y se formatean las variaciones.

export const PERIODOS_INFORME = [
  { value: 'mes', label: 'Último mes', dias: 30 },
  { value: 'trimestre', label: 'Últimos 3 meses', dias: 90 },
  { value: 'semestre', label: 'Últimos 6 meses', dias: 180 },
  { value: 'temporada', label: 'Temporada (año en curso)' },
  { value: 'anio', label: 'Últimos 12 meses', dias: 365 },
  { value: 'manual', label: 'Otro rango' },
]

export const SECCIONES_INFORME = [
  { value: 'resumen', label: 'Tablero de indicadores', ayuda: 'Los números clave con su variación contra el período anterior.' },
  { value: 'plantel', label: 'Plantel', ayuda: 'Activos al inicio y al cierre, altas, bajas, puestos y edades.' },
  { value: 'actividad', label: 'Actividad', ayuda: 'Entrenamientos, partidos, suspensiones y calendario.' },
  { value: 'asistencia', label: 'Asistencia de los jugadores', ayuda: 'Promedios, franjas, mejores y peores, faltas seguidas.' },
  { value: 'staff', label: 'Staff', ayuda: 'Presencia y carga de trabajo de cada integrante.' },
  { value: 'evaluaciones', label: 'Evaluaciones', ayuda: 'Cobertura, acuerdo entre miradas, promedios y progresos.' },
  { value: 'entrenado', label: 'Qué se entrenó', ayuda: 'Minutos por aspecto técnico y por variable física.' },
  { value: 'tests', label: 'Tests físicos', ayuda: 'Evolución de cada test y semáforo al cierre.' },
  { value: 'lesiones', label: 'Lesiones y golpes', ayuda: 'Nuevas, abiertas, días de baja y golpes en cancha.' },
  { value: 'partidos', label: 'Partidos', ayuda: 'Valoración de los bloques, rivales, tiempos y capitanías.' },
  { value: 'administrativo', label: 'Administrativo', ayuda: 'Fichas médicas, DNI, tutores y viajes del período.' },
  { value: 'registro', label: 'Calidad del registro', ayuda: 'Lo que faltó cargar: dice cuánto confiar en el resto.' },
]

export const fechaISO = (d) => d.toISOString().slice(0, 10)

// Rango { desde, hasta } de un período, con hoy como cierre
export function rangoDePeriodoInforme(periodo, hoy = new Date()) {
  const p = PERIODOS_INFORME.find((x) => x.value === periodo)
  if (!p) return null
  if (p.value === 'temporada') return { desde: `${hoy.getFullYear()}-01-01`, hasta: fechaISO(hoy) }
  if (!p.dias) return null
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - p.dias)
  return { desde: fechaISO(desde), hasta: fechaISO(hoy) }
}

export function nombreArchivoInforme(desde, hasta) {
  return `informe-gestion-m12-${desde}-a-${hasta}.pdf`
}

// Texto de la variación contra el período anterior. `pp` cuando los dos
// valores son porcentajes (la diferencia va en puntos); si no, es un conteo.
export function variacion(actual, anterior, { pp = false, decimales = 0 } = {}) {
  if (actual == null || anterior == null) return { texto: 'sin dato previo', signo: 0 }
  const d = Math.round((actual - anterior) * 10 ** decimales) / 10 ** decimales
  if (d === 0) return { texto: 'igual que antes', signo: 0 }
  const mas = d > 0
  const num = decimales ? Math.abs(d).toFixed(decimales).replace('.', ',') : Math.abs(d)
  return {
    texto: `${mas ? '+' : '−'}${num}${pp ? ' pp' : ''} vs. período anterior`,
    signo: mas ? 1 : -1,
  }
}

export const conPorcentaje = (v) => (v == null ? '—' : `${v}%`)
export const oGuion = (v) => (v == null || v === '' ? '—' : String(v))
export const conComa = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d).replace('.', ','))

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const mesCortoInforme = (mes) => {
  const [a, m] = mes.split('-')
  return `${MESES_CORTOS[Number(m) - 1]} ${a.slice(2)}`
}

export const MOTIVOS_SUSPENSION = { clima: 'Clima', feriado: 'Feriado', otro: 'Otro', sin_motivo: 'Sin motivo cargado' }
export const DIFICULTADES_LABEL = { bueno: 'Rival bueno', regular: 'Rival regular', malo: 'Rival flojo', sin_marcar: 'Sin dificultad marcada' }
