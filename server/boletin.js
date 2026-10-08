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
// - Los eventos anteriores a su llegada al plantel tampoco cuentan: el que
//   entró en septiembre no arrastra las ausencias de marzo.
// - Los jugadores inactivos quedan afuera del promedio y del ranking.
//
// La única excepción a lo de las evaluaciones son los objetivos del mes: se
// eligen mirando la última evaluación, pero al boletín solo llega la frase de
// qué practicar. Ni la nota, ni el área, ni la fecha de esa evaluación salen
// de acá.
import { query } from './db.js'
import { sqlLesionadoEnFecha, sqlEnPlantel } from './asistencia-sql.js'
import { AREAS_EVAL, bandaEtaria, valoresConsolidados } from '../src/evaluacion.js'
import { textoDesafio, textoObjetivo } from '../src/objetivos.js'

// Cuántas cosas para practicar salen en la hoja
const OBJETIVOS_POR_BOLETIN = 2
// Lo social no se imprime en algo que se lleva a la casa: eso se habla de
// frente. Lo actitudinal sí, con el mismo tono suave que el resto.
const AREAS_OBJETIVO = ['tecnica', 'tactica', 'fisica', 'actitudinal']
// Una evaluación más vieja que esto ya no describe al chico de este mes
const DIAS_EVALUACION_VIGENTE = 90
// Hasta esta nota (escala 1 a 5) la variable entra como objetivo. Por encima,
// no hay nada que marcarle: va un desafío sobre lo que ya hace bien.
const NOTA_OBJETIVO = 3

const AREA_DE_VARIABLE = Object.fromEntries(
  AREAS_EVAL.flatMap((a) => a.variables.map((v) => [v.value, a.value])))

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

// Los dos criterios compartidos con el router, para que el boletín y las
// pantallas no se separen: ¿estaba lesionado ese día? ¿ya estaba en el plantel?
const LESIONADO = sqlLesionadoEnFecha('j.id', 'e.fecha')
const EN_PLANTEL = sqlEnPlantel('j.id', 'e')

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
         and (${PRESENTE} or ${EN_PLANTEL})
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

// Zona del club: el "hoy" de la validez del guardado y de las fechas
const ZONA = 'America/Argentina/Tucuman'

// Los boletines de un mes se arman una vez y quedan guardados en
// `boletines_guardados` (una fila por mes con el JSON completo): abrir el mes
// o cambiar de mes es una sola lectura. El guardado vale hasta que cambie
// algo de lo que sale en la hoja (ver invalidarGuardados) y, por las dudas,
// se rearma el primer día que se lo pide: un par de criterios miran la fecha
// de hoy (lesiones abiertas, eventos futuros).
export async function boletines({ mes, jugadorId = null }) {
  if (!mesValido(mes)) throw { codigo: 400, error: 'mes_invalido' }
  const todos = await leerGuardado(mes) || await armarYGuardar(mes)
  if (!jugadorId) return todos
  const propio = todos.jugadores.find((b) => b.jugador.id === jugadorId)
  if (!propio) throw { codigo: 404, error: 'no_existe' }
  return { ...todos, jugadores: [propio] }
}

async function leerGuardado(mes) {
  const [fila] = await query(
    `select datos from boletines_guardados
     where mes = $1
       and (generado_en at time zone $2)::date = (now() at time zone $2)::date`,
    [mes, ZONA])
  if (!fila) return null
  return typeof fila.datos === 'string' ? JSON.parse(fila.datos) : fila.datos
}

async function armarYGuardar(mes) {
  const datos = await armar(mes)
  await query(
    `insert into boletines_guardados (mes, datos, generado_en)
     values ($1, $2::jsonb, now())
     on conflict (mes) do update set datos = excluded.datos, generado_en = excluded.generado_en`,
    [mes, JSON.stringify(datos)])
  return datos
}

// Rutas cuyas escrituras no tocan ninguna de las tablas que lee el boletín
// (eventos, asistencias, plantel, bloques, tiempos, capitanías, lesiones,
// evaluaciones y los datos del jugador). Una ruta nueva nace invalidando:
// solo se suma acá si está claro que no cambia nada de lo que sale en la hoja.
const RUTAS_AJENAS = new Set([
  'auth', 'health', 'cron', 'me', 'push', 'documentos', 'staff', 'viajes',
  'boletin', 'tests', 'seguimientos', 'aspectos-tecnicos', 'asignaciones',
  'sugerencias', 'stats',
])
// Rutas que escriben sobre un evento puntual (p[1] es su id): alcanza con
// tirar los meses desde el del evento, así una toma de asistencia de hoy no
// hace rearmar los meses ya cerrados.
const RUTAS_DE_EVENTO = new Set(['eventos', 'partido'])

// Se llama después de cada escritura que salió bien: tira los guardados que
// esa escritura pudo haber dejado viejos. Un boletín de un mes mira los seis
// meses anteriores y el año hasta ese mes, así que un cambio en un evento
// alcanza a todos los meses desde el suyo en adelante (nunca a los previos).
export async function invalidarGuardados(metodo, p, b) {
  if (metodo === 'GET' || !p[0] || RUTAS_AJENAS.has(p[0])) return
  // Un evento borrado o con la fecha cambiada pudo estar en otro mes: cae todo
  if (RUTAS_DE_EVENTO.has(p[0]) && p[1] && metodo !== 'DELETE' && !b?.fecha) {
    const [ev] = await query(
      `select to_char(fecha, 'YYYY-MM') as mes from eventos where id::text = $1`, [p[1]])
    if (ev) {
      await query('delete from boletines_guardados where mes >= $1', [ev.mes])
      return
    }
  }
  await invalidarTodos()
}

// Para las escrituras que no pasan por el router con su propia ruta (un
// encuentro crea o cambia un partido desde `viajes`, que es ruta ajena)
export async function invalidarTodos() {
  await query('delete from boletines_guardados')
}


// Arma de cero los boletines de todos los jugadores activos de un mes. Cada
// dato sale en una sola consulta para todos los chicos (agrupada por
// jugador): con una consulta por jugador eran cientos de viajes a la base.
async function armar(mes) {
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
     where estado <> 'inactivo'
     order by apellido, nombre`)

  const detalle = await detalleDelMes(inicioMes, hasta)
  const hayRanking = eventosDelMes.length >= MINIMO_EVENTOS
  const mejor = mejorProgreso(resumenPorMes, meses)
  const armados = jugadores.map((j) => boletinDe({
    jugador: j, mes, eventosDelMes, hayRanking,
    resumen: delMes[j.id], puesto: puestos[j.id] ?? null, rankeados,
    anio: anio[j.id], promedioAnio, puestoAnio: puestosAnio[j.id] ?? null, rankeadosAnio,
    evolucion: meses.map((m) => ({
      mes: m,
      jugador: resumenPorMes[m][j.id]?.total ?? null,
      division: promedios[m],
    })),
    progreso: progresoDe(resumenPorMes, meses, j.id),
    mejorProgreso: mejor,
    marcas: detalle.marcas[j.id] || {},
    juego: detalle.juego[j.id] || {},
    tiemposPosibles: detalle.tiemposPosibles[j.id] || 0,
    camisetas: detalle.camisetas[j.id] || [],
    capitanias: detalle.capitanias[j.id] || { mes: 0, anio: 0 },
    lesiones: detalle.lesiones[j.id] || [],
    objetivos: objetivosDe(j, hasta, detalle.evaluaciones[j.id]),
  }))

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

// Agrupa las filas de una consulta por jugador_id, sacándole esa columna
function porJugador(filas, armarFila = (f) => f) {
  const grupos = {}
  for (const { jugador_id, ...resto } of filas) {
    (grupos[jugador_id] ||= []).push(armarFila(resto))
  }
  return grupos
}

// Todo el detalle del mes de todos los jugadores activos, una consulta por
// tabla, ya repartido por jugador.
async function detalleDelMes(inicioMes, hasta) {
  const rango = [inicioMes, hasta]

  // Marca de cada jugador en cada evento del mes (presente, tarde, golpe) y
  // si ese día estaba lesionado. Los eventos anteriores a su llegada al
  // plantel no tienen fila: no salen en su hoja.
  const marcas = await query(
    `select j.id as jugador_id, e.id as evento_id,
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
     where j.estado <> 'inactivo'
       and e.fecha >= $1::date and e.fecha < $2::date and e.fecha <= current_date
       and ${EVENTO_VIGENTE} and ${ASISTENCIA_TOMADA}
       and (${PRESENTE} or ${EN_PLANTEL})`,
    rango)

  // Rugby jugado en el mes
  const juego = await query(
    `select tj.jugador_id,
       count(distinct bl.evento_id)::int as partidos_jugados,
       count(*)::int as tiempos_jugados,
       count(*) filter (where tj.prestado)::int as prestado
     from tiempo_jugadores tj
     join tiempos t on t.id = tj.tiempo_id
     join bloques bl on bl.id = t.bloque_id
     join eventos e on e.id = bl.evento_id
     where e.fecha >= $1::date and e.fecha < $2::date
     group by tj.jugador_id`,
    rango)

  // Tiempos que se jugaron en los bloques a los que cada uno estuvo citado
  const posibles = await query(
    `select bj.jugador_id, count(*)::int as tiempos_posibles
     from tiempos t
     join bloques bl on bl.id = t.bloque_id
     join bloque_jugadores bj on bj.bloque_id = bl.id
     join eventos e on e.id = bl.evento_id
     where e.fecha >= $1::date and e.fecha < $2::date
     group by bj.jugador_id`,
    rango)

  const camisetas = await query(
    `select tj.jugador_id, tj.puesto, count(*)::int as tiempos
     from tiempo_jugadores tj
     join tiempos t on t.id = tj.tiempo_id
     join bloques bl on bl.id = t.bloque_id
     join eventos e on e.id = bl.evento_id
     where tj.puesto is not null
       and e.fecha >= $1::date and e.fecha < $2::date
     group by tj.jugador_id, tj.puesto
     order by tj.jugador_id, count(*) desc, tj.puesto`,
    rango)

  const capitanias = await query(
    `select jugador_id,
            count(*) filter (where fecha >= $1::date and fecha < $2::date)::int as mes,
            count(*) filter (where date_part('year', fecha) = date_part('year', $1::date))::int as anio
     from capitanias
     group by jugador_id`,
    rango)

  // Lesiones que pisan el mes, para la nota de arriba de la hoja
  const lesiones = await query(
    `select jugador_id, fecha::text as fecha, descripcion, recuperado,
            fecha_retorno_estimada::text as fecha_retorno_estimada
     from lesiones
     where fecha < $2::date
       and coalesce(fecha_retorno_estimada,
                    case when recuperado then fecha else current_date end) >= $1::date
     order by fecha`,
    rango)

  // La última evaluación vigente de cada uno, solo para elegir los objetivos
  const evaluaciones = await query(
    `select distinct on (jugador_id) jugador_id, valores, valores_revisor
     from evaluaciones
     where fecha < $1::date
       and fecha >= ($1::date - ($2 || ' days')::interval)
     order by jugador_id, fecha desc, created_at desc`,
    [hasta, DIAS_EVALUACION_VIGENTE])

  const marcasPorJugador = {}
  for (const { jugador_id, evento_id, ...m } of marcas) {
    (marcasPorJugador[jugador_id] ||= {})[evento_id] = m
  }
  return {
    marcas: marcasPorJugador,
    juego: Object.fromEntries(juego.map(({ jugador_id, ...j }) => [jugador_id, j])),
    tiemposPosibles: Object.fromEntries(posibles.map((p) => [p.jugador_id, p.tiempos_posibles])),
    camisetas: porJugador(camisetas),
    capitanias: Object.fromEntries(capitanias.map(({ jugador_id, ...c }) => [jugador_id, c])),
    lesiones: porJugador(lesiones),
    evaluaciones: Object.fromEntries(evaluaciones.map(({ jugador_id, ...e }) => [jugador_id, e])),
  }
}

function boletinDe({
  jugador, mes, eventosDelMes, hayRanking, resumen, puesto, rankeados,
  anio, promedioAnio, puestoAnio, rankeadosAnio, evolucion, progreso, mejorProgreso,
  marcas, juego, tiemposPosibles, camisetas, capitanias, lesiones, objetivos,
}) {
  const id = jugador.id

  // Los eventos anteriores a su llegada al plantel no salen en su hoja: no
  // tienen marca y marcarlos ausentes sería inventarle faltas.
  const dias = eventosDelMes.filter((e) => marcas[e.id]).map((e) => {
    const m = marcas[e.id]
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
      partidos_jugados: juego.partidos_jugados || 0,
      tiempos_jugados: juego.tiempos_jugados || 0,
      tiempos_posibles: tiemposPosibles,
      prestado: juego.prestado || 0,
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
    objetivos,
    distinciones: distincionesDe({
      hayRanking, puesto, resumen: r, partidosDelMes, progreso, mejorProgreso,
      capitanias: capitanias.mes, diasCapitan: dias.filter((d) => d.capitan),
    }),
  }
}

// Dos cosas para practicar el mes que viene, sacadas de lo más bajo de la
// última evaluación. Devuelve solo las frases: la nota, el área y la fecha de
// la evaluación se quedan acá adentro y nunca llegan al boletín.
function objetivosDe(jugador, hasta, ultima) {
  if (!ultima) return []

  const banda = bandaEtaria(edadAlCierre(jugador.fecha_nacimiento, hasta))
  const notas = valoresConsolidados(ultima)
  const candidatas = Object.entries(notas)
    .filter(([clave, nota]) =>
      nota >= 1 && AREAS_OBJETIVO.includes(AREA_DE_VARIABLE[clave]) && textoObjetivo(clave, banda))
    .sort((a, b) => a[1] - b[1])

  const flojas = candidatas.filter(([, nota]) => nota <= NOTA_OBJETIVO)
  if (!flojas.length) {
    // Le va bien en todo: en vez de inventarle una debilidad, un desafío
    // sobre el área donde está más fuerte.
    const mejor = candidatas.at(-1)
    const texto = mejor && textoDesafio(AREA_DE_VARIABLE[mejor[0]])
    return texto ? [{ clave: 'desafio', texto }] : []
  }

  // Se evita que los dos objetivos caigan en la misma área: dan una foto más
  // pareja de en qué trabajar.
  const elegidas = []
  for (const [clave] of flojas) {
    if (elegidas.length >= OBJETIVOS_POR_BOLETIN) break
    const area = AREA_DE_VARIABLE[clave]
    if (elegidas.some((e) => AREA_DE_VARIABLE[e.clave] === area)) continue
    elegidas.push({ clave, texto: textoObjetivo(clave, banda) })
  }
  for (const [clave] of flojas) {
    if (elegidas.length >= OBJETIVOS_POR_BOLETIN) break
    if (elegidas.some((e) => e.clave === clave)) continue
    elegidas.push({ clave, texto: textoObjetivo(clave, banda) })
  }
  return elegidas
}

// Edad que tenía al cerrar el mes del boletín (no la de hoy)
function edadAlCierre(fechaNacimiento, hasta) {
  if (!fechaNacimiento) return null
  const [a, m, d] = fechaNacimiento.split('-').map(Number)
  const cierre = new Date(hasta)
  let edad = cierre.getUTCFullYear() - a
  const mes = cierre.getUTCMonth() + 1 - m
  if (mes < 0 || (mes === 0 && cierre.getUTCDate() < d)) edad--
  return edad
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
