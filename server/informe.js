// Informe de gestión de la división: todos los números de un período, para
// que la cabeza de división mida cómo viene la gestión y tome decisiones.
//
// Es material para adultos del cuerpo técnico, así que acá sí entra todo lo
// que la app registra: asistencia de chicos y de staff, evaluaciones (con lo
// social), lesiones, lo que se entrenó, los tests, los partidos y lo
// administrativo. Lo lee solo quien administra (ver el router).
//
// Reglas del armado:
// - El período es [desde, hasta], inclusive. Lo que todavía no ocurrió no
//   cuenta: el tope efectivo es hoy.
// - Cada indicador principal sale también para el período inmediato anterior
//   de igual largo (`anterior`), para ver la variación.
// - Una consulta por tabla para todo el plantel, nunca una por jugador. Las
//   agregaciones se terminan acá, en JS, con los mismos catálogos que usa el
//   frontend (src/evaluacion.js, src/planTecnico.js, etc.).
// - La asistencia usa el mismo criterio que el listado y el boletín: cuenta el
//   que estaba en el plantel ese día y no estaba lesionado; el presente cuenta
//   siempre (server/asistencia-sql.js).
import { query } from './db.js'
import { sqlLesionadoEnFecha, sqlEnPlantel } from './asistencia-sql.js'
import {
  AREAS_EVAL, VARIABLES_EVAL, acuerdo, diferencias, promedioGeneral, valoresConsolidados,
} from '../src/evaluacion.js'
import { CLAVES_TEST, TESTS_POR_VALUE, semaforoSugerido } from '../src/tests.js'
import {
  ASPECTOS_FIJOS, CLAVES_FIJAS, GRUPOS_TECNICOS, repartirMinutos,
} from '../src/planTecnico.js'
import { CLAVES_FISICAS, GRUPOS_FISICOS, VARIABLES_FISICAS } from '../src/trabajoFisico.js'

const ZONA = 'America/Argentina/Tucuman'
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')

// Un evento vigente es el que no está suspendido del todo: un partido con un
// bloque suspendido y otro jugado cuenta (mismo criterio que el resto).
const EVENTO_VIGENTE = `(not e.suspendido and (
  not exists (select 1 from bloques bl where bl.evento_id = e.id)
  or exists (select 1 from bloques bl where bl.evento_id = e.id and not bl.suspendido)))`

const ASISTENCIA_TOMADA = `(
  (e.tipo = 'entrenamiento' and exists (select 1 from asistencias a where a.evento_id = e.id))
  or (e.tipo = 'partido' and exists (select 1 from asistencias_partido a where a.evento_id = e.id)))`

const PRESENTE = `(case when e.tipo = 'entrenamiento'
  then exists (select 1 from asistencias a
               where a.evento_id = e.id and a.jugador_id = j.id and a.estado = 'presente')
  else exists (select 1 from asistencias_partido ap
               where ap.evento_id = e.id and ap.jugador_id = j.id and ap.estado = 'presente') end)`

const LESIONADO = sqlLesionadoEnFecha('j.id', 'e.fecha')
const EN_PLANTEL = sqlEnPlantel('j.id', 'e')

const pct = (parte, total) => (total ? Math.round((100 * parte) / total) : null)
const redondear = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)
const promedio = (lista) => (lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null)
const nombre = (f) => `${f.apellido}, ${f.nombre}`
const mesDe = (fecha) => fecha.slice(0, 7)

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000)

// Meses (YYYY-MM) que pisa el período, en orden
function mesesDe(desde, hasta) {
  const res = []
  let m = mesDe(desde)
  while (m <= mesDe(hasta)) {
    res.push(m)
    const [a, mm] = m.split('-').map(Number)
    m = `${mm === 12 ? a + 1 : a}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}`
  }
  return res
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
export async function informe({ desde, hasta }) {
  if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) throw { codigo: 400, error: 'rango_invalido' }
  const [{ hoy }] = await query(`select (now() at time zone '${ZONA}')::date::text as hoy`)
  // Lo que no ocurrió todavía no se informa
  const hastaEf = hasta < hoy ? hasta : hoy
  if (hastaEf < desde) throw { codigo: 400, error: 'rango_futuro' }
  const dias = diasEntre(desde, hasta) + 1
  const anterior = { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) }

  const plantelActual = await plantel()
  const eventos = await eventosDe(desde, hastaEf)
  const marcas = await marcasDe(desde, hastaEf)
  const asistencia = resumirAsistencia(marcas, plantelActual, desde, hastaEf)

  const [
    plantelPeriodo, staff, evaluaciones, entrenado, tests, lesiones, partidos, administrativo, previo,
  ] = await Promise.all([
    plantelDe(desde, hastaEf, hoy),
    staffDe(desde, hastaEf, eventos),
    evaluacionesDe(desde, hastaEf, plantelActual),
    entrenadoDe(desde, hastaEf),
    testsDe(desde, hastaEf, plantelActual),
    lesionesDe(desde, hastaEf, marcas),
    partidosDe(desde, hastaEf, plantelActual),
    administrativoDe(desde, hastaEf, hoy, plantelActual),
    indicadores(anterior.desde, anterior.hasta),
  ])

  const actividad = resumirActividad(eventos, desde, hastaEf)
  const actual = {
    activos: plantelPeriodo.activos_cierre,
    asistencia_entrenamientos: asistencia.division.entrenamientos,
    asistencia_partidos: asistencia.division.partidos,
    entrenamientos: actividad.entrenamientos.realizados,
    partidos: actividad.partidos.realizados,
    suspendidos_pct: actividad.suspendidos.pct,
    evaluaciones: evaluaciones.cargadas,
    lesiones: lesiones.nuevas,
    chicos_con_tests: tests.chicos_medidos,
    minutos_tecnica: entrenado.tecnica.minutos,
    promedio_evaluacion: evaluaciones.promedio_general,
  }

  return {
    desde, hasta, hasta_efectivo: hastaEf, dias, hoy,
    anterior,
    indicadores: { actual, anterior: previo },
    plantel: plantelPeriodo,
    actividad,
    asistencia,
    staff,
    evaluaciones,
    entrenado,
    tests,
    lesiones,
    partidos,
    administrativo,
    registro: calidadDelRegistro(eventos, hoy),
  }
}

// ---------------------------------------------------------------------------
// Plantel
// ---------------------------------------------------------------------------
async function plantel() {
  return query(
    `select j.id, j.nombre, j.apellido, j.fecha_nacimiento::text as fecha_nacimiento,
            j.dni, j.posicion, j.puestos, j.puesto_principal, j.aptitudes, j.estado,
            j.tutor_nombre, j.tutor_telefono, j.ficha_medica_vigente,
            j.ficha_medica_vence::text as ficha_medica_vence,
            j.created_at::date::text as alta,
            exists (select 1 from documentos d where d.jugador_id = j.id and d.tipo = 'dni') as dni_escaneado
     from jugadores j
     where j.estado <> 'inactivo'
     order by j.apellido, j.nombre`)
}

// ¿Cuántos jugadores no dados de baja había en una fecha? Manda el historial
// de estado si tiene una fila anterior a esa fecha. Si no (fechas de antes de
// que existiera), se reconstruye: estaba si ya tenía el alta en la app y hoy
// sigue, o figura en el plantel congelado de algún evento posterior, o lo
// editaron después (la baja habría tocado updated_at).
function sqlActivoEn(fecha) {
  const ultimo = `(select h.estado from jugadores_historial_estado h
     where h.jugador_id = j.id and (h.desde at time zone '${ZONA}')::date <= ${fecha}
     order by h.desde desc limit 1)`
  return `(j.created_at::date <= ${fecha} and (
    case when ${ultimo} is not null then ${ultimo} <> 'inactivo'
    else (j.estado <> 'inactivo'
          or exists (select 1 from evento_plantel ep join eventos e on e.id = ep.evento_id
                     where ep.jugador_id = j.id and e.fecha >= ${fecha})
          or j.updated_at::date > ${fecha})
    end))`
}

async function activosEn(fecha) {
  const [r] = await query(
    `select count(*)::int as n from jugadores j where ${sqlActivoEn('$1::date')}`, [fecha])
  return r.n
}

async function plantelDe(desde, hasta, hoy) {
  const [activosInicio, activosCierre] = await Promise.all([
    activosEn(sumarDias(desde, -1)), activosEn(hasta)])
  const altas = await query(
    `select j.nombre, j.apellido, j.created_at::date::text as fecha
     from jugadores j where j.created_at::date between $1 and $2
     order by j.created_at`, [desde, hasta])
  // Cambios de estado del período: bajas y reincorporaciones. Las filas que
  // sembró la migración son aproximadas (la baja se fechó con la última
  // edición) y se marcan como tales.
  const cambios = await query(
    `select h.estado, (h.desde at time zone '${ZONA}')::date::text as fecha,
            h.cambiado_por = 'migracion' as aproximado, j.nombre, j.apellido, j.id,
            (select h2.estado from jugadores_historial_estado h2
             where h2.jugador_id = h.jugador_id and h2.desde < h.desde
             order by h2.desde desc limit 1) as estado_previo
     from jugadores_historial_estado h
     join jugadores j on j.id = h.jugador_id
     where (h.desde at time zone '${ZONA}')::date between $1 and $2
     order by h.desde`, [desde, hasta])
  const bajas = cambios.filter((c) => c.estado === 'inactivo')
  const reincorporaciones = cambios.filter((c) => c.estado !== 'inactivo' && c.estado_previo === 'inactivo')
  const lesionadosCierre = await query(
    `select j.nombre, j.apellido from jugadores j
     where j.estado <> 'inactivo' and ${sqlLesionadoEnFecha('j.id', '$1::date')}
     order by j.apellido, j.nombre`, [hasta])

  const actuales = await plantel()
  const porPosicion = {}
  const porPuesto = {}
  const porAptitud = {}
  const edades = {}
  for (const j of actuales) {
    porPosicion[j.posicion || 'Sin puesto'] = (porPosicion[j.posicion || 'Sin puesto'] || 0) + 1
    const principal = j.puesto_principal || (j.puestos?.length === 1 ? j.puestos[0] : null)
    porPuesto[principal || 'sin_definir'] = (porPuesto[principal || 'sin_definir'] || 0) + 1
    for (const a of j.aptitudes || []) porAptitud[a] = (porAptitud[a] || 0) + 1
    const e = edadEn(j.fecha_nacimiento, hoy)
    edades[e == null ? 'sin_fecha' : e] = (edades[e == null ? 'sin_fecha' : e] || 0) + 1
  }
  return {
    activos_inicio: activosInicio,
    activos_cierre: activosCierre,
    altas: altas.map((a) => ({ nombre: nombre(a), fecha: a.fecha })),
    bajas: bajas.map((b) => ({ nombre: nombre(b), fecha: b.fecha, aproximado: b.aproximado })),
    reincorporaciones: reincorporaciones.map((b) => ({ nombre: nombre(b), fecha: b.fecha })),
    lesionados_cierre: lesionadosCierre.map(nombre),
    por_posicion: porPosicion,
    por_puesto: porPuesto,
    por_aptitud: porAptitud,
    edades,
    total_actual: actuales.length,
  }
}

function edadEn(fechaNacimiento, fecha) {
  if (!fechaNacimiento) return null
  const n = new Date(`${fechaNacimiento}T00:00:00Z`)
  const f = new Date(`${fecha}T00:00:00Z`)
  let e = f.getUTCFullYear() - n.getUTCFullYear()
  if (f.getUTCMonth() < n.getUTCMonth()
      || (f.getUTCMonth() === n.getUTCMonth() && f.getUTCDate() < n.getUTCDate())) e--
  return e
}

// ---------------------------------------------------------------------------
// Eventos del período (base de la actividad y de la calidad del registro)
// ---------------------------------------------------------------------------
async function eventosDe(desde, hasta) {
  return query(
    `select e.id, e.tipo, e.fecha::text as fecha, e.modalidad, e.suspendido, e.motivo_suspension,
            e.rival, e.lugar,
            (select count(*)::int from bloques bl where bl.evento_id = e.id) as bloques,
            (select count(*)::int from bloques bl where bl.evento_id = e.id and bl.suspendido) as bloques_suspendidos,
            (select count(*)::int from bloques bl where bl.evento_id = e.id and bl.cerrado_en is not null) as bloques_cerrados,
            (select string_agg(coalesce(bl.rival, '(sin rival)'), ' y ' order by bl.numero)
             from bloques bl where bl.evento_id = e.id and not bl.suspendido) as rivales,
            (select count(*)::int from tiempos t join bloques bl on bl.id = t.bloque_id
             where bl.evento_id = e.id) as tiempos,
            ${ASISTENCIA_TOMADA} as asistencia_tomada,
            (exists (select 1 from asistencias_staff s where s.evento_id = e.id)
             or exists (select 1 from bloque_staff bs join bloques bl on bl.id = bs.bloque_id
                        where bl.evento_id = e.id and bs.presente is not null)) as staff_tomado,
            (select pt.sin_planificacion from plan_tecnico pt where pt.evento_id = e.id) as plan_sin,
            exists (select 1 from trabajo_fisico tf where tf.evento_id = e.id) as planilla_fisica,
            (select v.nombre from viajes v where v.evento_id = e.id) as encuentro
     from eventos e
     where e.fecha between $1 and $2
     order by e.fecha, e.created_at`, [desde, hasta])
}

const estaSuspendido = (e) => e.suspendido || (e.bloques > 0 && e.bloques_suspendidos === e.bloques)

function resumirActividad(eventos, desde, hasta) {
  const ent = eventos.filter((e) => e.tipo === 'entrenamiento')
  const par = eventos.filter((e) => e.tipo === 'partido')
  const cuenta = (lista, f) => lista.filter(f).length
  const motivos = {}
  for (const e of eventos) {
    if (estaSuspendido(e)) motivos[e.motivo_suspension || 'sin_motivo'] = (motivos[e.motivo_suspension || 'sin_motivo'] || 0) + 1
  }
  const suspendidos = cuenta(eventos, estaSuspendido)
  const meses = mesesDe(desde, hasta)
  const porMes = meses.map((m) => ({
    mes: m,
    entrenamientos: cuenta(ent, (e) => mesDe(e.fecha) === m && !estaSuspendido(e)),
    partidos: cuenta(par, (e) => mesDe(e.fecha) === m && !estaSuspendido(e)),
    suspendidos: cuenta(eventos, (e) => mesDe(e.fecha) === m && estaSuspendido(e)),
  }))
  return {
    entrenamientos: {
      programados: ent.length,
      realizados: cuenta(ent, (e) => !estaSuspendido(e)),
      rutina: cuenta(ent, (e) => !estaSuspendido(e) && e.modalidad === 'rutina'),
      extra: cuenta(ent, (e) => !estaSuspendido(e) && e.modalidad === 'extra'),
      suspendidos: cuenta(ent, estaSuspendido),
    },
    partidos: {
      programados: par.length,
      realizados: cuenta(par, (e) => !estaSuspendido(e)),
      suspendidos: cuenta(par, estaSuspendido),
      parciales: cuenta(par, (e) => !estaSuspendido(e) && e.bloques_suspendidos > 0),
      bloques: par.reduce((n, e) => n + e.bloques, 0),
      bloques_jugados: par.reduce((n, e) => n + (e.suspendido ? 0 : e.bloques - e.bloques_suspendidos), 0),
      tiempos: par.reduce((n, e) => n + e.tiempos, 0),
      encuentros: cuenta(par, (e) => !!e.encuentro),
    },
    suspendidos: {
      total: suspendidos,
      pct: pct(suspendidos, eventos.length),
      motivos,
    },
    por_mes: porMes,
    // El calendario del período: un renglón por evento, lo justo para dibujarlo
    calendario: eventos.map((e) => ({
      fecha: e.fecha, tipo: e.tipo, modalidad: e.modalidad,
      suspendido: estaSuspendido(e), parcial: !estaSuspendido(e) && e.bloques_suspendidos > 0,
      rival: e.tipo === 'partido' ? (e.rivales || e.rival || null) : null,
      encuentro: e.encuentro,
    })),
  }
}

// ---------------------------------------------------------------------------
// Asistencia de los jugadores
// ---------------------------------------------------------------------------
async function marcasDe(desde, hasta) {
  // Una fila por jugador y evento que le podía contar. Los dados de baja
  // entran solo en los eventos con plantel congelado donde figuran: así el
  // que se fue a mitad del período cuenta hasta que se fue, y los de antes de
  // que existiera el congelado no arrastran ausencias falsas.
  return query(
    `select e.id as evento_id, e.fecha::text as fecha, e.tipo, j.id as jugador_id,
            j.nombre, j.apellido, j.estado,
            ${PRESENTE} as presente,
            ${LESIONADO} as lesionado,
            (e.tipo = 'partido'
             and exists (select 1 from asistencias a
                         where a.evento_id = e.id and a.jugador_id = j.id and a.estado = 'presente')
             and not exists (select 1 from asistencias_partido ap
                             where ap.evento_id = e.id and ap.jugador_id = j.id and ap.estado = 'presente')
            ) as falto_avisando,
            (e.tipo = 'partido'
             and not exists (select 1 from asistencias a
                             where a.evento_id = e.id and a.jugador_id = j.id and a.estado = 'presente')
             and exists (select 1 from asistencias_partido ap
                         where ap.evento_id = e.id and ap.jugador_id = j.id and ap.estado = 'presente')
            ) as fue_sin_avisar,
            coalesce((select ap.tarde from asistencias_partido ap
                      where ap.evento_id = e.id and ap.jugador_id = j.id), false) as tarde
     from eventos e
     cross join jugadores j
     where e.fecha between $1 and $2 and e.fecha <= current_date
       and ${EVENTO_VIGENTE} and ${ASISTENCIA_TOMADA}
       and (j.estado <> 'inactivo'
            or exists (select 1 from evento_plantel ep where ep.evento_id = e.id))
       and (${PRESENTE} or ${EN_PLANTEL})
     order by e.fecha, e.id`, [desde, hasta])
}

const FRANJAS = [
  { value: 'alta', label: '90% o más', min: 90, max: 101 },
  { value: 'buena', label: '75% a 89%', min: 75, max: 90 },
  { value: 'media', label: '50% a 74%', min: 50, max: 75 },
  { value: 'baja', label: 'Menos de 50%', min: 0, max: 50 },
]
const FALTAS_SEGUIDAS_AVISO = 3
const MINIMO_CONTABLES = 3

function resumirAsistencia(marcas, plantelActual, desde, hasta) {
  const porJugador = {}
  const porEvento = {}
  const porMes = {}
  for (const m of marcas) {
    const cuenta = m.presente || !m.lesionado
    const j = porJugador[m.jugador_id] ||= {
      id: m.jugador_id, nombre: nombre(m), estado: m.estado,
      ent_contables: 0, ent_presentes: 0, par_contables: 0, par_presentes: 0,
      excluidos: 0, falto_avisando: 0, fue_sin_avisar: 0, tarde: 0, secuencia: [],
    }
    const t = m.tipo === 'partido' ? 'par' : 'ent'
    if (cuenta) {
      j[`${t}_contables`]++
      if (m.presente) j[`${t}_presentes`]++
      j.secuencia.push(m.presente)
    } else j.excluidos++
    if (m.falto_avisando) j.falto_avisando++
    if (m.fue_sin_avisar) j.fue_sin_avisar++
    if (m.tarde && m.presente) j.tarde++

    const ev = porEvento[m.evento_id] ||= { fecha: m.fecha, tipo: m.tipo, contables: 0, presentes: 0, plantel: 0 }
    ev.plantel++
    if (cuenta) {
      ev.contables++
      if (m.presente) ev.presentes++
    }
    const mes = porMes[mesDe(m.fecha)] ||= { ent_contables: 0, ent_presentes: 0, par_contables: 0, par_presentes: 0 }
    if (cuenta) {
      mes[`${t}_contables`]++
      if (m.presente) mes[`${t}_presentes`]++
    }
  }

  const jugadores = Object.values(porJugador).map((j) => {
    const contables = j.ent_contables + j.par_contables
    const presentes = j.ent_presentes + j.par_presentes
    let seguidas = 0
    for (let i = j.secuencia.length - 1; i >= 0 && !j.secuencia[i]; i--) seguidas++
    return {
      id: j.id, nombre: j.nombre, estado: j.estado,
      contables, presentes, total: pct(presentes, contables),
      entrenamientos: pct(j.ent_presentes, j.ent_contables),
      partidos: pct(j.par_presentes, j.par_contables),
      ent_contables: j.ent_contables, ent_presentes: j.ent_presentes,
      par_contables: j.par_contables, par_presentes: j.par_presentes,
      excluidos: j.excluidos, falto_avisando: j.falto_avisando,
      fue_sin_avisar: j.fue_sin_avisar, tarde: j.tarde, faltas_seguidas: seguidas,
    }
  })

  const total = (campo) => jugadores.reduce((n, j) => n + j[campo], 0)
  const entContables = total('ent_contables')
  const entPresentes = total('ent_presentes')
  const parContables = total('par_contables')
  const parPresentes = total('par_presentes')
  const conDatos = jugadores.filter((j) => j.contables >= MINIMO_CONTABLES)
  const ordenados = [...conDatos].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre))
  const franjas = FRANJAS.map((f) => ({
    value: f.value, label: f.label,
    jugadores: conDatos.filter((j) => j.total >= f.min && j.total < f.max).length,
  }))
  const meses = mesesDe(desde, hasta).map((m) => {
    const r = porMes[m] || { ent_contables: 0, ent_presentes: 0, par_contables: 0, par_presentes: 0 }
    return {
      mes: m,
      entrenamientos: pct(r.ent_presentes, r.ent_contables),
      partidos: pct(r.par_presentes, r.par_contables),
      total: pct(r.ent_presentes + r.par_presentes, r.ent_contables + r.par_contables),
    }
  })
  const promedioSimple = promedio(conDatos.map((j) => j.total))
  return {
    division: {
      entrenamientos: pct(entPresentes, entContables),
      partidos: pct(parPresentes, parContables),
      total: pct(entPresentes + parPresentes, entContables + parContables),
      promedio_jugadores: promedioSimple == null ? null : Math.round(promedioSimple),
      jugadores_con_datos: conDatos.length,
      eventos_con_asistencia: Object.keys(porEvento).length,
      excluidos_por_lesion: total('excluidos'),
      falto_avisando: total('falto_avisando'),
      fue_sin_avisar: total('fue_sin_avisar'),
      tarde: total('tarde'),
    },
    por_mes: meses,
    por_evento: Object.values(porEvento)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((e) => ({ ...e, pct: pct(e.presentes, e.contables) })),
    franjas,
    mejores: ordenados.slice(0, 10),
    peores: ordenados.slice(-10).reverse(),
    faltas_seguidas: jugadores
      .filter((j) => j.estado !== 'inactivo' && j.faltas_seguidas >= FALTAS_SEGUIDAS_AVISO)
      .sort((a, b) => b.faltas_seguidas - a.faltas_seguidas)
      .map((j) => ({ nombre: j.nombre, faltas: j.faltas_seguidas })),
    sin_datos: plantelActual.filter((j) => !porJugador[j.id]).map(nombre),
    jugadores: jugadores.sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
async function staffDe(desde, hasta, eventos) {
  const filas = await query(
    `select s.email, s.nombre, s.apellido, s.rol, s.activo,
       (select count(*)::int from asistencias_staff a join eventos e on e.id = a.evento_id
        where a.staff_email = s.email and a.estado = 'presente'
          and e.tipo = 'entrenamiento' and e.fecha between $1 and $2 and ${EVENTO_VIGENTE}) as ent_presentes,
       (select count(*)::int from asistencias_staff a join eventos e on e.id = a.evento_id
        where a.staff_email = s.email
          and e.tipo = 'entrenamiento' and e.fecha between $1 and $2 and ${EVENTO_VIGENTE}) as ent_marcados,
       (select count(*)::int from bloque_staff bs
        join bloques bl on bl.id = bs.bloque_id join eventos e on e.id = bl.evento_id
        where bs.staff_email = s.email and e.fecha between $1 and $2
          and not e.suspendido and not bl.suspendido) as bloques_asignados,
       (select count(*)::int from bloque_staff bs
        join bloques bl on bl.id = bs.bloque_id join eventos e on e.id = bl.evento_id
        where bs.staff_email = s.email and e.fecha between $1 and $2
          and not e.suspendido and not bl.suspendido and bs.presente is not null) as bloques_marcados,
       (select count(*)::int from bloque_staff bs
        join bloques bl on bl.id = bs.bloque_id join eventos e on e.id = bl.evento_id
        where bs.staff_email = s.email and e.fecha between $1 and $2
          and not e.suspendido and not bl.suspendido and bs.presente) as bloques_presentes,
       (select count(*)::int from evaluaciones ev
        where ev.autor_email = s.email and ev.fecha between $1 and $2) as evaluaciones,
       (select count(*)::int from evaluaciones ev
        where ev.revisor_email = s.email
          and (ev.revisado_en at time zone '${ZONA}')::date between $1 and $2) as revisiones,
       (select count(*)::int from tests_fisicos t
        where t.autor_email = s.email and t.fecha between $1 and $2) as tests,
       (select count(*)::int from plan_tecnico pt join eventos e on e.id = pt.evento_id
        where pt.autor_email = s.email and e.fecha between $1 and $2) as planes,
       (select count(*)::int from trabajo_fisico tf join eventos e on e.id = tf.evento_id
        where tf.autor_email = s.email and e.fecha between $1 and $2) as planillas,
       (select count(*)::int from seguimientos sg
        where sg.autor_email = s.email and sg.fecha between $1 and $2) as seguimientos,
       (select count(*)::int from viaje_staff vs join viajes v on v.id = vs.viaje_id
        where vs.staff_email = s.email and v.fecha_salida between $1 and $2) as viajes,
       (select count(*)::int from procesos_evaluacion pr
        where pr.lanzado_por = s.email
          and (pr.lanzado_en at time zone '${ZONA}')::date between $1 and $2) as repartos
     from staff s
     order by s.rol, s.apellido, s.nombre`, [desde, hasta])
  // Denominador de la asistencia a entrenamientos: los que tuvieron tomada la
  // del staff (en los otros no se sabe quién fue)
  const entConToma = eventos.filter((e) => e.tipo === 'entrenamiento' && !estaSuspendido(e)
    && e.fecha <= hasta && e.staff_tomado).length
  const entRealizados = eventos.filter((e) => e.tipo === 'entrenamiento' && !estaSuspendido(e)).length
  const integrantes = filas
    .map((s) => {
      const actividad = s.evaluaciones + s.revisiones + s.tests + s.planes + s.planillas + s.seguimientos + s.repartos
      return {
        email: s.email, nombre: [s.nombre, s.apellido].filter(Boolean).join(' ') || s.email,
        rol: s.rol || 'Sin rol', activo: s.activo,
        entrenamientos: { presentes: s.ent_presentes, marcados: s.ent_marcados, tomados: entConToma, pct: pct(s.ent_presentes, entConToma) },
        partidos: { asignados: s.bloques_asignados, marcados: s.bloques_marcados, presentes: s.bloques_presentes, pct: pct(s.bloques_presentes, s.bloques_marcados) },
        evaluaciones: s.evaluaciones, revisiones: s.revisiones, tests: s.tests,
        planes: s.planes, planillas: s.planillas, seguimientos: s.seguimientos,
        viajes: s.viajes, repartos: s.repartos, actividad,
      }
    })
    // Los suspendidos sin ningún rastro en el período no aportan nada
    .filter((s) => s.activo || s.actividad || s.entrenamientos.presentes || s.partidos.asignados)
  return {
    entrenamientos_con_toma: entConToma,
    entrenamientos_realizados: entRealizados,
    cobertura_toma: pct(entConToma, entRealizados),
    integrantes,
  }
}

// ---------------------------------------------------------------------------
// Evaluaciones y seguimientos
// ---------------------------------------------------------------------------
async function evaluacionesDe(desde, hasta, plantelActual) {
  const [filas, procesos, seguimientos] = await Promise.all([
    query(
      `select ev.id, ev.jugador_id, ev.fecha::text as fecha, ev.valores, ev.valores_revisor,
              ev.autor_email, ev.revisor_email,
              j.nombre, j.apellido, j.estado
       from evaluaciones ev
       join jugadores j on j.id = ev.jugador_id
       where ev.fecha <= $2
         and ev.jugador_id in (select e2.jugador_id from evaluaciones e2 where e2.fecha between $1 and $2)
       order by ev.jugador_id, ev.fecha, ev.created_at`, [desde, hasta]),
    query(
      `select pr.id, (pr.lanzado_en at time zone '${ZONA}')::date::text as lanzado,
              pr.lanzado_por, pr.total,
              (pr.cerrado_en at time zone '${ZONA}')::date::text as cerrado,
              (pr.cancelado_en at time zone '${ZONA}')::date::text as cancelado,
              (pr.cerrado_en::date - pr.lanzado_en::date) as dias
       from procesos_evaluacion pr
       where (pr.lanzado_en at time zone '${ZONA}')::date between $1 and $2
       order by pr.lanzado_en`, [desde, hasta]),
    query(
      `select area, count(*)::int as cantidad, avg(valoracion)::float8 as promedio,
              count(*) filter (where comentario is not null and comentario <> '')::int as con_comentario
       from seguimientos where fecha between $1 and $2
       group by area`, [desde, hasta]),
  ])

  const delPeriodo = filas.filter((f) => f.fecha >= desde)
  const porJugador = {}
  for (const f of filas) (porJugador[f.jugador_id] ||= []).push(f)

  // La última evaluación del período de cada chico, y la anterior a esa (de
  // cuando sea) para medir el progreso
  const sumaVar = {}
  const sumaVarAnt = {}
  const progresos = []
  const generales = []
  for (const lista of Object.values(porJugador)) {
    const enRango = lista.filter((f) => f.fecha >= desde)
    const ultima = enRango[enRango.length - 1]
    const idx = lista.indexOf(ultima)
    const anterior = idx > 0 ? lista[idx - 1] : null
    const valores = valoresConsolidados(ultima)
    const general = promedioGeneral(valores)
    if (general != null) generales.push(general)
    for (const [k, v] of Object.entries(valores)) {
      if (!(v >= 1)) continue
      const s = sumaVar[k] ||= { suma: 0, n: 0 }
      s.suma += v
      s.n++
    }
    if (anterior) {
      const prev = valoresConsolidados(anterior)
      for (const [k, v] of Object.entries(valores)) {
        if (!(v >= 1) || !(prev[k] >= 1)) continue
        const s = sumaVarAnt[k] ||= { suma: 0, sumaAnt: 0, n: 0 }
        s.suma += v
        s.sumaAnt += prev[k]
        s.n++
      }
      const generalAnt = promedioGeneral(prev)
      if (general != null && generalAnt != null) {
        progresos.push({
          nombre: nombre(ultima), general, anterior: generalAnt,
          delta: redondear(general - generalAnt, 1), fecha_anterior: anterior.fecha,
        })
      }
    }
  }

  const variables = AREAS_EVAL.flatMap((a) => a.variables.map((v) => {
    const s = sumaVar[v.value]
    const c = sumaVarAnt[v.value]
    return {
      variable: v.value, label: v.label, area: a.value, area_label: a.label,
      promedio: s ? redondear(s.suma / s.n, 1) : null, n: s?.n || 0,
      delta: c ? redondear((c.suma - c.sumaAnt) / c.n, 2) : null, n_comparados: c?.n || 0,
    }
  }))
  const areas = AREAS_EVAL.map((a) => {
    const vs = variables.filter((v) => v.area === a.value && v.promedio != null)
    const ds = variables.filter((v) => v.area === a.value && v.delta != null)
    return {
      area: a.value, label: a.label,
      promedio: vs.length ? redondear(promedio(vs.map((v) => v.promedio)), 1) : null,
      delta: ds.length ? redondear(promedio(ds.map((v) => v.delta)), 2) : null,
    }
  })

  // Revisión cruzada: acuerdo entre miradas y variables donde más se difiere
  const revisadas = delPeriodo.filter((f) => f.valores_revisor)
  const acuerdos = revisadas.map(acuerdo).filter((a) => a != null)
  const difPorVariable = {}
  for (const f of revisadas) for (const k of diferencias(f)) difPorVariable[k] = (difPorVariable[k] || 0) + 1
  const masDiscutidas = Object.entries(difPorVariable)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => ({ variable: k, label: VARIABLES_EVAL[k]?.label || k, veces: n }))

  const evaluados = new Set(delPeriodo.map((f) => f.jugador_id))
  const distribucion = { '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0 }
  for (const g of generales) {
    if (g < 2) distribucion['1-2']++
    else if (g < 3) distribucion['2-3']++
    else if (g < 4) distribucion['3-4']++
    else distribucion['4-5']++
  }
  const ordenProgreso = [...progresos].sort((a, b) => b.delta - a.delta)
  return {
    cargadas: delPeriodo.length,
    jugadores_evaluados: evaluados.size,
    cobertura: pct(plantelActual.filter((j) => evaluados.has(j.id)).length, plantelActual.length),
    sin_evaluar: plantelActual.filter((j) => !evaluados.has(j.id)).map(nombre),
    revisadas: revisadas.length,
    acuerdo_promedio: acuerdos.length ? Math.round(promedio(acuerdos)) : null,
    mas_discutidas: masDiscutidas,
    promedio_general: generales.length ? redondear(promedio(generales), 1) : null,
    distribucion,
    areas,
    variables,
    comparados: progresos.length,
    mejoraron: progresos.filter((p) => p.delta > 0).length,
    empeoraron: progresos.filter((p) => p.delta < 0).length,
    mayor_progreso: ordenProgreso.slice(0, 10),
    mayor_retroceso: ordenProgreso.filter((p) => p.delta < 0).slice(-5).reverse(),
    procesos: {
      lanzados: procesos.length,
      cerrados: procesos.filter((p) => p.cerrado).length,
      cancelados: procesos.filter((p) => p.cancelado).length,
      abiertos: procesos.filter((p) => !p.cerrado && !p.cancelado).length,
      dias_promedio_cierre: redondear(promedio(procesos.filter((p) => p.dias != null).map((p) => Number(p.dias))), 0),
      detalle: procesos,
    },
    seguimientos: {
      total: seguimientos.reduce((n, s) => n + s.cantidad, 0),
      por_area: seguimientos.map((s) => ({
        area: s.area, cantidad: s.cantidad, promedio: redondear(s.promedio, 1), con_comentario: s.con_comentario,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Qué se entrenó: técnica (plan_tecnico) y físico (trabajo_fisico)
// ---------------------------------------------------------------------------
async function entrenadoDe(desde, hasta) {
  const [planes, propios, planillas] = await Promise.all([
    query(
      `select e.fecha::text as fecha, pt.aspectos, pt.sin_planificacion
       from plan_tecnico pt join eventos e on e.id = pt.evento_id
       where e.tipo = 'entrenamiento' and e.fecha between $1 and $2 and e.fecha <= current_date
         and ${EVENTO_VIGENTE}
       order by e.fecha`, [desde, hasta]),
    query('select clave, label, grupo from aspectos_tecnicos order by grupo, label'),
    query(
      `select e.fecha::text as fecha, tf.variables, tf.carga
       from trabajo_fisico tf join eventos e on e.id = tf.evento_id
       where e.tipo = 'entrenamiento' and e.fecha between $1 and $2 and e.fecha <= current_date
         and ${EVENTO_VIGENTE}
       order by e.fecha`, [desde, hasta]),
  ])

  // --- técnica ---
  const catalogo = [
    ...CLAVES_FIJAS.map((k) => ({ clave: k, label: ASPECTOS_FIJOS[k].label, grupo: ASPECTOS_FIJOS[k].grupo })),
    ...propios,
  ]
  const totales = {}
  let minutosTecnica = 0
  const conPlan = planes.filter((p) => !p.sin_planificacion)
  for (const p of conPlan) {
    for (const [clave, r] of Object.entries(repartirMinutos(p.aspectos))) {
      const t = totales[clave] ||= { veces: 0, minutos: 0, ultima: null }
      t.veces++
      t.minutos += r.minutos
      if (!t.ultima || p.fecha > t.ultima) t.ultima = p.fecha
      minutosTecnica += r.minutos
    }
  }
  const aspectos = catalogo
    .map((a) => ({ ...a, veces: 0, minutos: 0, ultima: null, ...totales[a.clave] }))
    .map((a) => ({ ...a, pct: pct(a.minutos, minutosTecnica) }))
    .sort((a, b) => b.minutos - a.minutos || a.label.localeCompare(b.label))
  const gruposTecnica = GRUPOS_TECNICOS.map((g) => {
    const min = aspectos.filter((a) => a.grupo === g.value).reduce((n, a) => n + a.minutos, 0)
    return { grupo: g.value, label: g.label, minutos: min, pct: pct(min, minutosTecnica) }
  })

  // --- físico ---
  const porVariable = {}
  const porIntensidad = { baja: 0, media: 0, alta: 0, sin: 0 }
  const porCarga = { baja: 0, media: 0, alta: 0, sin: 0 }
  let minutosFisico = 0
  for (const s of planillas) {
    porCarga[s.carga || 'sin']++
    for (const k of CLAVES_FISICAS) {
      const v = s.variables?.[k]
      if (!v || (!v.minutos && !v.intensidad)) continue
      const t = porVariable[k] ||= { sesiones: 0, minutos: 0, intensidades: { baja: 0, media: 0, alta: 0 } }
      t.sesiones++
      const min = Number(v.minutos) || 0
      t.minutos += min
      minutosFisico += min
      if (v.intensidad) t.intensidades[v.intensidad]++
      porIntensidad[v.intensidad || 'sin'] += min
    }
  }
  const variablesFisicas = CLAVES_FISICAS.map((k) => {
    const t = porVariable[k] || { sesiones: 0, minutos: 0, intensidades: {} }
    const intensidad = Object.entries(t.intensidades).sort((a, b) => b[1] - a[1])[0]
    return {
      variable: k, label: VARIABLES_FISICAS[k].label, grupo: VARIABLES_FISICAS[k].grupo,
      sesiones: t.sesiones, minutos: t.minutos, pct: pct(t.minutos, minutosFisico),
      intensidad: intensidad && intensidad[1] ? intensidad[0] : null,
    }
  }).sort((a, b) => b.minutos - a.minutos)
  const gruposFisico = GRUPOS_FISICOS.map((g) => {
    const min = variablesFisicas.filter((v) => v.grupo === g.value).reduce((n, v) => n + v.minutos, 0)
    return { grupo: g.value, label: g.label, minutos: min, pct: pct(min, minutosFisico) }
  })

  return {
    tecnica: {
      sesiones: conPlan.length,
      marcadas_sin_planificacion: planes.length - conPlan.length,
      minutos: minutosTecnica,
      aspectos,
      grupos: gruposTecnica,
      nunca_trabajados: aspectos.filter((a) => !a.veces).map((a) => a.label),
    },
    fisico: {
      sesiones: planillas.length,
      minutos: minutosFisico,
      variables: variablesFisicas,
      grupos: gruposFisico,
      por_intensidad: porIntensidad,
      por_carga: porCarga,
    },
  }
}

// ---------------------------------------------------------------------------
// Tests físicos
// ---------------------------------------------------------------------------
async function testsDe(desde, hasta, plantelActual) {
  const [mediciones, cortesFilas] = await Promise.all([
    query(
      `select t.jugador_id, t.test, t.fecha::text as fecha, t.valor::float8 as valor, t.semaforo,
              j.nombre, j.apellido
       from tests_fisicos t join jugadores j on j.id = t.jugador_id
       where t.fecha between $1 and $2
       order by t.jugador_id, t.test, t.fecha, t.created_at`, [desde, hasta]),
    query('select test, verde::float8 as verde, amarillo::float8 as amarillo from cortes_tests'),
  ])
  const cortes = Object.fromEntries(cortesFilas.map((c) => [c.test, c]))
  const porTestJugador = {}
  for (const m of mediciones) {
    const k = `${m.test}|${m.jugador_id}`
    const r = porTestJugador[k] ||= { test: m.test, jugador_id: m.jugador_id, nombre: nombre(m), lista: [] }
    r.lista.push(m)
  }
  const chicos = new Set(mediciones.map((m) => m.jugador_id))
  const porTest = CLAVES_TEST.map((test) => {
    const def = TESTS_POR_VALUE[test]
    const filas = Object.values(porTestJugador).filter((r) => r.test === test)
    const signo = def.mejor === 'mayor' ? 1 : def.mejor === 'menor' ? -1 : 0
    const jugadores = filas.map((r) => {
      const primera = r.lista[0]
      const ultima = r.lista[r.lista.length - 1]
      const cambio = r.lista.length > 1 ? redondear(ultima.valor - primera.valor, def.decimales) : null
      return {
        nombre: r.nombre, mediciones: r.lista.length,
        primera: primera.valor, fecha_primera: primera.fecha,
        ultima: ultima.valor, fecha_ultima: ultima.fecha,
        cambio, mejoro: cambio == null || !signo ? null : cambio * signo > 0,
        semaforo: ultima.semaforo || semaforoSugerido(test, ultima.valor, cortes),
      }
    })
    const conDos = jugadores.filter((j) => j.cambio != null)
    const semaforos = { verde: 0, amarillo: 0, rojo: 0, sin: 0 }
    for (const j of jugadores) semaforos[j.semaforo || 'sin']++
    const porMarca = [...jugadores].sort((a, b) => signo ? (b.ultima - a.ultima) * signo : 0)
    const porProgreso = [...conDos].sort((a, b) => (b.cambio - a.cambio) * signo)
    return {
      test, label: def.label, unidad: def.unidad, decimales: def.decimales, mejor: def.mejor,
      mediciones: filas.reduce((n, r) => n + r.lista.length, 0),
      jugadores_medidos: jugadores.length,
      sin_medir: plantelActual.length - plantelActual.filter((j) => filas.some((r) => r.jugador_id === j.id)).length,
      promedio_inicio: conDos.length ? redondear(promedio(conDos.map((j) => j.primera)), def.decimales) : null,
      promedio_cierre: conDos.length ? redondear(promedio(conDos.map((j) => j.ultima)), def.decimales) : null,
      promedio_ultima: jugadores.length ? redondear(promedio(jugadores.map((j) => j.ultima)), def.decimales) : null,
      con_dos_mediciones: conDos.length,
      mejoraron: signo ? conDos.filter((j) => j.mejoro).length : null,
      empeoraron: signo ? conDos.filter((j) => j.mejoro === false && j.cambio !== 0).length : null,
      semaforos: def.mejor ? semaforos : null,
      mejores_marcas: signo ? porMarca.slice(0, 5) : [],
      mayores_progresos: signo ? porProgreso.filter((j) => j.mejoro).slice(0, 5) : [],
      jugadores: jugadores.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }
  })
  return {
    mediciones: mediciones.length,
    chicos_medidos: chicos.size,
    sin_ninguna_medicion: plantelActual.filter((j) => !chicos.has(j.id)).map(nombre),
    por_test: porTest,
  }
}

// ---------------------------------------------------------------------------
// Lesiones y golpes
// ---------------------------------------------------------------------------
async function lesionesDe(desde, hasta, marcas) {
  const [nuevas, abiertas, condiciones] = await Promise.all([
    query(
      `select l.jugador_id, j.nombre, j.apellido, l.fecha::text as fecha, l.descripcion,
              l.fecha_retorno_estimada::text as retorno_estimado, l.recuperado,
              l.recuperado_en::text as recuperado_en,
              case when l.recuperado_en is not null then l.recuperado_en - l.fecha end as dias
       from lesiones l join jugadores j on j.id = l.jugador_id
       where l.fecha between $1 and $2
       order by l.fecha`, [desde, hasta]),
    query(
      `select j.nombre, j.apellido, l.fecha::text as fecha, l.descripcion,
              l.fecha_retorno_estimada::text as retorno_estimado
       from lesiones l join jugadores j on j.id = l.jugador_id
       where l.fecha <= $1 and j.estado <> 'inactivo'
         and ((not l.recuperado and l.recuperado_en is null) or l.recuperado_en > $1)
       order by l.fecha`, [hasta]),
    query(
      `select 'entrenamiento' as tipo, a.condicion, a.lesion_atendida, e.fecha::text as fecha,
              j.nombre, j.apellido
       from asistencias a join eventos e on e.id = a.evento_id join jugadores j on j.id = a.jugador_id
       where a.condicion is not null and e.fecha between $1 and $2
       union all
       select 'partido', ap.condicion, ap.lesion_atendida, e.fecha::text, j.nombre, j.apellido
       from asistencias_partido ap join eventos e on e.id = ap.evento_id join jugadores j on j.id = ap.jugador_id
       where ap.condicion is not null and e.fecha between $1 and $2
       order by 4`, [desde, hasta]),
  ])
  const porMes = {}
  for (const l of nuevas) porMes[mesDe(l.fecha)] = (porMes[mesDe(l.fecha)] || 0) + 1
  const porJugador = {}
  for (const l of nuevas) porJugador[l.jugador_id] = (porJugador[l.jugador_id] || { nombre: nombre(l), n: 0 })
  for (const l of nuevas) porJugador[l.jugador_id].n++
  const recuperadas = nuevas.filter((l) => l.dias != null)
  const cuenta = (f) => condiciones.filter(f).length
  return {
    nuevas: nuevas.length,
    por_mes: mesesDe(desde, hasta).map((m) => ({ mes: m, lesiones: porMes[m] || 0 })),
    dias_promedio_alta: recuperadas.length ? Math.round(promedio(recuperadas.map((l) => Number(l.dias)))) : null,
    recuperadas: recuperadas.length,
    abiertas_cierre: abiertas.map((l) => ({ nombre: nombre(l), fecha: l.fecha, descripcion: l.descripcion, retorno_estimado: l.retorno_estimado })),
    repetidas: Object.values(porJugador).filter((j) => j.n > 1).sort((a, b) => b.n - a.n),
    detalle: nuevas.map((l) => ({
      nombre: nombre(l), fecha: l.fecha, descripcion: l.descripcion,
      recuperado: l.recuperado, recuperado_en: l.recuperado_en, dias: l.dias == null ? null : Number(l.dias),
      retorno_estimado: l.retorno_estimado,
    })),
    eventos_perdidos: marcas.filter((m) => m.lesionado && !m.presente).length,
    golpes: {
      entrenamiento: { golpeados: cuenta((c) => c.tipo === 'entrenamiento' && c.condicion === 'golpeado'), lesionados: cuenta((c) => c.tipo === 'entrenamiento' && c.condicion === 'lesionado') },
      partido: { golpeados: cuenta((c) => c.tipo === 'partido' && c.condicion === 'golpeado'), lesionados: cuenta((c) => c.tipo === 'partido' && c.condicion === 'lesionado') },
      sin_atender: condiciones.filter((c) => c.condicion === 'lesionado' && !c.lesion_atendida)
        .map((c) => ({ nombre: nombre(c), fecha: c.fecha, tipo: c.tipo })),
    },
  }
}

// ---------------------------------------------------------------------------
// Partidos: valoración, rivales, equidad de tiempos y capitanías
// ---------------------------------------------------------------------------
async function partidosDe(desde, hasta, plantelActual) {
  const [bloques, tiempos, capitanias, nuncaCapitanes] = await Promise.all([
    query(
      `select e.fecha::text as fecha, bl.numero, bl.rival, bl.dificultad, bl.lugar, bl.valoracion,
              bl.cerrado_en is not null as cerrado,
              (select avg(t.valoracion)::float8 from tiempos t
               where t.bloque_id = bl.id and t.valoracion is not null) as valoracion_tiempos,
              (select count(*)::int from tiempos t where t.bloque_id = bl.id) as tiempos,
              (select count(*)::int from bloque_jugadores bj where bj.bloque_id = bl.id) as citados,
              (select v.nombre from viajes v where v.evento_id = e.id) as encuentro
       from bloques bl join eventos e on e.id = bl.evento_id
       where e.tipo = 'partido' and e.fecha between $1 and $2 and e.fecha <= current_date
         and not e.suspendido and not bl.suspendido
       order by e.fecha, bl.numero`, [desde, hasta]),
    query(
      `select j.id, j.nombre, j.apellido,
         (select count(*)::int from tiempo_jugadores tj
          join tiempos t on t.id = tj.tiempo_id join bloques bl on bl.id = t.bloque_id
          join eventos e on e.id = bl.evento_id
          where tj.jugador_id = j.id and e.fecha between $1 and $2) as tiempos,
         (select count(*)::int from tiempo_jugadores tj
          join tiempos t on t.id = tj.tiempo_id join bloques bl on bl.id = t.bloque_id
          join eventos e on e.id = bl.evento_id
          where tj.jugador_id = j.id and tj.prestado and e.fecha between $1 and $2) as prestados,
         (select count(*)::int from tiempos t
          join bloques bl on bl.id = t.bloque_id join bloque_jugadores bj on bj.bloque_id = bl.id
          join eventos e on e.id = bl.evento_id
          where bj.jugador_id = j.id and e.fecha between $1 and $2) as posibles,
         (select count(distinct bl.evento_id)::int from tiempo_jugadores tj
          join tiempos t on t.id = tj.tiempo_id join bloques bl on bl.id = t.bloque_id
          join eventos e on e.id = bl.evento_id
          where tj.jugador_id = j.id and e.fecha between $1 and $2) as partidos
       from jugadores j where j.estado <> 'inactivo'
       order by j.apellido, j.nombre`, [desde, hasta]),
    query(
      `select c.jugador_id, c.fecha::text as fecha, j.nombre, j.apellido
       from capitanias c join jugadores j on j.id = c.jugador_id
       where c.fecha between $1 and $2 order by c.fecha`, [desde, hasta]),
    query(
      `select j.nombre, j.apellido from jugadores j
       where j.estado <> 'inactivo'
         and not exists (select 1 from capitanias c where c.jugador_id = j.id)
       order by j.apellido, j.nombre`),
  ])
  const valorados = bloques.filter((b) => b.valoracion != null)
  const porDificultad = ['bueno', 'regular', 'malo', null].map((d) => {
    const lista = bloques.filter((b) => (b.dificultad || null) === d)
    const val = lista.filter((b) => b.valoracion != null)
    return {
      dificultad: d || 'sin_marcar', bloques: lista.length,
      valoracion: val.length ? redondear(promedio(val.map((b) => b.valoracion)), 1) : null,
    }
  }).filter((d) => d.bloques)
  const rivales = {}
  for (const b of bloques) {
    const r = rivales[b.rival || '(sin rival)'] ||= { rival: b.rival || '(sin rival)', bloques: 0, valoraciones: [] }
    r.bloques++
    if (b.valoracion != null) r.valoraciones.push(b.valoracion)
  }
  const lugares = {}
  for (const b of bloques) lugares[b.lugar || '(sin lugar)'] = (lugares[b.lugar || '(sin lugar)'] || 0) + 1
  const porMes = mesesDe(desde, hasta).map((m) => {
    const val = valorados.filter((b) => mesDe(b.fecha) === m)
    return { mes: m, bloques: bloques.filter((b) => mesDe(b.fecha) === m).length, valoracion: val.length ? redondear(promedio(val.map((b) => b.valoracion)), 1) : null }
  })
  const conTiempos = tiempos.filter((t) => t.posibles > 0)
  const totalTiempos = tiempos.reduce((n, t) => n + t.tiempos, 0)
  const capitanes = new Set(capitanias.map((c) => c.jugador_id))
  return {
    bloques: bloques.length,
    valorados: valorados.length,
    valoracion_promedio: valorados.length ? redondear(promedio(valorados.map((b) => b.valoracion)), 1) : null,
    valoracion_tiempos: (() => {
      const v = bloques.filter((b) => b.valoracion_tiempos != null).map((b) => b.valoracion_tiempos)
      return v.length ? redondear(promedio(v), 1) : null
    })(),
    distribucion_valoracion: [1, 2, 3, 4, 5].map((n) => ({ valoracion: n, bloques: valorados.filter((b) => b.valoracion === n).length })),
    por_dificultad: porDificultad,
    por_mes: porMes,
    rivales: Object.values(rivales)
      .map((r) => ({ rival: r.rival, bloques: r.bloques, valoracion: r.valoraciones.length ? redondear(promedio(r.valoraciones), 1) : null }))
      .sort((a, b) => b.bloques - a.bloques || a.rival.localeCompare(b.rival)),
    lugares: Object.entries(lugares).map(([lugar, bloques]) => ({ lugar, bloques })).sort((a, b) => b.bloques - a.bloques),
    cerrados: bloques.filter((b) => b.cerrado).length,
    tiempos: {
      total: totalTiempos,
      prestados: tiempos.reduce((n, t) => n + t.prestados, 0),
      promedio_por_jugador: conTiempos.length ? redondear(totalTiempos / conTiempos.length, 1) : null,
      jugadores_citados: conTiempos.length,
      menos_jugaron: [...conTiempos].sort((a, b) => a.tiempos - b.tiempos || a.posibles - b.posibles).slice(0, 8)
        .map((t) => ({ nombre: nombre(t), tiempos: t.tiempos, posibles: t.posibles, partidos: t.partidos })),
      mas_jugaron: [...conTiempos].sort((a, b) => b.tiempos - a.tiempos).slice(0, 5)
        .map((t) => ({ nombre: nombre(t), tiempos: t.tiempos, posibles: t.posibles, partidos: t.partidos })),
      jugadores: tiempos.map((t) => ({ nombre: nombre(t), tiempos: t.tiempos, prestados: t.prestados, posibles: t.posibles, partidos: t.partidos })),
    },
    capitanias: {
      total: capitanias.length,
      jugadores_distintos: capitanes.size,
      repetidos: Object.values(capitanias.reduce((acc, c) => {
        const r = acc[c.jugador_id] ||= { nombre: nombre(c), veces: 0 }
        r.veces++
        return acc
      }, {})).filter((r) => r.veces > 1),
      nunca: nuncaCapitanes.map(nombre),
      plantel: plantelActual.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Administrativo: papeles del plantel y viajes del período
// ---------------------------------------------------------------------------
async function administrativoDe(desde, hasta, hoy, plantelActual) {
  const viajes = await query(
    `select v.id, v.tipo, v.nombre, v.destino, v.club_anfitrion,
            v.fecha_salida::text as fecha_salida, v.fecha_regreso::text as fecha_regreso,
            v.precio::float8 as precio,
            (select count(*)::int from viaje_jugadores vj where vj.viaje_id = v.id) as jugadores,
            (select count(*)::int from viaje_staff vs where vs.viaje_id = v.id) as staff,
            (select coalesce(sum(vp.monto), 0)::float8 from viaje_pagos vp where vp.viaje_id = v.id) as cobrado,
            (select count(*)::int from viaje_jugadores vj where vj.viaje_id = v.id and vj.autorizacion) as autorizaciones,
            (select count(*)::int from viaje_jugadores vj where vj.viaje_id = v.id and vj.dni_copia) as copias_dni
     from viajes v
     where v.fecha_salida between $1 and $2
     order by v.fecha_salida`, [desde, hasta])
  const fichaVigente = (j) => (j.ficha_medica_vence ? j.ficha_medica_vence >= hoy : j.ficha_medica_vigente)
  const fichaVencida = (j) => !!j.ficha_medica_vence && j.ficha_medica_vence < hoy
  const n = plantelActual.length
  const cuenta = (f) => plantelActual.filter(f).length
  return {
    plantel: n,
    ficha_vigente: cuenta(fichaVigente),
    ficha_vencida: cuenta(fichaVencida),
    sin_ficha: cuenta((j) => !fichaVigente(j) && !fichaVencida(j)),
    ficha_pct: pct(cuenta(fichaVigente), n),
    dni_cargado: cuenta((j) => !!j.dni),
    dni_escaneado: cuenta((j) => j.dni_escaneado),
    tutor_completo: cuenta((j) => j.tutor_nombre && j.tutor_telefono),
    fecha_nacimiento: cuenta((j) => !!j.fecha_nacimiento),
    puestos_cargados: cuenta((j) => (j.puestos || []).length > 0),
    sin_ficha_nombres: plantelActual.filter((j) => !fichaVigente(j)).map(nombre),
    sin_dni_nombres: plantelActual.filter((j) => !j.dni).map(nombre),
    viajes: viajes.map((v) => ({
      ...v,
      esperado: v.precio != null ? redondear(v.precio * v.jugadores, 2) : null,
      cobrado_pct: v.precio ? pct(v.cobrado, v.precio * v.jugadores) : null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Calidad del registro: lo que falta cargar para confiar en el resto
// ---------------------------------------------------------------------------
function calidadDelRegistro(eventos, hoy) {
  const pasados = eventos.filter((e) => e.fecha <= hoy && !estaSuspendido(e))
  const ent = pasados.filter((e) => e.tipo === 'entrenamiento')
  const par = pasados.filter((e) => e.tipo === 'partido')
  const fechas = (lista) => lista.map((e) => e.fecha)
  return {
    eventos_pasados: pasados.length,
    sin_asistencia: fechas(pasados.filter((e) => !e.asistencia_tomada)),
    sin_asistencia_staff: ent.filter((e) => !e.staff_tomado).length,
    entrenamientos: ent.length,
    sin_plan_tecnico: fechas(ent.filter((e) => e.plan_sin == null)),
    marcados_sin_planificacion: ent.filter((e) => e.plan_sin === true).length,
    sin_planilla_fisica: fechas(ent.filter((e) => !e.planilla_fisica)),
    partidos: par.length,
    bloques_sin_cerrar: par.reduce((n, e) => n + (e.bloques - e.bloques_suspendidos - e.bloques_cerrados), 0),
    partidos_sin_tiempos: fechas(par.filter((e) => !e.tiempos)),
  }
}

// ---------------------------------------------------------------------------
// Indicadores sueltos de un período (para compararlo con el anterior)
// ---------------------------------------------------------------------------
async function indicadores(desde, hasta) {
  const [eventos, marcas, [ev], [les], [tst], planes, activos] = await Promise.all([
    eventosDe(desde, hasta),
    marcasDe(desde, hasta),
    query('select count(*)::int as n from evaluaciones where fecha between $1 and $2', [desde, hasta]),
    query('select count(*)::int as n from lesiones where fecha between $1 and $2', [desde, hasta]),
    query('select count(distinct jugador_id)::int as n from tests_fisicos where fecha between $1 and $2', [desde, hasta]),
    query(
      `select pt.aspectos from plan_tecnico pt join eventos e on e.id = pt.evento_id
       where e.tipo = 'entrenamiento' and e.fecha between $1 and $2 and e.fecha <= current_date
         and not pt.sin_planificacion and ${EVENTO_VIGENTE}`, [desde, hasta]),
    activosEn(hasta),
  ])
  const actividad = resumirActividad(eventos, desde, hasta)
  const asistencia = resumirAsistencia(marcas, [], desde, hasta)
  const minutos = planes.reduce((n, p) => n + Object.values(repartirMinutos(p.aspectos)).reduce((m, r) => m + r.minutos, 0), 0)
  // Promedio general de la última evaluación del período de cada chico
  const ultimas = await query(
    `select distinct on (jugador_id) valores, valores_revisor from evaluaciones
     where fecha between $1 and $2 order by jugador_id, fecha desc, created_at desc`, [desde, hasta])
  const generales = ultimas.map((u) => promedioGeneral(valoresConsolidados(u))).filter((g) => g != null)
  return {
    activos,
    asistencia_entrenamientos: asistencia.division.entrenamientos,
    asistencia_partidos: asistencia.division.partidos,
    entrenamientos: actividad.entrenamientos.realizados,
    partidos: actividad.partidos.realizados,
    suspendidos_pct: actividad.suspendidos.pct,
    evaluaciones: ev.n,
    lesiones: les.n,
    chicos_con_tests: tst.n,
    minutos_tecnica: minutos,
    promedio_evaluacion: generales.length ? redondear(promedio(generales), 1) : null,
  }
}
