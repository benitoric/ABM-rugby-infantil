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
  // Si la última migración ya está aplicada se saltea todo (los arranques en
  // frío no pagan el costo). Si falta, un lock consultivo serializa los
  // arranques concurrentes: dos CREATE TABLE IF NOT EXISTS simultáneos pueden
  // fallar igual en Postgres por la carrera en el catálogo.
  // Al agregar una migración acá, actualizar el testigo de "aplicadas".
  const { rows: [testigo] } = await pool.query(
    `select exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'bloques'
         and column_name = 'cerrado_en') as aplicadas`)
  if (!testigo.aplicadas) {
    await pool.query('select pg_advisory_lock(420012)')
    try {
      await migrar(pool)
    } finally {
      await pool.query('select pg_advisory_unlock(420012)')
    }
  }
  return (texto, params) => pool.query(texto, params)
}

// Exportada para poder probarla contra una base con el esquema viejo
export async function migrar(pool) {
  await pool.query('alter table staff add column if not exists rol text')
  await pool.query('alter table staff add column if not exists apellido text')
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
  await pool.query(`create table if not exists asistencias_staff (
    id uuid primary key default gen_random_uuid(),
    evento_id uuid not null references eventos(id) on delete cascade,
    staff_email text not null references staff(email) on delete cascade,
    estado text not null check (estado in ('presente','ausente')),
    unique (evento_id, staff_email)
  )`)
  // Entrenamientos de rutina vs. extra, y suspensión de eventos y bloques
  await pool.query('alter table eventos add column if not exists hora_fin time')
  await pool.query('alter table eventos add column if not exists modalidad text')
  await pool.query('alter table eventos drop constraint if exists eventos_modalidad_check')
  await pool.query(`alter table eventos add constraint eventos_modalidad_check
    check (modalidad in ('rutina','extra'))`)
  for (const tabla of ['eventos', 'bloques']) {
    await pool.query(`alter table ${tabla} add column if not exists suspendido boolean not null default false`)
    await pool.query(`alter table ${tabla} add column if not exists motivo_suspension text`)
    await pool.query(`alter table ${tabla} add column if not exists nota_suspension text`)
    await pool.query(`alter table ${tabla} drop constraint if exists ${tabla}_motivo_suspension_check`)
    await pool.query(`alter table ${tabla} add constraint ${tabla}_motivo_suspension_check
      check (motivo_suspension in ('clima','feriado','otro'))`)
  }
  await pool.query(`create table if not exists documentos (
    id uuid primary key default gen_random_uuid(),
    jugador_id uuid not null references jugadores(id) on delete cascade,
    tipo text not null default 'dni' check (tipo in ('dni')),
    nombre text not null,
    mime text not null,
    datos bytea not null,
    subido_por text,
    created_at timestamptz not null default now()
  )`)
  await pool.query('alter table documentos add column if not exists miniatura bytea')
  await pool.query(`create table if not exists asignaciones_evaluacion (
    jugador_id uuid not null references jugadores(id) on delete cascade,
    staff_email text not null references staff(email) on delete cascade,
    asignado_por text,
    created_at timestamptz not null default now(),
    primary key (jugador_id)
  )`)
  // Revisión cruzada de las evaluaciones
  await pool.query('alter table evaluaciones add column if not exists revisor_email text')
  await pool.query('alter table evaluaciones add column if not exists valores_revisor jsonb')
  await pool.query('alter table evaluaciones add column if not exists comentario_revisor text')
  await pool.query('alter table evaluaciones add column if not exists revisado_en timestamptz')
  await pool.query('alter table asignaciones_evaluacion add column if not exists revisor_email text')
  await pool.query(`alter table asignaciones_evaluacion
    add column if not exists etapa text not null default 'evaluar'`)
  await pool.query('alter table asignaciones_evaluacion drop constraint if exists asignaciones_evaluacion_etapa_check')
  await pool.query(`alter table asignaciones_evaluacion add constraint asignaciones_evaluacion_etapa_check
    check (etapa in ('evaluar','revisar'))`)
  await pool.query('alter table asignaciones_evaluacion add column if not exists evaluacion_id uuid')
  // Grado de dificultad del rival de cada bloque
  await pool.query('alter table bloques add column if not exists dificultad text')
  await pool.query('alter table bloques drop constraint if exists bloques_dificultad_check')
  await pool.query(`alter table bloques add constraint bloques_dificultad_check
    check (dificultad in ('bueno','regular','malo'))`)
  // Un partido puede tener más de 2 bloques. La restricción nueva lleva otro
  // nombre para que sirva de testigo de que la migración ya corrió.
  await pool.query('alter table bloques drop constraint if exists bloques_numero_check')
  await pool.query('alter table bloques drop constraint if exists bloques_numero_valido')
  await pool.query(`alter table bloques add constraint bloques_numero_valido
    check (numero between 1 and 6)`)
  // Puesto (número de camiseta) y préstamo al rival en cada tiempo
  await pool.query('alter table tiempo_jugadores add column if not exists puesto smallint')
  await pool.query('alter table tiempo_jugadores drop constraint if exists tiempo_jugadores_puesto_check')
  await pool.query(`alter table tiempo_jugadores add constraint tiempo_jugadores_puesto_check
    check (puesto between 1 and 15 and puesto not in (6, 7))`)
  await pool.query(`alter table tiempo_jugadores
    add column if not exists prestado boolean not null default false`)
  // Control de asistencia del día del partido, aparte de la confirmación
  // anticipada (tabla asistencias). Reemplaza a la tabla convocatorias, que
  // duplicaba la confirmación que ya se toma en la sección Asistencia.
  await pool.query('drop table if exists convocatorias')
  await pool.query(`create table if not exists asistencias_partido (
    evento_id uuid not null references eventos(id) on delete cascade,
    jugador_id uuid not null references jugadores(id) on delete cascade,
    estado text not null check (estado in ('presente','ausente')),
    primary key (evento_id, jugador_id)
  )`)
  // Puestos específicos del jugador (la posición genérica pasa a derivarse)
  await pool.query(`alter table jugadores add column if not exists puestos jsonb not null default '[]'`)
  // Cierre de tiempos y bloques (congela el partido; reapertura auditada)
  await pool.query('alter table tiempos add column if not exists cerrado_en timestamptz')
  await pool.query('alter table tiempos add column if not exists valoracion int check (valoracion between 1 and 5)')
  await pool.query('alter table bloques add column if not exists cerrado_en timestamptz')
  await pool.query('alter table bloques add column if not exists cerrado_por text')
  // Llegadas tarde al partido (presente sin prioridad en los equipos)
  await pool.query(`alter table asistencias_partido
    add column if not exists tarde boolean not null default false`)
  // Golpeados y lesionados durante el partido
  await pool.query('alter table asistencias_partido add column if not exists condicion text')
  await pool.query('alter table asistencias_partido drop constraint if exists asistencias_partido_condicion_check')
  await pool.query(`alter table asistencias_partido add constraint asistencias_partido_condicion_check
    check (condicion in ('golpeado','lesionado'))`)
  // Staff a cargo de cada bloque, con su presencia efectiva del día
  await pool.query(`create table if not exists bloque_staff (
    bloque_id uuid not null references bloques(id) on delete cascade,
    staff_email text not null references staff(email) on delete cascade,
    presente boolean,
    primary key (bloque_id, staff_email)
  )`)
  await pool.query('alter table bloque_staff add column if not exists presente boolean')
  await pool.query(`create table if not exists lesiones (
    id uuid primary key default gen_random_uuid(),
    jugador_id uuid not null references jugadores(id) on delete cascade,
    fecha date not null default current_date,
    descripcion text not null,
    fecha_retorno_estimada date,
    recuperado boolean not null default false,
    created_at timestamptz not null default now()
  )`)
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
