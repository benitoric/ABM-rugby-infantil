// Acceso a la base. En producción (Vercel) usa Postgres de Neon vía pg.
// Con PGLITE=1 usa una base Postgres en memoria (para tests locales).

let _query

async function inicializar() {
  if (process.env.PGLITE === '1') {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = new PGlite()
    await db.waitReady
    const { readFileSync } = await import('fs')
    const { fileURLToPath } = await import('url')
    const { dirname, join } = await import('path')
    const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
    await db.exec(readFileSync(join(raiz, 'db', 'schema.sql'), 'utf8'))
    return (texto, params) => db.query(texto, params)
  }

  const { default: pg } = await import('pg')
  // Las columnas date llegan como texto plano 'YYYY-MM-DD' (no objetos Date)
  pg.types.setTypeParser(1082, (v) => v)
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  })
  return (texto, params) => pool.query(texto, params)
}

export async function query(texto, params = []) {
  if (!_query) _query = await inicializar()
  const res = await _query(texto, params)
  return res.rows
}
