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
    connectionString: urlDeConexion(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  })
  // Migraciones livianas: cambios de esquema posteriores al despliegue
  // inicial, idempotentes, aplicados en el arranque en frío de la función.
  await pool.query('alter table staff add column if not exists rol text')
  await pool.query('alter table jugadores add column if not exists ficha_medica_vence date')
  await pool.query(`alter table jugadores add column if not exists aptitudes jsonb not null default '[]'`)
  // Limpieza: quedaron solo conducción/penetración/definición como aptitudes
  await pool.query(`
    update jugadores set aptitudes = (
      select coalesce(jsonb_agg(t.a), '[]'::jsonb)
      from jsonb_array_elements_text(jugadores.aptitudes) as t(a)
      where t.a in ('conduccion', 'penetracion', 'definicion')
    )
    where aptitudes @> '["equipo"]' or aptitudes @> '["individual"]'`)
  await pool.query('alter table bloques add column if not exists rival text')
  await pool.query('alter table bloques add column if not exists lugar text')
  await pool.query('alter table bloques add column if not exists hora_convocatoria time')
  await pool.query('alter table bloques add column if not exists valoracion int check (valoracion between 1 and 5)')
  await pool.query('alter table bloques add column if not exists cronica text')
  // Asistencia simplificada a presente/ausente: tarde contaba como presente
  // y justificado como ausente
  await pool.query(`update asistencias set estado = 'presente' where estado = 'tarde'`)
  await pool.query(`update asistencias set estado = 'ausente' where estado = 'justificado'`)
  await pool.query('alter table asistencias drop constraint if exists asistencias_estado_check')
  await pool.query(`alter table asistencias add constraint asistencias_estado_check
    check (estado in ('presente','ausente'))`)
  await pool.query(`create table if not exists evaluaciones (
    id uuid primary key default gen_random_uuid(),
    jugador_id uuid not null references jugadores(id) on delete cascade,
    fecha date not null default current_date,
    valores jsonb not null default '{}',
    comentario text,
    autor_email text,
    created_at timestamptz not null default now()
  )`)
  await pool.query(`create table if not exists lesiones (
    id uuid primary key default gen_random_uuid(),
    jugador_id uuid not null references jugadores(id) on delete cascade,
    fecha date not null default current_date,
    descripcion text not null,
    fecha_retorno_estimada date,
    recuperado boolean not null default false,
    created_at timestamptz not null default now()
  )`)
  return (texto, params) => pool.query(texto, params)
}

// Tolera los formatos habituales al pegar la cadena de Neon: comillas,
// espacios, o el comando completo `psql 'postgresql://...'`.
function urlDeConexion() {
  const crudo = (process.env.DATABASE_URL || '').trim()
  if (!crudo) {
    throw new Error('Falta DATABASE_URL en las variables de entorno (Vercel → Settings → Environment Variables)')
  }
  const m = crudo.match(/postgres(?:ql)?:\/\/[^\s'"]+/)
  if (!m) {
    throw new Error('DATABASE_URL no parece una cadena de conexión de Postgres: debería empezar con postgresql://')
  }
  return m[0]
}

export async function query(texto, params = []) {
  if (!_query) _query = await inicializar()
  const res = await _query(texto, params)
  return res.rows
}
