// Servidor local para desarrollo y tests: API en /api y (opcional) dist/ estático.
// Uso: PGLITE=1 node scripts/dev-server.mjs   (base en memoria)
//      DATABASE_URL=... node scripts/dev-server.mjs (base real de Neon)
//      PGLITE=1 DEMO=1 node scripts/dev-server.mjs (base en memoria con los
//      datos ficticios de la demo; ver scripts/demo-datos.mjs)
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { handle } from '../server/router.js'

if (process.env.PGLITE === '1' && process.env.DEMO === '1') {
  const { query } = await import('../server/db.js')
  const { sembrarDemo, leerInvitados } = await import('./demo-datos.mjs')
  const r = await sembrarDemo(query, { invitados: leerInvitados(process.env.DEMO_INVITADOS) })
  console.log('Demo sembrada:', r)
}

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const DIST = join(RAIZ, 'dist')
const PUERTO = process.env.PORT || 3001
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
}

createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) return handle(req, res)
  let p = join(DIST, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0])
  if (!existsSync(p)) p = join(DIST, 'index.html')
  if (!existsSync(p)) { res.statusCode = 404; return res.end('Sin build: corré npm run build') }
  res.setHeader('content-type', MIME[extname(p)] || 'application/octet-stream')
  res.end(readFileSync(p))
}).listen(PUERTO, () => console.log(`Servidor en http://localhost:${PUERTO}`))
