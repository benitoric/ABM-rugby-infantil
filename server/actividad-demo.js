// Actividad de los invitados en la versión de prueba (solo con DEMO=1).
//
// Se anota: cada ingreso y cada vez que abren la app (`visita`), cada sección
// que abren (`seccion`, la manda el frontend) y cada escritura que sale bien
// (`accion`, descripta con src/actividadDemo.js). Nunca el contenido de lo
// que cargan. No se anota al dueño ni al staff inventado (`demo.invalid`).
// Lo ve solo el dueño, en Staff → "Actividad de los invitados".
//
// La tabla se crea sola la primera vez y solo en la demo: en la base del club
// no existe.
import { query } from './db.js'
import { EMAIL_DUENIO } from './permisos.js'
import { DOMINIO_DEMO } from './demo-dominio.js'
import { describirAccion, SECCIONES_ACTIVIDAD } from '../src/actividadDemo.js'

export const esDemo = () => process.env.DEMO === '1'

// Para no llenar la tabla con lo mismo: abrir la app de nuevo antes de 20
// minutos no es otra visita, y repetir la misma acción o sección enseguida
// (tocar varias veces en la cancha) se anota una vez
const MINUTOS_REPETIDO = { visita: 20, seccion: 3, accion: 10 }

let tablaLista
function asegurarTabla() {
  tablaLista ||= query(`create table if not exists demo_actividad (
      id bigserial primary key,
      email text not null,
      tipo text not null check (tipo in ('ingreso','visita','seccion','accion')),
      detalle text,
      momento timestamptz not null default now()
    )`).then(() => query(
    'create index if not exists demo_actividad_email_idx on demo_actividad (email, momento desc)'))
    .catch((e) => { tablaLista = null; throw e })
  return tablaLista
}

const seAnota = (email) => !!email && email !== EMAIL_DUENIO && !email.endsWith(`@${DOMINIO_DEMO}`)

// Nunca le niega nada a nadie: si falla, queda en el log
export async function anotar(email, tipo, detalle = null) {
  if (!esDemo() || !seAnota(email)) return
  try {
    await asegurarTabla()
    const minutos = MINUTOS_REPETIDO[tipo]
    if (minutos) {
      const [rep] = await query(
        `select 1 from demo_actividad
         where email = $1 and momento > now() - make_interval(mins => $2)
           and (($3 = 'visita' and tipo in ('visita','ingreso')) or (tipo = $3 and detalle is not distinct from $4))
         limit 1`, [email, minutos, tipo, detalle])
      if (rep) return
    }
    await query('insert into demo_actividad (email, tipo, detalle) values ($1, $2, $3)', [email, tipo, detalle])
  } catch (e) {
    console.error('No se pudo anotar la actividad de la demo', e)
  }
}

// Después de una escritura que salió bien (server/router.js, handle)
export async function anotarEscritura(email, metodo, partes) {
  if (!esDemo() || ['demo', 'push', 'auth', 'encuesta-publica', 'cron'].includes(partes[0])) return
  await anotar(email, 'accion', describirAccion(metodo, partes))
}

// Fecha de Tucumán (UTC-3) de un momento
const diaTucuman = (m) => new Date(new Date(m).getTime() - 3 * 3600000).toISOString().slice(0, 10)

// Rutas demo/*: POST demo/actividad (cualquiera con sesión, cuenta la sección
// que abrió) y GET demo/actividad (solo el dueño)
export async function enrutarDemo({ metodo, p, b, yo }) {
  if (!esDemo() || p[1] !== 'actividad') throw { codigo: 404, error: 'no_existe' }
  if (metodo === 'POST') {
    const seccion = String(b?.seccion || '')
    if (!SECCIONES_ACTIVIDAD[seccion]) throw { codigo: 400, error: 'seccion_invalida' }
    await anotar(yo.email, 'seccion', seccion)
    return { ok: true }
  }
  if (metodo !== 'GET') throw { codigo: 404, error: 'no_existe' }
  if (yo.email !== EMAIL_DUENIO) throw { codigo: 403, error: 'solo_duenio' }
  await asegurarTabla()
  const invitados = await query(
    `select email, nombre, apellido, rol, activo, password_hash is not null as ingreso,
            created_at::text as invitado_en
     from staff where email <> $1 and email not like $2 order by created_at`,
    [EMAIL_DUENIO, `%@${DOMINIO_DEMO}`])
  const filas = await query(
    `select email, tipo, detalle, momento from demo_actividad
     order by momento desc limit 5000`)
  // Siempre en ISO (con zona), que el navegador lee sin dudas
  for (const f of filas) f.momento = new Date(f.momento).toISOString()
  const porEmail = new Map(invitados.map((i) => [i.email, {
    ...i, primero: null, ultimo: null, visitas: 0, dias: new Set(), secciones: {}, acciones: {}, recientes: [],
  }]))
  for (const f of filas) {
    const r = porEmail.get(f.email)
    if (!r) continue
    r.ultimo ||= f.momento
    r.primero = f.momento
    r.dias.add(diaTucuman(f.momento))
    if (f.tipo === 'ingreso' || f.tipo === 'visita') r.visitas++
    if (f.tipo === 'seccion') r.secciones[f.detalle] = (r.secciones[f.detalle] || 0) + 1
    if (f.tipo === 'accion') r.acciones[f.detalle] = (r.acciones[f.detalle] || 0) + 1
    if (r.recientes.length < 40) {
      r.recientes.push({
        tipo: f.tipo, momento: f.momento,
        detalle: f.tipo === 'seccion' ? `Abrió ${SECCIONES_ACTIVIDAD[f.detalle] || f.detalle}` : f.detalle,
      })
    }
  }
  const lista = [...porEmail.values()].map((r) => ({
    ...r,
    dias: r.dias.size,
    secciones: Object.entries(r.secciones)
      .map(([clave, n]) => ({ clave, nombre: SECCIONES_ACTIVIDAD[clave] || clave, n }))
      .sort((x, y) => y.n - x.n),
    acciones: Object.entries(r.acciones).map(([texto, n]) => ({ texto, n })).sort((x, y) => y.n - x.n),
  }))
  // Primero los que más recién anduvieron; los que nunca entraron, al final
  lista.sort((x, y) => (y.ultimo || '').localeCompare(x.ultimo || ''))
  return { invitados: lista }
}
