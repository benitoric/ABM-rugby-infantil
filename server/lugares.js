// Dónde viven los chicos: rutas `lugares/...` de la API y la resolución del
// barrio de cada jugador (ver src/lugares.js).
//
// - `lugares`: el catálogo de lugares ya ubicados (barrio o localidad con su
//   punto en el mapa), cada uno con las claves con las que se lo reconoce.
// - `lugares_alias`: clave normalizada → lugar. Cada vez que alguien confirma
//   dónde queda un texto nuevo, esa forma de escribirlo queda aprendida.
// - `jugadores.barrio` guarda el texto tal como se cargó y `lugar_id` el lugar
//   reconocido (null = sin ubicar todavía, va a la bandeja de pendientes).
//
// Lo abren los dos alcances: el barrio es un dato administrativo (lo cargan
// los managers desde el padrón) y los pooles son tarea suya. Mover el club y
// borrar un lugar quedan para quien administra.
import { query } from './db.js'
import { CLUB_POR_DEFECTO, clavesDe, normalizar } from '../src/lugares.js'

const COLS_LUGAR = `l.id, l.nombre, l.lat, l.lng,
  coalesce((select array_agg(a.clave order by a.clave) from lugares_alias a
            where a.lugar_id = l.id), '{}') as alias`

// El lugar que le corresponde a un texto de barrio, o null si todavía no se
// ubicó. Se prueba el texto entero y después la primera parte.
export async function resolverLugar(barrio) {
  const claves = clavesDe(barrio)
  if (!claves.length) return null
  const filas = await query(
    `select clave, lugar_id from lugares_alias where clave = any($1::text[])`, [claves])
  for (const c of claves) {
    const f = filas.find((x) => x.clave === c)
    if (f) return f.lugar_id
  }
  return null
}

// Guarda el barrio de un jugador y el lugar que le corresponde. Solo si el
// pedido trae el campo: una versión vieja de la app que no lo manda no lo borra.
export async function guardarBarrio(jugadorId, b) {
  if (!b || !('barrio' in b)) return
  const barrio = String(b.barrio ?? '').trim().slice(0, 120) || null
  const lugarId = barrio ? await resolverLugar(barrio) : null
  await query('update jugadores set barrio = $1, lugar_id = $2 where id = $3',
    [barrio, lugarId, jugadorId])
}

// Después de aprender una clave nueva, los chicos que estaban sin ubicar y
// ahora se reconocen pasan a tener su lugar. Son pocos: se resuelve uno por uno.
async function resolverPendientes() {
  const pendientes = await query(
    `select id, barrio from jugadores where lugar_id is null and barrio is not null`)
  for (const j of pendientes) {
    const lugarId = await resolverLugar(j.barrio)
    if (lugarId) await query('update jugadores set lugar_id = $1 where id = $2', [lugarId, j.id])
  }
}

// Aprende las formas de escribir un lugar. Una clave que apuntaba a otro lugar
// pasa a este: manda la última confirmación.
async function aprender(lugarId, textos) {
  const claves = new Set()
  for (const t of textos) {
    const [principal] = clavesDe(t)
    if (principal) claves.add(principal)
  }
  for (const clave of claves) {
    await query(
      `insert into lugares_alias (clave, lugar_id) values ($1, $2)
       on conflict (clave) do update set lugar_id = excluded.lugar_id`, [clave, lugarId])
  }
}

export async function ubicacionClub() {
  const [fila] = await query(`select valor from ajustes where clave = 'club_ubicacion'`)
  try {
    const u = JSON.parse(fila?.valor || 'null')
    if (Number.isFinite(u?.lat) && Number.isFinite(u?.lng)) return { lat: u.lat, lng: u.lng, guardada: true }
  } catch { /* valor roto: vale el de arranque */ }
  return { ...CLUB_POR_DEFECTO, guardada: false }
}

// Un punto válido: dentro de la Argentina, con margen
function punto(b) {
  const lat = Number(b?.lat)
  const lng = Number(b?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -56 || lat > -21 || lng < -74 || lng > -53) {
    throw { codigo: 400, error: 'ubicacion_invalida' }
  }
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 }
}

function nombreValido(b) {
  const nombre = String(b?.nombre ?? '').trim().slice(0, 80)
  if (!normalizar(nombre)) throw { codigo: 400, error: 'falta_nombre' }
  return nombre
}

async function lugarPorId(id) {
  const [l] = await query(`select ${COLS_LUGAR} from lugares l where l.id::text = $1`, [id])
  if (!l) throw { codigo: 404, error: 'no_existe' }
  return l
}

export async function enrutarLugares({ metodo, p, b, yo, admin }) {
  // El catálogo y dónde queda el club
  if (metodo === 'GET' && !p[1]) {
    const lugares = await query(`select ${COLS_LUGAR} from lugares l order by l.nombre`)
    return { club: await ubicacionClub(), lugares }
  }

  // Mover el club
  if (metodo === 'PUT' && p[1] === 'club' && !p[2]) {
    if (!admin) throw { codigo: 403, error: 'solo_administrador' }
    const u = punto(b)
    await query(
      `insert into ajustes (clave, valor) values ('club_ubicacion', $1)
       on conflict (clave) do update set valor = excluded.valor`, [JSON.stringify(u)])
    return { ...u, guardada: true }
  }

  // Un lugar nuevo: nombre, punto y los textos que lo nombran (los barrios
  // tal como estaban cargados). Si ya existe uno con el mismo nombre
  // normalizado, se suman los textos a ese en vez de duplicarlo.
  if (metodo === 'POST' && !p[1]) {
    const nombre = nombreValido(b)
    const u = punto(b)
    const textos = [nombre, ...(Array.isArray(b?.textos) ? b.textos.map(String) : [])]
    const existente = await resolverLugar(nombre)
    let id = existente
    if (!id) {
      const [nuevo] = await query(
        `insert into lugares (nombre, lat, lng, creado_por) values ($1, $2, $3, $4) returning id`,
        [nombre, u.lat, u.lng, yo.email])
      id = nuevo.id
    }
    await aprender(id, textos)
    await resolverPendientes()
    return lugarPorId(id)
  }

  const lugarId = p[1]
  if (!lugarId) throw { codigo: 404, error: 'no_existe' }

  // Sumarle formas de escribirlo ("es el mismo que...")
  if (metodo === 'POST' && p[2] === 'alias' && !p[3]) {
    await lugarPorId(lugarId)
    const textos = Array.isArray(b?.textos) ? b.textos.map(String) : [String(b?.texto ?? '')]
    if (!textos.some((t) => clavesDe(t).length)) throw { codigo: 400, error: 'faltan_datos' }
    await aprender(lugarId, textos)
    await resolverPendientes()
    return lugarPorId(lugarId)
  }

  if (p[2]) throw { codigo: 404, error: 'no_existe' }

  // Corregir el nombre o mover el punto: alcanza a todos los chicos de ese lugar
  if (metodo === 'PUT') {
    const actual = await lugarPorId(lugarId)
    const nombre = 'nombre' in (b || {}) ? nombreValido(b) : actual.nombre
    const u = 'lat' in (b || {}) || 'lng' in (b || {}) ? punto(b) : actual
    await query(
      `update lugares set nombre = $1, lat = $2, lng = $3, updated_at = now() where id = $4`,
      [nombre, u.lat, u.lng, lugarId])
    if (nombre !== actual.nombre) {
      await aprender(lugarId, [nombre])
      await resolverPendientes()
    }
    return lugarPorId(lugarId)
  }

  // Borrar un lugar mal creado: sus chicos vuelven a quedar sin ubicar
  if (metodo === 'DELETE') {
    if (!admin) throw { codigo: 403, error: 'solo_administrador' }
    await lugarPorId(lugarId)
    await query('delete from lugares where id = $1', [lugarId])
    return { ok: true }
  }

  throw { codigo: 404, error: 'no_existe' }
}
