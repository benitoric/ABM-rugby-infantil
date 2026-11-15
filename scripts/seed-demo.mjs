// Siembra (o vuelve a sembrar) la base de la versión de prueba con datos
// ficticios. Borra todo lo de la demo anterior y lo arma de nuevo, con fechas
// relativas a hoy; las cuentas reales (el dueño y los invitados) se conservan
// con sus contraseñas.
//
// Uso:
//   DEMO=1 DATABASE_URL='postgresql://...demo...' npm run seed:demo
//   DEMO=1 DATABASE_URL=... DEMO_INVITADOS='ana@mail.com:Entrenador, juan@mail.com:Manager principal' npm run seed:demo
//
// Protección: NUNCA corre sobre la base del club. Exige DEMO=1 y, si la base
// ya tiene jugadores, exige que sea una base demo (la marca `base_demo` que la
// siembra deja en `ajustes`). Una base de verdad no la tiene, así que ahí se
// niega sin tocar nada.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

if (process.env.DEMO !== '1') {
  console.error('Este script solo corre con DEMO=1 (es para la base de la versión de prueba).')
  process.exit(1)
}
if (process.env.PGLITE !== '1' && !process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL: la cadena de conexión de la base de Neon de la DEMO (nunca la del club).')
  process.exit(1)
}

const { sembrarDemo, leerInvitados } = await import('./demo-datos.mjs')
let invitados
try {
  invitados = leerInvitados(process.env.DEMO_INVITADOS)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

// Base nueva de Neon: primero el esquema (es idempotente)
if (process.env.PGLITE !== '1') {
  const { default: pg } = await import('pg')
  const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
  const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await cliente.connect()
  await cliente.query(readFileSync(join(raiz, 'db', 'schema.sql'), 'utf8'))
  await cliente.end()
}

// La siembra la hace este script: que la base no se siembre además sola al
// conectarse (server/db.js, sembrarDemoSiVacia)
process.env.DEMO_SIN_AUTOSIEMBRA = '1'
const { query } = await import('../server/db.js')
const [{ n }] = await query('select count(*)::int as n from jugadores')
const [marca] = await query("select valor from ajustes where clave = 'base_demo'")
if (n > 0 && !marca) {
  console.error(`Esta base tiene ${n} jugadores y no es una base demo: no se toca nada.`)
  console.error('Revisá que DATABASE_URL apunte a la base de la versión de prueba.')
  process.exit(1)
}

const t0 = Date.now()
const r = await sembrarDemo(query, { invitados })
console.log(`✓ Demo sembrada en ${((Date.now() - t0) / 1000).toFixed(1)} s:`, r)
if (invitados.length) console.log('Invitados:', invitados.map((i) => `${i.email} (${i.rol})`).join(', '))
process.exit(0)
