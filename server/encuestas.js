// Encuesta anónima a los jugadores.
//
// Dos caras:
// - `encuestas/...` (con sesión, solo quien administra): crear la encuesta,
//   editar sus preguntas, abrirla, mandar los links, seguir quién contestó,
//   cerrarla y ver los resultados. Los pedidos de ayuda los ve solo la cabeza
//   de división.
// - `encuesta-publica/:token` (sin sesión): la pantalla que abre el chico con
//   su link. El token es la credencial y sirve una sola vez.
//
// El anonimato está en cómo se guarda: al contestar, el link se marca usado y
// la respuesta va a otra tabla sin el chico, sin el token y sin la hora. Desde
// la app nadie puede unir una cosa con la otra. Por la misma razón, los
// resultados se ven recién con la encuesta cerrada: mirarlos mientras llegan
// respuestas, junto con la lista de quién ya contestó, dejaría deducir qué
// puso cada uno.
import { randomBytes } from 'crypto'
import { query } from './db.js'
import {
  bloquesDe, limpiarPreguntas, preguntasPorDefecto, resumirEncuesta, validarRespuestas,
} from '../src/encuesta.js'

const ZONA = 'America/Argentina/Tucuman'
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
const nuevoToken = () => randomBytes(18).toString('base64url')
const ROL_CABEZA = 'Cabeza de división'

const COLS_ENCUESTA = `e.id, e.titulo, e.preguntas, e.estado, e.cierra::text as cierra,
  e.creada_por, e.created_at::date::text as creada, e.abierta_en::date::text as abierta,
  e.cerrada_en::date::text as cerrada`

// Las que ya pasaron su último día se cierran solas. Se corre antes de leer.
export async function cerrarVencidas() {
  await query(
    `update encuestas set estado = 'cerrada', cerrada_en = now()
     where estado = 'abierta' and cierra is not null
       and cierra < (now() at time zone '${ZONA}')::date`)
}

async function leerEncuesta(id) {
  const [e] = await query(`select ${COLS_ENCUESTA} from encuestas e where e.id::text = $1`, [id])
  if (!e) throw { codigo: 404, error: 'no_existe' }
  return e
}

async function contarRespuestas(id) {
  const [r] = await query(
    'select count(*)::int as n from encuesta_respuestas where encuesta_id = $1', [id])
  return r.n
}

// Un link por cada chico no dado de baja que todavía no tenga el suyo: al
// abrir la encuesta, y cada vez que se la mira abierta (por los que llegaron
// después)
async function completarLinks(id) {
  const faltan = await query(
    `select j.id from jugadores j
     where j.estado <> 'inactivo'
       and not exists (select 1 from encuesta_links l where l.encuesta_id = $1 and l.jugador_id = j.id)`,
    [id])
  for (const j of faltan) {
    await query(
      `insert into encuesta_links (token, encuesta_id, jugador_id) values ($1, $2, $3)
       on conflict (encuesta_id, jugador_id) do nothing`, [nuevoToken(), id, j.id])
  }
}

// Las preguntas se pueden tocar mientras no haya ninguna respuesta: después,
// cambiarlas dejaría respuestas a preguntas que ya no son las mismas
async function preguntasEditables(e) {
  if (e.estado === 'cerrada') return false
  return (await contarRespuestas(e.id)) === 0
}

// Resumen de una encuesta cerrada, comparado con la cerrada anterior
export async function resultadosDe(e) {
  const filas = await query(
    'select respuestas from encuesta_respuestas where encuesta_id = $1', [e.id])
  const [previa] = await query(
    `select e2.id, e2.titulo, e2.preguntas, e2.cerrada_en::date::text as cerrada
     from encuestas e2
     where e2.estado = 'cerrada' and e2.id <> $1 and e2.cerrada_en < (
       select coalesce(cerrada_en, now()) from encuestas where id = $1)
     order by e2.cerrada_en desc limit 1`, [e.id])
  let anterior = null
  if (previa) {
    const filasPrevia = await query(
      'select respuestas from encuesta_respuestas where encuesta_id = $1', [previa.id])
    anterior = resumirEncuesta(previa.preguntas, filasPrevia.map((f) => f.respuestas))
  }
  const resumen = resumirEncuesta(e.preguntas, filas.map((f) => f.respuestas), anterior)
  return { ...resumen, anterior: previa ? { titulo: previa.titulo, cerrada: previa.cerrada } : null }
}

// ---------------------------------------------------------------------------
// Administración (con sesión; el router ya exige puedeAdministrar)
// ---------------------------------------------------------------------------
export async function enrutarEncuestas({ metodo, p, b, yo }) {
  await cerrarVencidas()
  const veoPedidos = yo.rol === ROL_CABEZA

  if (metodo === 'GET' && !p[1]) {
    return query(
      `select ${COLS_ENCUESTA},
         jsonb_array_length(e.preguntas)::int as cantidad_preguntas,
         (select count(*)::int from encuesta_links l where l.encuesta_id = e.id) as links,
         (select count(*)::int from encuesta_links l where l.encuesta_id = e.id and l.usado) as respondieron,
         (select count(*)::int from encuesta_links l where l.encuesta_id = e.id and l.enviado) as enviados
       from encuestas e order by e.created_at desc`)
  }

  if (metodo === 'POST' && !p[1]) {
    const titulo = String(b?.titulo || '').trim() || 'Encuesta de fin de año'
    if (b?.cierra && !esFecha(b.cierra)) throw { codigo: 400, error: 'fecha_invalida' }
    const [e] = await query(
      `insert into encuestas (titulo, preguntas, cierra, creada_por)
       values ($1, $2::jsonb, $3, $4) returning id`,
      [titulo.slice(0, 120), JSON.stringify(preguntasPorDefecto()), b?.cierra || null, yo.email])
    return detalle(e.id, veoPedidos)
  }

  // Pedidos de ayuda: marcar atendido. Solo la cabeza de división.
  if (p[1] === 'pedidos' && p[2] && metodo === 'PUT') {
    if (!veoPedidos) throw { codigo: 403, error: 'solo_cabeza_division' }
    const filas = await query(
      `update encuesta_pedidos set atendido = $1, atendido_por = case when $1 then $2 else null end
       where id::text = $3 returning encuesta_id`, [!!b?.atendido, yo.email, p[2]])
    if (!filas.length) throw { codigo: 404, error: 'no_existe' }
    return detalle(filas[0].encuesta_id, veoPedidos)
  }

  const e = await leerEncuesta(p[1])

  if (metodo === 'GET' && !p[2]) {
    if (e.estado === 'abierta') await completarLinks(e.id)
    return detalle(e.id, veoPedidos)
  }

  if (metodo === 'PUT' && !p[2]) {
    if (b?.cierra && !esFecha(b.cierra)) throw { codigo: 400, error: 'fecha_invalida' }
    if ('preguntas' in (b || {})) {
      if (!await preguntasEditables(e)) throw { codigo: 409, error: 'preguntas_bloqueadas' }
      const preguntas = limpiarPreguntas(b.preguntas)
      await query('update encuestas set preguntas = $1::jsonb where id = $2', [JSON.stringify(preguntas), e.id])
    }
    if ('titulo' in (b || {})) {
      const titulo = String(b.titulo || '').trim()
      if (!titulo) throw { codigo: 400, error: 'falta_titulo' }
      await query('update encuestas set titulo = $1 where id = $2', [titulo.slice(0, 120), e.id])
    }
    if ('cierra' in (b || {})) {
      if (e.estado === 'cerrada') throw { codigo: 409, error: 'encuesta_cerrada' }
      await query('update encuestas set cierra = $1 where id = $2', [b.cierra || null, e.id])
    }
    return detalle(e.id, veoPedidos)
  }

  if (metodo === 'POST' && p[2] === 'abrir') {
    if (e.estado !== 'borrador') throw { codigo: 409, error: 'ya_abierta' }
    await query(
      `update encuestas set estado = 'abierta', abierta_en = now() where id = $1`, [e.id])
    await completarLinks(e.id)
    return detalle(e.id, veoPedidos)
  }

  if (metodo === 'POST' && p[2] === 'cerrar') {
    if (e.estado !== 'abierta') throw { codigo: 409, error: 'no_esta_abierta' }
    await query(
      `update encuestas set estado = 'cerrada', cerrada_en = now() where id = $1`, [e.id])
    return detalle(e.id, veoPedidos)
  }

  // Marcar el link de un chico como enviado (lo hace solo el botón de
  // WhatsApp) o darle uno nuevo si el anterior se mandó mal
  if (p[2] === 'links' && p[3]) {
    const [link] = await query(
      'select usado from encuesta_links where encuesta_id = $1 and jugador_id::text = $2', [e.id, p[3]])
    if (!link) throw { codigo: 404, error: 'no_existe' }
    if (metodo === 'PUT' && !p[4]) {
      await query(
        'update encuesta_links set enviado = $1 where encuesta_id = $2 and jugador_id::text = $3',
        [!!b?.enviado, e.id, p[3]])
      return { ok: true }
    }
    if (metodo === 'POST' && p[4] === 'nuevo') {
      if (link.usado) throw { codigo: 409, error: 'ya_respondio' }
      if (e.estado === 'cerrada') throw { codigo: 409, error: 'encuesta_cerrada' }
      await query(
        `update encuesta_links set token = $1, enviado = false
         where encuesta_id = $2 and jugador_id::text = $3`, [nuevoToken(), e.id, p[3]])
      return detalle(e.id, veoPedidos)
    }
  }

  if (metodo === 'DELETE' && !p[2]) {
    if (await contarRespuestas(e.id)) throw { codigo: 409, error: 'tiene_respuestas' }
    await query('delete from encuestas where id = $1', [e.id])
    return { ok: true }
  }

  throw { codigo: 404, error: 'no_existe' }
}

async function detalle(id, veoPedidos) {
  const e = await leerEncuesta(id)
  const respuestas = await contarRespuestas(id)
  // El token solo viaja mientras sirve: el de un chico que ya contestó, o el
  // de una encuesta cerrada, no tiene para qué salir
  const links = await query(
    `select l.jugador_id, j.nombre, j.apellido, j.estado, j.telefono, j.tutor_nombre, j.tutor_telefono,
            l.enviado, l.usado,
            case when l.usado or e.estado <> 'abierta' then null else l.token end as token
     from encuesta_links l
     join jugadores j on j.id = l.jugador_id
     join encuestas e on e.id = l.encuesta_id
     where l.encuesta_id = $1
     order by j.apellido, j.nombre`, [id])
  const [cabeza] = await query(
    `select count(*)::int as n from staff where activo and rol = $1`, [ROL_CABEZA])
  const res = {
    encuesta: e,
    respuestas,
    editable: e.estado !== 'cerrada' && respuestas === 0,
    links,
    hay_cabeza: cabeza.n > 0,
    pedidos_pendientes: (await query(
      'select count(*)::int as n from encuesta_pedidos where encuesta_id = $1 and not atendido', [id]))[0].n,
    // Solo la cantidad: es lo que va al reporte, que no lleva nombres
    pedidos_total: (await query(
      'select count(*)::int as n from encuesta_pedidos where encuesta_id = $1', [id]))[0].n,
  }
  if (veoPedidos) {
    res.pedidos = await query(
      `select p.id, p.jugador_id, j.nombre, j.apellido, j.telefono, j.tutor_nombre, j.tutor_telefono,
              p.atendido, p.atendido_por,
              (p.created_at at time zone '${ZONA}')::date::text as fecha
       from encuesta_pedidos p join jugadores j on j.id = p.jugador_id
       where p.encuesta_id = $1
       order by p.atendido, p.created_at`, [id])
  }
  if (e.estado === 'cerrada') res.resultados = await resultadosDe(e)
  return res
}

// ---------------------------------------------------------------------------
// Pantalla del chico (sin sesión: el token es la credencial)
// ---------------------------------------------------------------------------
export async function enrutarEncuestaPublica({ metodo, p, b }) {
  const token = String(p[1] || '')
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || p[2]) throw { codigo: 404, error: 'link_invalido' }
  await cerrarVencidas()
  const [link] = await query(
    `select l.usado, e.id as encuesta_id, e.titulo, e.preguntas, e.estado, e.cierra::text as cierra
     from encuesta_links l join encuestas e on e.id = l.encuesta_id
     where l.token = $1`, [token])
  if (!link) throw { codigo: 404, error: 'link_invalido' }

  if (metodo === 'GET') {
    if (link.usado) return { estado: 'respondida', titulo: link.titulo }
    if (link.estado !== 'abierta') return { estado: 'cerrada', titulo: link.titulo }
    return {
      estado: 'abierta', titulo: link.titulo, cierra: link.cierra,
      preguntas: link.preguntas, bloques: bloquesDe(link.preguntas).length,
    }
  }

  if (metodo === 'POST') {
    if (link.usado) throw { codigo: 409, error: 'ya_respondida' }
    if (link.estado !== 'abierta') throw { codigo: 409, error: 'encuesta_cerrada' }
    const respuestas = validarRespuestas(link.preguntas, b?.respuestas)
    const pideAyuda = !!b?.hablar
    // Todo en una sola sentencia: marcar el link (solo si sigue sin usar y la
    // encuesta abierta), guardar la respuesta anónima y, si lo pidió, el
    // pedido de ayuda con su nombre. Si dos envíos llegan juntos, uno solo
    // encuentra el link sin usar.
    const [r] = await query(
      `with marcado as (
         update encuesta_links l set usado = true
         from encuestas e
         where l.token = $1 and not l.usado and e.id = l.encuesta_id and e.estado = 'abierta'
         returning l.encuesta_id, l.jugador_id
       ), respuesta as (
         insert into encuesta_respuestas (encuesta_id, respuestas)
         select encuesta_id, $2::jsonb from marcado
         returning 1
       ), pedido as (
         insert into encuesta_pedidos (encuesta_id, jugador_id)
         select encuesta_id, jugador_id from marcado where $3
         returning 1
       )
       select (select count(*) from respuesta)::int as guardada,
              (select count(*) from pedido)::int as pedido`,
      [token, JSON.stringify(respuestas), pideAyuda])
    if (!r.guardada) throw { codigo: 409, error: 'ya_respondida' }
    if (r.pedido) await avisarPedido(link.encuesta_id)
    return { ok: true }
  }

  throw { codigo: 404, error: 'link_invalido' }
}

// El aviso a la cabeza de división no lleva el nombre: se ve en la pantalla
// bloqueada del celular. El nombre está adentro de la app.
async function avisarPedido(encuestaId) {
  try {
    const { enviar } = await import('./push.js')
    const suscripciones = await query(
      `select ps.endpoint, ps.p256dh, ps.auth
       from push_suscripciones ps join staff s on s.email = ps.staff_email
       where s.activo and s.rol = $1`, [ROL_CABEZA])
    await enviar(suscripciones, {
      titulo: 'Un chico pidió hablar con alguien del club',
      cuerpo: 'Lo marcó al final de la encuesta. Entrá para ver quién es.',
      url: `/#/staff/encuestas/${encuestaId}`,
    })
  } catch (e) {
    console.error('No se pudo avisar el pedido de la encuesta', e)
  }
}
