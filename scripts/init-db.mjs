// Crea las tablas en la base de datos apuntada por DATABASE_URL.
// Uso: DATABASE_URL='postgresql://...' npm run db:init
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL. Copiá la cadena de conexión de tu proyecto de Neon.')
  process.exit(1)
}

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const sql = readFileSync(join(raiz, 'db', 'schema.sql'), 'utf8')
const cliente = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await cliente.connect()
await cliente.query(sql)
await cliente.end()
console.log('✓ Tablas creadas y primer staff cargado (benitoric@gmail.com).')
