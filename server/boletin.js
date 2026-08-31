// Datos del boletín mensual de desempeño de cada jugador.
//
// Todo lo que sale acá es asistencia y rugby jugado: el boletín no muestra
// NADA de las evaluaciones periódicas ni de los tests físicos. Es material que
// lee el propio chico.
//
// Reglas del cálculo, iguales para todos:
// - Cuentan los eventos del mes ya ocurridos, no suspendidos y con la
//   asistencia efectivamente tomada. Los partidos van siempre por la
//   asistencia real de la cancha (asistencias_partido).
// - Sin marca de presente, cuenta ausente.
// - Los eventos que el chico se perdió estando lesionado no le cuentan como
//   falta: salen de su denominador y se informan aparte.
// - Los jugadores inactivos quedan afuera del promedio y del ranking.
import { query } from './db.js'

// Meses que muestra el gráfico de evolución, contando el del boletín
const MESES_EVOLUCION = 6
// Mínimo de eventos del mes para publicar ranking y distinciones: con menos,
// un solo entrenamiento decide el podio y el número no dice nada.
const MINIMO_EVENTOS = 3

const mesValido = (mes) => /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
const primerDia = (mes) => `${mes}-01`
const sumarMeses = (mes, n) => {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const pct = (presentes, total) => (total ? Math.round((100 * presentes) / total) : null)

// Un evento vigente es el que no está suspendido del todo (mismo criterio que
// el resto de las estadísticas: un partido con un bloque suspendido cuenta).
const EVENTO_VIGENTE = `(not e.suspendido and (
  not exists (select 1 from bloques bl where bl.evento_id = e.id)
  or exists (select 1 from bloques bl where bl.evento_id = e.id and not bl.suspendido)))`

// Eventos con asistencia tomada, según de dónde sale la de cada tipo
const ASISTENCIA_TOMADA = `(
  (e.tipo = 'entrenamiento' and exists (select 1 from asistencias a where a.evento_id = e.id))
  or (e.tipo = 'partido' and exists (select 1 from asistencias_partido a where a.evento_id = e.id)))`

// ¿El jugador estuvo presente en ese evento?
const PRESENTE = `(case when e.tipo = 'entrenamiento'
  then exists (select 1 from asistencias a
               where a.evento_id = e.id and a.jugador_id = j.id and a.estado = 'presente')
  else exists (select 1 from asistencias_partido ap
               where ap.evento_id = e.id and ap.jugador_id = j.id and ap.estado = 'presente') end)`

// ¿Estaba lesionado ese día? La lesión no guarda fecha de alta real, así que
// la ventana va desde la fecha de la lesión hasta el retorno estimado; si
// sigue abierta y no tiene estimación, hasta hoy.
const LESIONADO = `exists (
  select 1 from lesiones l
  where l.jugador_id = j.id and e.fecha >= l.fecha
    and e.fecha <= coalesce(l.fecha_retorno_estimada,
                            case when l.recuperado then l.fecha else current_date end))`

// Asistencia de todos los jugadores activos, mes por mes, en el rango pedido.
// Una fila por (mes, jugador, tipo de evento).
async function asistenciaPorMes(desde, hasta) {
  return query(
    `with marcas as (
       select to_char(e.fecha, 'YYYY-MM') as mes, j.id as jugador_id, e.tipo,
              ${PRESENTE} as presente,
              ${LESIONADO} as lesionado
       from eventos e
       cross join jugadores j
       where e.fecha >= $1::date and e.fecha < $2::date and e.fecha <= current_date
         and j.estado <> 'inactivo'
         and ${EVENTO_VIGENTE} and ${ASISTENCIA_TOMADA}
     )
     select mes, jugador_id, tipo,
       count(*) filter (where presente or not lesionado)::int as contables,
       count(*) filter (where presente)::int as presentes,
       count(*) filter (where lesionado and not presente)::int as excluidos
     from marcas
     group by mes, jugador_id, tipo`,
    [desde, hasta])
}

// Arma { jugador_id: { total, entrenamientos, partidos, excluidos } } de un mes
function resumirMes(filas, mes) {
  const porJugador = {}
  for (const f of filas.filter((x) => x.mes === mes)) {
    const r = porJugador[f.jugador_id] ||= {
      presentes: 0, contables: 0, excluidos: 0,
      ent_presentes: 0, ent_contables: 0, par_presentes: 0, par_contables: 0,
    }
    r.presentes += f.presentes
    r.contables += f.contables
    r.excluidos += f.excluidos
    const p = f.tipo === 'partido' ? 'par' : 'ent'
    r[`${p}_presentes`] += f.presentes
    r[`${p}_contables`] += f.contables
  }
  for (const r of Object.values(porJugador)) {
    r.total = pct(r.presentes, r.contables)
    r.entrenamientos = pct(r.ent_presentes, r.ent_contables)
    r.partidos = pct(r.par_presentes, r.par_contables)
  }
  return porJugador
}

// Promedio simple de los porcentajes de los jugadores con eventos contables:
// es el número contra el que se compara cada chico.
function promedioDivision(resumen) {
  const valores = Object.values(resumen).map((r) => r.total).filter((v) => v != null)
  if (!valores.length) return null
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
}

// Puesto de cada jugador por asistencia total, con empates compartiendo lugar
function ranking(resumen) {
  const orden = Object.entries(resumen)
    .filter(([, r]) => r.total != null)
    .sort((a, b) => b[1].total - a[1].total)
  const puestos = {}
  orden.forEach(([id, r], i) => {
    const previo = orden[i - 1]
    puestos[id] = previo && previo[1].total === r.total ? puestos[previo[0]] : i + 1
  })
  return { puestos, total: orden.length }
}

export async function boletines({ mes, jugadorId = null }) {
  if (!mesValido(mes)) throw { codigo: 400, error: 'mes_invalido' }
  const desde = primerDia(sumarMeses(mes, -(MESES_EVOLUCION - 1)))
  const hasta = primerDia(sumarMeses(mes, 1))
  const inicioMes = primerDia(mes)

  const filas = await asistenciaPorMes(desde, hasta)
  const meses = Array.from({ length: MESES_EVOLUCION },
    (_, i) => sumarMeses(mes, i - (MESES_EVOLUCION - 1)))
  const resumenPorMes = Object.fromEntries(meses.map((m) => [m, resumirMes(filas, m)]))
  const delMes = resumenPorMes[mes]
  const promedios = Object.fromEntries(
    meses.map((m) => [m, promedioDivision(resumenPorMes[m])]))
  const { puestos, total: rankeados } = ranking(delMes)

  // Acumulado del año calendario del mes pedido
  const filasAnio = await asistenciaPorMes(`${mes.slice(0, 4)}-01-01`, hasta)
  const anio = resumirMes(
    filasAnio.map((f) => ({ ...f, mes: 'anio' })), 'anio')
  const promedioAnio = promedioDivision(anio)
  const { puestos: puestosAnio, total: rankeadosAnio } = ranking(anio)

  const eventosDelMes = await query(
    `select e.id, e.tipo, e.fecha::text as fecha,
            coalesce(e.rival, (select string_agg(bl.rival, ' y ' order by bl.numero)
                               from bloques bl where bl.evento_id = e.id and bl.rival is not null)) as rival
     from eventos e
     where e.fecha >= $1::date and e.fecha < $2::date and e.fecha <= current_date
       and ${EVENTO_VIGENTE} and ${ASISTENCIA_TOMADA}
     order by e.fecha`,
    [inicioMes, hasta])

  const jugadores = await query(
    `select id, nombre, apellido, fecha_nacimiento::text as fecha_nacimiento,
            puestos, puesto_principal
     from jugadores
     where estado <> 'inactivo' ${jugadorId ? 'and id = $1' : ''}
     order by apellido, nombre`,
    jugadorId ? [jugadorId] : [])
  if (jugadorId && !jugadores.length) throw { codigo: 404, error: 'no_existe' }

  const hayRanking = eventosDelMes.length >= MINIMO_EVENTOS
  const armados = []
  for (const j of jugadores) {
    armados.push(await boletinDe({
      jugador: j, mes, inicioMes, hasta, eventosDelMes, hayRanking,
      resumen: delMes[j.id], puesto: puestos[j.id] ?? null, rankeados,
      anio: anio[j.id], promedioAnio, puestoAnio: puestosAnio[j.id] ?? null, rankeadosAnio,
      evolucion: meses.map((m) => ({
        mes: m,
        jugador: resumenPorMes[m][j.id]?.total ?? null,
        division: promedios[m],
      })),
      progreso: progresoDe(resumenPorMes, meses, j.id),
      mejorProgreso: mejorProgreso(resumenPorMes, meses),
    }))
  }

  return {
    mes,
    division: {
      eventos: eventosDelMes.length,
      promedio: promedios[mes],
      jugadores: rankeados,
      hay_ranking: hayRanking,
    },
    jugadores: armados,
  }
}

// Cuánto mejoró (o cayó) contra el mes anterior, en puntos
function progresoDe(resumenPorMes, meses, jugadorId) {
  const actual = resumenPorMes[meses.at(-1)][jugadorId]?.total
  const previo = resumenPorMes[meses.at(-2)]?.[jugadorId]?.total
  if (actual == null || previo == null) return null
  return actual - previo
}

// La mejor mejora de toda la división, para la distinción "el que más mejoró"
function mejorProgreso(resumenPorMes, meses) {
  const actual = resumenPorMes[meses.at(-1)]
  let mejor = 0
  for (const id of Object.keys(actual)) {
    const p = progresoDe(resumenPorMes, meses, id)
    if (p != null && p > mejor) mejor = p
  }
  return mejor
}

async function boletinDe({
  jugador, mes, inicioMes, hasta, eventosDelMes, hayRanking, resumen, puesto, rankeados,
  anio, promedioAnio, puestoAnio, rankeadosAnio, evolucion, progreso, mejorProgreso,
}) {
  const id = jugador.id
  const rango = [id, inicioMes, hasta]

  // Marca del jugador en cada evento del mes (presente, tarde, golpe) y si
  // ese día estaba lesionado
  const marcas = await query(
    `select e.id as evento_id,
       ${PRESENTE} as presente,
       ${LESIONADO} as lesionado,
       (select ap.tarde from asistencias_partido ap
        where ap.evento_id = e.id and ap.jugador_id = j.id) as tarde,
       (case when e.tipo = 'entrenamiento'
          then (select a.condicion from asistencias a
                where a.evento_id = e.id and a.jugador_id = j.id)
          else (select ap.condicion from asistencias_partido ap
                where ap.evento_id = e.id and ap.jugador_id = j.id) end) as condicion,
       -- Avisó durante la semana que iba al partido y el día no se presentó
       (e.tipo = 'partido'
        and exists (select 1 from asistencias a
                    where a.evento_id = e.id and a.jugador_id = j.id and a.estado = 'presente')
        and not exists (select 1 from asistencias_partido ap
                        where ap.evento_id = e.id and ap.jugador_id = j.id and ap.estado = 'presente')
       ) as falto_avisando,
       (select count(*)::int from tiempo_jugadores tj
        join tiempos t on t.id = tj.tiempo_id
        join bloques bl on bl.id = t.bloque_id
        where bl.evento_id = e.id and tj.jugador_id = j.id) as tiempos,
       exists (select 1 from capitanias c
               where c.jugador_id = j.id and c.fecha = e.fecha) as capitan
     from eventos e
     cross join jugadores j
     where j.id = $1
       and e.fecha >= $2::date and e.fecha < $3::date and e.fecha <= current_date
       and ${EVENTO_VIGENTE} and ${ASISTENCIA_TOMADA}
     order by e.fecha`,
    rango)
  const porEvento = Object.fromEntries(marcas.map((m) => [m.evento_id, m]))

  const dias = eventosDelMes.map((e) => {
    const m = porEvento[e.id] || {}
    return {
      fecha: e.fecha,
      tipo: e.tipo,
      rival: e.rival,
      presente: !!m.presente,
      // Se lo perdió estando lesionado: no cuenta como falta
      excluido: !m.presente && !!m.lesionado,
      tarde: !!m.tarde,
      condicion: m.condicion || null,
      falto_avisando: !!m.falto_avisando,
      tiempos: m.tiempos || 0,
      capitan: !!m.capitan,
    }
  })

  // Rugby jugado en el mes
  const [juego] = await query(
    `select
       (select count(distinct bl.evento_id)::int
        from tiempo_jugadores tj
        join tiempos t on t.id = tj.tiempo_id
        join bloques bl on bl.id = t.bloque_id
        join eventos e on e.id = bl.evento_id
        where tj.jugador_id = $1 and e.fecha >= $2::date and e.fecha < $3::date) as partidos_jugados,
       (select count(*)::int
        from tiempo_jugadores tj
        join tiempos t on t.id = tj.tiempo_id
        join bloques bl on bl.id = t.bloque_id
        join eventos e on e.id = bl.evento_id
        where tj.jugador_id = $1 and e.fecha >= $2::date and e.fecha < $3::date) as tiempos_jugados,
       -- Tiempos que se jugaron en los bloques a los que estuvo citado
       (select count(*)::int
        from tiempos t
        join bloques bl on bl.id = t.bloque_id
        join bloque_jugadores bj on bj.bloque_id = bl.id and bj.jugador_id = $1
        join eventos e on e.id = bl.evento_id
        where e.fecha >= $2::date and e.fecha < $3::date) as tiempos_posibles,
       (select count(*)::int
        from tiempo_jugadores tj
        join tiempos t on t.id = tj.tiempo_id
        join bloques bl on bl.id = t.bloque_id
        join eventos e on e.id = bl.evento_id
        where tj.jugador_id = $1 and tj.prestado
          and e.fecha >= $2::date and e.fecha < $3::date) as prestado`,
    rango)

  const camisetas = await query(
    `select tj.puesto, count(*)::int as tiempos
     from tiempo_jugadores tj
     join tiempos t on t.id = tj.tiempo_id
     join bloques bl on bl.id = t.bloque_id
     join eventos e on e.id = bl.evento_id
     where tj.jugador_id = $1 and tj.puesto is not null
       and e.fecha >= $2::date and e.fecha < $3::date
     group by tj.puesto
     order by count(*) desc, tj.puesto`,
    rango)

  const [capitanias] = await query(
    `select count(*) filter (where fecha >= $2::date and fecha < $3::date)::int as mes,
            count(*) filter (where date_part('year', fecha) = date_part('year', $2::date))::int as anio
     from capitanias where jugador_id = $1`,
    rango)

  // Lesiones que pisan el mes, para la nota de arriba de la hoja
  const lesiones = await query(
    `select fecha::text as fecha, descripcion, recuperado,
            fecha_retorno_estimada::text as fecha_retorno_estimada
     from lesiones
     where jugador_id = $1 and fecha < $3::date
       and coalesce(fecha_retorno_estimada,
                    case when recuperado then fecha else current_date end) >= $2::date
     order by fecha`,
    rango)

  const tarde = dias.filter((d) => d.tarde).map((d) => d.fecha)
  const faltoAvisando = dias.filter((d) => d.falto_avisando)
  const golpes = dias.filter((d) => d.condicion)
  const partidosDelMes = dias.filter((d) => d.tipo === 'partido' && !d.excluido)
  const r = resumen || { total: null, entrenamientos: null, partidos: null, excluidos: 0 }

  return {
    jugador: {
      id, nombre: jugador.nombre, apellido: jugador.apellido,
      puestos: jugador.puestos || [], puesto_principal: jugador.puesto_principal,
    },
    asistencia: {
      total: r.total,
      presentes: r.presentes || 0,
      contables: r.contables || 0,
      entrenamientos: r.entrenamientos,
      entrenamientos_presentes: r.ent_presentes || 0,
      entrenamientos_contables: r.ent_contables || 0,
      partidos: r.partidos,
      partidos_presentes: r.par_presentes || 0,
      partidos_contables: r.par_contables || 0,
      excluidos_por_lesion: r.excluidos || 0,
    },
    puesto_ranking: hayRanking ? puesto : null,
    de_cuantos: rankeados,
    anio: {
      total: anio?.total ?? null,
      promedio_division: promedioAnio,
      puesto: puestoAnio,
      de_cuantos: rankeadosAnio,
    },
    evolucion,
    progreso,
    juego: {
      partidos_jugados: juego.partidos_jugados,
      tiempos_jugados: juego.tiempos_jugados,
      tiempos_posibles: juego.tiempos_posibles,
      prestado: juego.prestado,
      camisetas,
      capitanias_mes: capitanias.mes,
      capitanias_anio: capitanias.anio,
    },
    puntualidad: {
      tarde,
      falto_avisando: faltoAvisando.map((d) => ({ fecha: d.fecha, rival: d.rival })),
      golpes: golpes.map((d) => ({ fecha: d.fecha, condicion: d.condicion })),
    },
    lesiones,
    dias,
    distinciones: distincionesDe({
      hayRanking, puesto, resumen: r, partidosDelMes, progreso, mejorProgreso,
      capitanias: capitanias.mes, diasCapitan: dias.filter((d) => d.capitan),
    }),
  }
}

// Solo se listan las que ganó: el boletín nunca dice lo que no consiguió.
function distincionesDe({
  hayRanking, puesto, resumen, partidosDelMes, progreso, mejorProgreso,
  capitanias, diasCapitan,
}) {
  const lista = []
  if (hayRanking && puesto && puesto <= 3 && resumen.total != null) {
    lista.push({
      tipo: 'podio',
      marca: `${puesto}.º`,
      titulo: 'Podio de asistencia',
      detalle: 'de toda la división',
    })
  }
  if (hayRanking && progreso != null && progreso > 0 && progreso === mejorProgreso) {
    lista.push({
      tipo: 'progreso',
      marca: `+${progreso}`,
      titulo: 'El que más mejoró',
      detalle: 'puntos contra el mes pasado',
    })
  }
  if (resumen.total === 100 && (resumen.contables || 0) >= 3) {
    lista.push({
      tipo: 'perfecta',
      marca: `${resumen.presentes}/${resumen.contables}`,
      titulo: 'Asistencia perfecta',
      detalle: 'no faltaste a nada',
    })
  } else if (partidosDelMes.length && partidosDelMes.every((d) => d.presente)) {
    lista.push({
      tipo: 'partidos',
      marca: `${partidosDelMes.length}/${partidosDelMes.length}`,
      titulo: 'Estuviste en todos los partidos',
      detalle: partidosDelMes.length === 1 ? 'el único del mes' : 'sin faltar a ninguno',
    })
  }
  if (capitanias) {
    const dia = diasCapitan[0]
    lista.push({
      tipo: 'capitan',
      marca: 'C',
      titulo: capitanias === 1 ? 'Capitán' : `Capitán ${capitanias} veces`,
      detalle: dia?.rival ? `contra ${dia.rival}` : 'este mes',
    })
  }
  return lista
}
