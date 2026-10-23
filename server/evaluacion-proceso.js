// Seguimiento de un proceso de evaluación: desde que se reparte hasta que
// todos cargaron lo suyo.
//
// Al repartir se guarda la foto del reparto (a quién le tocó evaluar y revisar
// cuántos). Las asignaciones pendientes se siguen borrando al cargarse, como
// siempre; el avance de cada uno sale de comparar la foto con lo que le falta.
// La cabeza de división y el dueño reciben un push cuando alguien termina su
// parte, cuando el proceso se completa, y un resumen diario los días en que
// hubo cargas. Hay un solo proceso abierto a la vez: repartir de nuevo con
// uno abierto le suma los jugadores nuevos.
import { query } from './db.js'
import { enviar, suscripcionesDeAdministradores } from './push.js'

// Un proceso ya cerrado se sigue mostrando estos días, para ver cómo terminó
const DIAS_CERRADO_VISIBLE = 7

export async function procesoAbierto() {
  const [p] = await query(
    `select id, lanzado_en::text as lanzado_en, lanzado_por, reparto, total
     from procesos_evaluacion
     where cerrado_en is null and cancelado_en is null
     order by lanzado_en desc limit 1`)
  return p || null
}

// Abre un proceso con el reparto recién hecho, o se lo suma al que ya está
// abierto. `asignaciones`: las filas recién insertadas.
export async function registrarReparto({ asignaciones, lanzadoPor }) {
  const nuevo = {}
  for (const a of asignaciones) {
    ;(nuevo[a.staff_email] ||= { evaluar: 0, revisar: 0 }).evaluar++
    if (a.revisor_email) (nuevo[a.revisor_email] ||= { evaluar: 0, revisar: 0 }).revisar++
  }
  let proceso = await procesoAbierto()
  let abierto = false
  if (proceso) {
    const reparto = { ...proceso.reparto }
    for (const [email, n] of Object.entries(nuevo)) {
      const r = reparto[email] ||= { evaluar: 0, revisar: 0 }
      r.evaluar += n.evaluar
      r.revisar += n.revisar
    }
    await query(
      'update procesos_evaluacion set reparto = $2, total = total + $3 where id = $1',
      [proceso.id, JSON.stringify(reparto), asignaciones.length])
  } else {
    ;[proceso] = await query(
      `insert into procesos_evaluacion (lanzado_por, reparto, total)
       values ($1, $2, $3)
       returning id, lanzado_en::text as lanzado_en, lanzado_por, reparto, total`,
      [lanzadoPor, JSON.stringify(nuevo), asignaciones.length])
    abierto = true
  }
  await query(
    'update asignaciones_evaluacion set proceso_id = $1 where jugador_id = any($2::uuid[])',
    [proceso.id, asignaciones.map((a) => a.jugador_id)])

  // Aviso del lanzamiento a los demás administradores (el que repartió ya sabe)
  const [quien] = await query('select nombre, apellido from staff where email = $1', [lanzadoPor])
  const entrenadores = Object.keys(nuevo).length
  await enviar(await suscripcionesDeAdministradores(lanzadoPor), {
    titulo: abierto ? '📋 Evaluación lanzada' : '📋 Más jugadores a evaluar',
    cuerpo: `${nombreDe(quien, lanzadoPor)} repartió ${asignaciones.length} ` +
      `${asignaciones.length === 1 ? 'jugador' : 'jugadores'} entre ${entrenadores} ` +
      `${entrenadores === 1 ? 'entrenador' : 'entrenadores'}.`,
    url: '#jugadores',
    tag: `eval-reparto-${proceso.id}`,
  })
  return proceso
}

export async function cancelarProceso() {
  await query(
    `update procesos_evaluacion set cancelado_en = now()
     where cerrado_en is null and cancelado_en is null`)
}

// Cómo viene el proceso: el abierto, o el último cerrado si fue hace poco
export async function estadoProceso() {
  let proceso = await procesoAbierto()
  if (!proceso) {
    ;[proceso] = await query(
      `select id, lanzado_en::text as lanzado_en, lanzado_por, reparto, total,
              cerrado_en::text as cerrado_en
       from procesos_evaluacion
       where cerrado_en is not null and cerrado_en >= now() - ($1 || ' days')::interval
       order by cerrado_en desc limit 1`, [DIAS_CERRADO_VISIBLE])
    if (!proceso) return null
  }
  return armarEstado(proceso)
}

async function armarEstado(proceso) {
  const emails = Object.keys(proceso.reparto)
  const pendientes = await query(
    `select staff_email, revisor_email, etapa
     from asignaciones_evaluacion where proceso_id = $1`, [proceso.id])
  const staff = await query(
    'select email, nombre, apellido from staff where email = any($1::text[])', [emails])
  // Última carga de cada uno desde que arrancó el proceso
  const ultimas = await query(
    `select email, max(cuando)::text as cuando from (
       select autor_email as email, created_at as cuando from evaluaciones
       where created_at >= $1::timestamptz and autor_email = any($2::text[])
       union all
       select revisor_email, revisado_en from evaluaciones
       where revisado_en >= $1::timestamptz and revisor_email = any($2::text[])
     ) t group by email`,
    [proceso.lanzado_en, emails])
  const [quien] = await query(
    'select nombre, apellido from staff where email = $1', [proceso.lanzado_por])

  const porStaff = emails.map((email) => {
    const r = proceso.reparto[email]
    const s = staff.find((x) => x.email === email) || { email }
    const evaluarPend = pendientes.filter((a) => a.etapa === 'evaluar' && a.staff_email === email).length
    // Una revisión sigue pendiente mientras exista la fila, esté la primera
    // nota cargada o no: la etapa solo dice de quién es el turno.
    const revisarPend = pendientes.filter((a) => a.revisor_email === email).length
    return {
      staff_email: email,
      nombre: s.nombre || null,
      apellido: s.apellido || null,
      evaluar_total: r.evaluar,
      evaluar_hechas: Math.max(0, r.evaluar - evaluarPend),
      revisar_total: r.revisar,
      revisar_hechas: Math.max(0, r.revisar - revisarPend),
      ultima_carga: ultimas.find((u) => u.email === email)?.cuando || null,
    }
  }).sort((a, b) => nombreDe(a, a.staff_email).localeCompare(nombreDe(b, b.staff_email), 'es'))

  const suma = (campo) => porStaff.reduce((t, s) => t + s[campo], 0)
  return {
    id: proceso.id,
    lanzado_en: proceso.lanzado_en,
    lanzado_por: nombreDe(quien, proceso.lanzado_por),
    cerrado_en: proceso.cerrado_en || null,
    total: proceso.total,
    jugadores_pendientes: pendientes.length,
    evaluados: suma('evaluar_hechas'),
    a_evaluar: suma('evaluar_total'),
    revisados: suma('revisar_hechas'),
    a_revisar: suma('revisar_total'),
    por_staff: porStaff,
  }
}

// Después de cada carga o borrado de evaluación: ¿alguien terminó su parte?
// ¿Se completó todo? Cada aviso sale una sola vez (avisos_enviados).
export async function registrarAvance() {
  const proceso = await procesoAbierto()
  if (!proceso) return
  const estado = await armarEstado(proceso)
  const admins = await suscripcionesDeAdministradores()
  const hechas = estado.evaluados + estado.revisados
  const total = estado.a_evaluar + estado.a_revisar

  for (const s of estado.por_staff) {
    const nombre = nombreDe(s, s.staff_email)
    if (s.evaluar_total > 0 && s.evaluar_hechas >= s.evaluar_total &&
        await marcar('eval_etapa', `${proceso.id}:${s.staff_email}:evaluar`)) {
      await enviar(admins, {
        titulo: `✅ ${nombre} terminó de evaluar`,
        cuerpo: `Cargó las ${s.evaluar_total} evaluaciones que le tocaban. ` +
          `Van ${hechas} de ${total} en total.`,
        url: '#jugadores',
        tag: `eval-etapa-${proceso.id}-${s.staff_email}-evaluar`,
      })
    }
    if (s.revisar_total > 0 && s.revisar_hechas >= s.revisar_total &&
        await marcar('eval_etapa', `${proceso.id}:${s.staff_email}:revisar`)) {
      await enviar(admins, {
        titulo: `✅ ${nombre} terminó de revisar`,
        cuerpo: `Revisó las ${s.revisar_total} evaluaciones de su pareja. ` +
          `Van ${hechas} de ${total} en total.`,
        url: '#jugadores',
        tag: `eval-etapa-${proceso.id}-${s.staff_email}-revisar`,
      })
    }
  }

  if (estado.jugadores_pendientes === 0) {
    await query(
      'update procesos_evaluacion set cerrado_en = now() where id = $1 and cerrado_en is null',
      [proceso.id])
    if (await marcar('eval_cerrado', proceso.id)) {
      const [{ dias }] = await query(
        `select greatest(1, ceil(extract(epoch from (now() - lanzado_en)) / 86400))::int as dias
         from procesos_evaluacion where id = $1`, [proceso.id])
      await enviar(admins, {
        titulo: '🏁 Evaluaciones completas',
        cuerpo: `Los ${estado.total} jugadores quedaron evaluados` +
          `${estado.a_revisar ? ' y revisados' : ''} en ${dias} ${dias === 1 ? 'día' : 'días'}.`,
        url: '#jugadores',
        tag: `eval-cerrado-${proceso.id}`,
      })
    }
  }
}

// Resumen de la tarea diaria, solo mientras hay un proceso abierto y hubo
// cargas en las últimas 24 horas: cómo va cada uno.
export async function resumenDiario() {
  const proceso = await procesoAbierto()
  if (!proceso) return { proceso: null }
  const estado = await armarEstado(proceso)
  const [{ hubo }] = await query(
    `select exists (
       select 1 from evaluaciones
       where created_at >= now() - interval '1 day' or revisado_en >= now() - interval '1 day'
     ) as hubo`)
  if (!hubo) return { proceso: proceso.id, avisados: 0, sin_cargas: true }
  if (!await marcar('eval_resumen', proceso.id)) return { proceso: proceso.id, avisados: 0, repetido: true }
  const hechas = estado.evaluados + estado.revisados
  const total = estado.a_evaluar + estado.a_revisar
  const detalle = estado.por_staff
    .map((s) => `${nombreCorto(s)} ${s.evaluar_hechas + s.revisar_hechas}/${s.evaluar_total + s.revisar_total}`)
    .join(' · ')
  const avisados = await enviar(await suscripcionesDeAdministradores(), {
    titulo: `📋 Evaluaciones: ${hechas} de ${total}`,
    cuerpo: detalle,
    url: '#jugadores',
    tag: `eval-resumen-${proceso.id}`,
  })
  return { proceso: proceso.id, avisados }
}

// Deja constancia de un aviso; false si ya había salido
async function marcar(tipo, referencia) {
  const filas = await query(
    `insert into avisos_enviados (tipo, referencia, fecha) values ($1, $2, current_date)
     on conflict do nothing returning referencia`, [tipo, referencia])
  return filas.length > 0
}

const nombreDe = (s, email) => [s?.nombre, s?.apellido].filter(Boolean).join(' ') || email
const nombreCorto = (s) => s.nombre || s.apellido || s.staff_email.split('@')[0]
