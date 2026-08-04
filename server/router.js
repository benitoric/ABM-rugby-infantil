import { query } from './db.js'
import { autenticar, crearToken, hashClave, compararClave } from './auth.js'

const COLS_JUGADOR = `id, nombre, apellido, fecha_nacimiento::text as fecha_nacimiento,
  dni, posicion, aptitudes, estado, tutor_nombre, tutor_telefono, ficha_medica_vigente,
  ficha_medica_vence::text as ficha_medica_vence, observaciones`

const APTITUDES = ['conduccion', 'penetracion', 'definicion']

// Normaliza la posición sin importar cómo venga escrita (forward, BACK, mixto…)
function normalizarPosicion(p) {
  const t = (p || '').trim().toLowerCase()
  if (!t) return null
  if (t.startsWith('for')) return 'Forward'
  if (t.startsWith('back')) return 'Back'
  if (t.startsWith('mix')) return 'Mixto'
  return p.trim()
}
const COLS_LESION = `id, jugador_id, fecha::text as fecha, descripcion,
  fecha_retorno_estimada::text as fecha_retorno_estimada, recuperado`
const COLS_EVENTO = `id, tipo, fecha::text as fecha, hora::text as hora, rival, lugar, notas`
const COLS_SEGUIMIENTO = `id, jugador_id, fecha::text as fecha, area, valoracion, comentario, autor_email`
const COLS_EVALUACION = `id, jugador_id, fecha::text as fecha, valores, comentario, autor_email`
const COLS_BLOQUE = `id, evento_id, numero, nombre, rival, lugar,
  hora_convocatoria::text as hora_convocatoria, valoracion, cronica`

export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost')
    // La ruta puede venir como query (?ruta=auth/login — forma principal, no
    // depende del enrutamiento de Vercel) o en el path (/api/auth/login —
    // dev server local y acceso directo a /api/health desde el navegador).
    let ruta = url.searchParams.get('ruta')
    if (!ruta) {
      ruta = url.pathname.replace(/^\/api\/?/, '')
      if (ruta === 'index' || ruta === 'index.js') ruta = ''
    }
    // Decodificar cada segmento (los emails viajan con @ codificado)
    const partes = ruta.split('/').filter(Boolean).map((s) => {
      try { return decodeURIComponent(s) } catch { return s }
    })
    const cuerpo = await leerCuerpo(req)
    const resultado = await enrutar(req.method, partes, cuerpo, req, url)
    json(res, resultado?._codigo || 200, resultado ?? { ok: true })
  } catch (e) {
    if (e && e.codigo) json(res, e.codigo, { error: e.error || 'error' })
    else {
      console.error(e)
      json(res, 500, { error: 'interno', detalle: String(e?.message || e) })
    }
  }
}

async function enrutar(metodo, p, b, req, url) {
  // ---------- diagnóstico (sin token, no expone datos) ----------
  if (p[0] === 'health' && metodo === 'GET') {
    const r = {
      database_url_configurada: !!(process.env.DATABASE_URL || '').trim(),
      jwt_secret_configurado: !!(process.env.JWT_SECRET || '').trim(),
    }
    try {
      await query('select 1')
      r.conexion_base = 'ok'
      const [t] = await query("select to_regclass('public.staff') as staff")
      if (t.staff) {
        r.tablas = 'ok'
        const [c] = await query('select count(*)::int as n from staff')
        r.staff_cargados = c.n
        const [s] = await query('select count(*)::int as n from staff where password_hash is null')
        r.staff_sin_clave_todavia = s.n
      } else {
        r.tablas = 'FALTAN: ejecutá db/schema.sql en el SQL Editor de Neon (misma base a la que apunta DATABASE_URL)'
      }
    } catch (e) {
      r.conexion_base = 'ERROR: ' + String(e?.message || e)
    }
    return r
  }

  // ---------- autenticación (sin token) ----------
  if (p[0] === 'auth') {
    const email = String(b?.email || '').trim().toLowerCase()
    const clave = String(b?.password || '')
    if (!email || !clave) throw { codigo: 400, error: 'faltan_datos' }
    const filas = await query('select * from staff where email = $1', [email])
    const fila = filas[0]
    if (!fila) throw { codigo: 403, error: 'no_invitado' }
    if (!fila.activo) throw { codigo: 403, error: 'suspendido' }

    if (p[1] === 'login' && metodo === 'POST') {
      if (!fila.password_hash) throw { codigo: 409, error: 'necesita_clave' }
      if (!(await compararClave(clave, fila.password_hash)))
        throw { codigo: 401, error: 'clave_incorrecta' }
      return { token: await crearToken(email), staff: { email, nombre: fila.nombre } }
    }

    if (p[1] === 'setup' && metodo === 'POST') {
      if (clave.length < 6) throw { codigo: 400, error: 'clave_corta' }
      const act = await query(
        'update staff set password_hash = $1 where email = $2 and password_hash is null returning email',
        [await hashClave(clave), email])
      if (!act.length) throw { codigo: 409, error: 'ya_tiene_clave' }
      return { token: await crearToken(email), staff: { email, nombre: fila.nombre } }
    }
    throw { codigo: 404, error: 'no_existe' }
  }

  // ---------- todo lo demás requiere staff activo ----------
  const yo = await autenticar(req)

  if (p[0] === 'me') return { email: yo.email, nombre: yo.nombre }

  // ---------- jugadores ----------
  if (p[0] === 'jugadores') {
    if (metodo === 'GET' && !p[1]) {
      return query(`select ${COLS_JUGADOR},
        (select max(e.fecha)::text from evaluaciones e where e.jugador_id = jugadores.id)
          as ultima_evaluacion
        from jugadores order by apellido, nombre`)
    }
    if (metodo === 'POST' && !p[1]) {
      const d = datosJugador(b)
      const filas = await query(
        `insert into jugadores (nombre, apellido, fecha_nacimiento, dni, posicion, aptitudes,
           estado, tutor_nombre, tutor_telefono, ficha_medica_vigente, ficha_medica_vence, observaciones)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12) returning ${COLS_JUGADOR}`, d)
      return filas[0]
    }
    if (metodo === 'PUT' && p[1]) {
      const d = datosJugador(b)
      const filas = await query(
        `update jugadores set nombre=$1, apellido=$2, fecha_nacimiento=$3, dni=$4,
           posicion=$5, aptitudes=$6::jsonb, estado=$7, tutor_nombre=$8, tutor_telefono=$9,
           ficha_medica_vigente=$10, ficha_medica_vence=$11, observaciones=$12, updated_at=now()
         where id=$13 returning ${COLS_JUGADOR}`, [...d, p[1]])
      return filas[0]
    }
    if (metodo === 'DELETE' && p[1]) {
      await query('delete from jugadores where id = $1', [p[1]])
      return { ok: true }
    }
    if (metodo === 'POST' && p[1] === 'lote' && !p[2]) {
      // Carga masiva: b.jugadores = [{nombre, apellido, ...campos opcionales}]
      const lista = Array.isArray(b?.jugadores) ? b.jugadores : []
      if (!lista.length) throw { codigo: 400, error: 'faltan_datos' }
      let creados = 0
      for (const j of lista) {
        if (!j?.nombre?.trim() || !j?.apellido?.trim()) continue
        await query(
          `insert into jugadores (nombre, apellido, fecha_nacimiento, dni, posicion,
             tutor_nombre, tutor_telefono, ficha_medica_vence, observaciones)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [j.nombre.trim(), j.apellido.trim(), j.fecha_nacimiento || null,
           j.dni || null, normalizarPosicion(j.posicion), j.tutor_nombre || null,
           j.tutor_telefono || null, j.ficha_medica_vence || null,
           j.observaciones || null])
        creados++
      }
      return { creados }
    }
    // Acción masiva: marca ficha médica vigente a todos los que hoy figuran
    // inhabilitados (activos con ficha vencida o sin ficha). Limpia el
    // vencimiento viejo porque tiene prioridad sobre el tilde de vigente.
    if (metodo === 'POST' && p[1] === 'fichas-vigentes' && !p[2]) {
      const filas = await query(
        `update jugadores
         set ficha_medica_vigente = true, ficha_medica_vence = null, updated_at = now()
         where estado = 'activo'
           and (ficha_medica_vence < current_date
                or (ficha_medica_vence is null and not ficha_medica_vigente))
         returning id`)
      return { actualizados: filas.length }
    }
    if (metodo === 'GET' && p[1] && p[2] === 'detalle') {
      const [jugador] = await query(`select ${COLS_JUGADOR} from jugadores where id = $1`, [p[1]])
      if (!jugador) throw { codigo: 404, error: 'no_existe' }
      const seguimientos = await query(
        `select ${COLS_SEGUIMIENTO} from seguimientos where jugador_id = $1
         order by fecha desc, created_at desc`, [p[1]])
      const lesiones = await query(
        `select ${COLS_LESION} from lesiones where jugador_id = $1
         order by fecha desc, created_at desc`, [p[1]])
      const evaluaciones = await query(
        `select ${COLS_EVALUACION} from evaluaciones where jugador_id = $1
         order by fecha desc, created_at desc`, [p[1]])
      // Ausente por defecto: cuentan todos los eventos ya ocurridos en los que
      // se tomó asistencia; presente solo si tiene la marca explícita.
      const [tot] = await query(
        `select count(*) filter (where e.tipo = 'entrenamiento')::int as ent,
                count(*) filter (where e.tipo = 'partido')::int as par
         from eventos e
         where e.fecha <= current_date
           and exists (select 1 from asistencias a where a.evento_id = e.id)`)
      const [pres] = await query(
        `select count(*) filter (where ev.tipo = 'entrenamiento')::int as ent,
                count(*) filter (where ev.tipo = 'partido')::int as par
         from asistencias a
         join eventos ev on ev.id = a.evento_id
         where a.jugador_id = $1 and a.estado = 'presente' and ev.fecha <= current_date`,
        [p[1]])
      const [{ total }] = await query(
        'select count(*)::int as total from tiempo_jugadores where jugador_id = $1', [p[1]])
      const pct = (presentes, totales) =>
        totales ? Math.round((100 * presentes) / totales) : null
      return {
        jugador, seguimientos, lesiones, evaluaciones,
        stats: {
          entrenamientos: pct(pres.ent, tot.ent),
          partidos: pct(pres.par, tot.par),
          tiempos: total,
        },
      }
    }
  }

  // ---------- seguimientos ----------
  if (p[0] === 'seguimientos') {
    if (metodo === 'POST' && !p[1]) {
      const filas = await query(
        `insert into seguimientos (jugador_id, fecha, area, valoracion, comentario, autor_email)
         values ($1,$2,$3,$4,$5,$6) returning ${COLS_SEGUIMIENTO}`,
        [b.jugador_id, b.fecha, b.area, b.valoracion || null, b.comentario || null, yo.email])
      return filas[0]
    }
    if (metodo === 'DELETE' && p[1]) {
      await query('delete from seguimientos where id = $1', [p[1]])
      return { ok: true }
    }
  }

  // ---------- evaluaciones periódicas ----------
  if (p[0] === 'evaluaciones') {
    if (metodo === 'POST' && !p[1]) {
      if (!b?.jugador_id) throw { codigo: 400, error: 'faltan_datos' }
      // Solo se guardan valores enteros de 1 a 5
      const valores = {}
      for (const [k, v] of Object.entries(b.valores || {})) {
        const n = Number(v)
        if (Number.isInteger(n) && n >= 1 && n <= 5) valores[k] = n
      }
      if (!Object.keys(valores).length) throw { codigo: 400, error: 'faltan_datos' }
      const filas = await query(
        `insert into evaluaciones (jugador_id, fecha, valores, comentario, autor_email)
         values ($1, $2, $3, $4, $5) returning ${COLS_EVALUACION}`,
        [b.jugador_id, b.fecha || new Date().toISOString().slice(0, 10),
         JSON.stringify(valores), b.comentario?.trim() || null, yo.email])
      return filas[0]
    }
    if (metodo === 'DELETE' && p[1]) {
      await query('delete from evaluaciones where id = $1', [p[1]])
      return { ok: true }
    }
  }

  // ---------- lesiones ----------
  // Una lesión activa pasa al jugador a estado "lesionado"; al recuperarse o
  // borrarse la última lesión activa vuelve a "activo". Nunca toca a los
  // dados de baja ("inactivo").
  async function sincronizarEstadoLesion(jugadorId) {
    const activas = await query(
      'select count(*)::int as n from lesiones where jugador_id = $1 and not recuperado',
      [jugadorId])
    if (activas[0].n > 0) {
      await query("update jugadores set estado = 'lesionado' where id = $1 and estado = 'activo'", [jugadorId])
    } else {
      await query("update jugadores set estado = 'activo' where id = $1 and estado = 'lesionado'", [jugadorId])
    }
  }

  if (p[0] === 'lesiones') {
    if (metodo === 'POST' && !p[1]) {
      if (!b?.jugador_id || !b?.descripcion?.trim()) throw { codigo: 400, error: 'faltan_datos' }
      const filas = await query(
        `insert into lesiones (jugador_id, fecha, descripcion, fecha_retorno_estimada)
         values ($1, $2, $3, $4) returning ${COLS_LESION}`,
        [b.jugador_id, b.fecha || new Date().toISOString().slice(0, 10),
         b.descripcion.trim(), b.fecha_retorno_estimada || null])
      await sincronizarEstadoLesion(b.jugador_id)
      return filas[0]
    }
    if (metodo === 'PUT' && p[1]) {
      const filas = await query(
        'update lesiones set recuperado = $1 where id = $2 returning jugador_id', [!!b.recuperado, p[1]])
      if (filas[0]) await sincronizarEstadoLesion(filas[0].jugador_id)
      return { ok: true }
    }
    if (metodo === 'DELETE' && p[1]) {
      const filas = await query('delete from lesiones where id = $1 returning jugador_id', [p[1]])
      if (filas[0]) await sincronizarEstadoLesion(filas[0].jugador_id)
      return { ok: true }
    }
  }

  // ---------- estadísticas ----------
  if (p[0] === 'stats') {
    if (metodo === 'GET' && p[1] === 'tiempos') {
      const anio = Number(url.searchParams.get('anio')) || new Date().getFullYear()
      return query(
        `select j.id, j.nombre, j.apellido, count(tj.jugador_id)::int as tiempos
         from jugadores j
         left join tiempo_jugadores tj on tj.jugador_id = j.id and tj.tiempo_id in (
           select t.id from tiempos t
           join bloques bl on bl.id = t.bloque_id
           join eventos e on e.id = bl.evento_id
           where extract(year from e.fecha) = $1)
         where j.estado <> 'inactivo'
         group by j.id, j.nombre, j.apellido
         order by tiempos, j.apellido, j.nombre`, [anio])
    }
    if (metodo === 'GET' && p[1] === 'asistencia') {
      // Ausente por defecto: el total es la cantidad de eventos ya ocurridos
      // con asistencia tomada, igual para todos los jugadores.
      const [tot] = await query(
        `select count(*) filter (where e.tipo = 'entrenamiento')::int as ent,
                count(*) filter (where e.tipo = 'partido')::int as par
         from eventos e
         where e.fecha <= current_date
           and exists (select 1 from asistencias a where a.evento_id = e.id)`)
      const filas = await query(
        `select j.id, j.nombre, j.apellido,
           count(a.id) filter (where ev.tipo = 'entrenamiento' and a.estado = 'presente'
             and ev.fecha <= current_date)::int as ent_presentes,
           count(a.id) filter (where ev.tipo = 'partido' and a.estado = 'presente'
             and ev.fecha <= current_date)::int as par_presentes
         from jugadores j
         left join asistencias a on a.jugador_id = j.id
         left join eventos ev on ev.id = a.evento_id
         where j.estado <> 'inactivo'
         group by j.id, j.nombre, j.apellido
         order by j.apellido, j.nombre`)
      return filas.map((f) => ({
        id: f.id, nombre: f.nombre, apellido: f.apellido,
        entrenamientos_presentes: f.ent_presentes,
        entrenamientos_total: tot.ent,
        partidos_presentes: f.par_presentes,
        partidos_total: tot.par,
      }))
    }
  }

  // ---------- eventos y asistencia ----------
  if (p[0] === 'eventos') {
    if (metodo === 'GET' && !p[1]) {
      const eventos = await query(
        `select ${COLS_EVENTO} from eventos order by fecha desc, created_at desc`)
      // Datos de los bloques de cada partido (rival/lugar/convocatoria propios)
      const bloques = await query(
        `select ${COLS_BLOQUE} from bloques order by numero`)
      for (const ev of eventos) {
        if (ev.tipo === 'partido') ev.bloques = bloques.filter((bl) => bl.evento_id === ev.id)
      }
      return eventos
    }
    if (metodo === 'POST' && !p[1]) {
      const filas = await query(
        `insert into eventos (tipo, fecha, hora, rival, lugar, notas)
         values ($1,$2,$3,$4,$5,$6) returning ${COLS_EVENTO}`,
        [b.tipo, b.fecha, b.hora || null, b.rival || null, b.lugar || null, b.notas || null])
      const evento = filas[0]
      // Un partido nace con sus 2 bloques, cada uno con rival/lugar/convocatoria
      if (b.tipo === 'partido') {
        const datos = Array.isArray(b.bloques) ? b.bloques : []
        evento.bloques = []
        for (const numero of [1, 2]) {
          const d = datos.find((x) => Number(x?.numero) === numero) || {}
          const [bl] = await query(
            `insert into bloques (evento_id, numero, nombre, rival, lugar, hora_convocatoria)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (evento_id, numero) do nothing
             returning ${COLS_BLOQUE}`,
            [evento.id, numero, `Bloque ${numero}`, d.rival || null, d.lugar || null,
             d.hora_convocatoria || null])
          if (bl) evento.bloques.push(bl)
        }
      }
      return evento
    }
    if (metodo === 'DELETE' && p[1]) {
      await query('delete from eventos where id = $1', [p[1]])
      return { ok: true }
    }
    if (p[2] === 'asistencias' && p[1]) {
      if (metodo === 'GET') {
        return query('select jugador_id, estado from asistencias where evento_id = $1', [p[1]])
      }
      if (metodo === 'PUT') {
        // b.marcas: [{jugador_id, estado|null}] — null borra la marca
        for (const m of b.marcas || []) {
          if (m.estado === null) {
            await query('delete from asistencias where evento_id = $1 and jugador_id = $2',
              [p[1], m.jugador_id])
          } else {
            if (!['presente', 'ausente'].includes(m.estado)) {
              throw { codigo: 400, error: 'estado_invalido' }
            }
            await query(
              `insert into asistencias (evento_id, jugador_id, estado) values ($1,$2,$3)
               on conflict (evento_id, jugador_id) do update set estado = excluded.estado`,
              [p[1], m.jugador_id, m.estado])
          }
        }
        return { ok: true }
      }
    }
  }

  // ---------- día de partido: bloques y tiempos ----------
  if (p[0] === 'partido') {
    if (metodo === 'GET' && p[1]) {
      const eventoId = p[1]
      await query(
        `insert into bloques (evento_id, numero, nombre)
         values ($1, 1, 'Bloque 1'), ($1, 2, 'Bloque 2')
         on conflict (evento_id, numero) do nothing`, [eventoId])
      // Partidos viejos: si el rival estaba cargado a nivel evento, pasa al bloque
      await query(
        `update bloques set rival = e.rival, lugar = coalesce(bloques.lugar, e.lugar)
         from eventos e
         where e.id = bloques.evento_id and bloques.evento_id = $1
           and bloques.rival is null and e.rival is not null`, [eventoId])
      const bloques = await query(
        `select ${COLS_BLOQUE} from bloques where evento_id = $1 order by numero`, [eventoId])
      for (const bl of bloques) {
        await query(
          `insert into tiempos (bloque_id, numero) values ($1,1),($1,2),($1,3),($1,4)
           on conflict (bloque_id, numero) do nothing`, [bl.id])
      }
      const ids = bloques.map((x) => x.id)
      const tiempos = await query(
        'select id, bloque_id, numero from tiempos where bloque_id = any($1) order by numero', [ids])
      const asignaciones = await query(
        'select bloque_id, jugador_id from bloque_jugadores where bloque_id = any($1)', [ids])
      const enCancha = await query(
        `select tj.tiempo_id, tj.jugador_id from tiempo_jugadores tj
         join tiempos t on t.id = tj.tiempo_id where t.bloque_id = any($1)`, [ids])
      return { bloques, tiempos, asignaciones, en_cancha: enCancha }
    }
    if (metodo === 'POST' && p[1] === 'asignar') {
      // saca al jugador de ambos bloques del evento (y de sus tiempos) y lo pone en el nuevo
      const bloques = await query('select id from bloques where evento_id = $1', [b.evento_id])
      const ids = bloques.map((x) => x.id)
      await query('delete from bloque_jugadores where jugador_id = $1 and bloque_id = any($2)',
        [b.jugador_id, ids])
      await query(
        `delete from tiempo_jugadores where jugador_id = $1
         and tiempo_id in (select id from tiempos where bloque_id = any($2))`,
        [b.jugador_id, ids])
      if (b.bloque_id) {
        await query('insert into bloque_jugadores (bloque_id, jugador_id) values ($1,$2)',
          [b.bloque_id, b.jugador_id])
      }
      return { ok: true }
    }
    if (metodo === 'PUT' && p[1] === 'bloque' && p[2]) {
      // Actualización parcial: solo cambian los campos presentes en el cuerpo
      const sets = []
      const vals = []
      for (const campo of ['rival', 'lugar', 'hora_convocatoria', 'cronica']) {
        if (campo in b) {
          vals.push(b[campo] || null)
          sets.push(`${campo} = $${vals.length}`)
        }
      }
      if ('valoracion' in b) {
        const v = b.valoracion == null ? null : Number(b.valoracion)
        if (v !== null && !(v >= 1 && v <= 5)) throw { codigo: 400, error: 'valoracion_invalida' }
        vals.push(v)
        sets.push(`valoracion = $${vals.length}`)
      }
      if (!sets.length) throw { codigo: 400, error: 'faltan_datos' }
      vals.push(p[2])
      const filas = await query(
        `update bloques set ${sets.join(', ')} where id = $${vals.length} returning ${COLS_BLOQUE}`,
        vals)
      if (!filas.length) throw { codigo: 404, error: 'no_existe' }
      return filas[0]
    }
    if (metodo === 'POST' && p[1] === 'tiempo') {
      const filas = await query(
        `insert into tiempos (bloque_id, numero)
         select $1, coalesce(max(numero), 0) + 1 from tiempos where bloque_id = $1
         returning id, bloque_id, numero`, [b.bloque_id])
      return filas[0]
    }
    if (metodo === 'POST' && p[1] === 'cancha') {
      if (b.dentro) {
        await query(
          `insert into tiempo_jugadores (tiempo_id, jugador_id) values ($1,$2)
           on conflict do nothing`, [b.tiempo_id, b.jugador_id])
      } else {
        await query('delete from tiempo_jugadores where tiempo_id = $1 and jugador_id = $2',
          [b.tiempo_id, b.jugador_id])
      }
      return { ok: true }
    }
  }

  // ---------- staff ----------
  if (p[0] === 'staff') {
    if (metodo === 'GET') {
      return query(
        `select email, nombre, rol, activo, password_hash is not null as tiene_clave
         from staff order by created_at`)
    }
    if (metodo === 'POST') {
      const email = String(b.email || '').trim().toLowerCase()
      if (!email) throw { codigo: 400, error: 'faltan_datos' }
      const filas = await query(
        `insert into staff (email, nombre, rol) values ($1, $2, $3)
         on conflict (email) do nothing returning email`,
        [email, b.nombre || null, validarRol(b.rol)])
      if (!filas.length) throw { codigo: 409, error: 'ya_existe' }
      return { ok: true }
    }
    if (metodo === 'PUT' && p[1]) {
      let tocados = 0
      if ('activo' in b) {
        if (p[1] === yo.email) throw { codigo: 400, error: 'no_podes_suspenderte' }
        const r = await query(
          'update staff set activo = $1 where email = $2 returning email', [!!b.activo, p[1]])
        tocados += r.length
      }
      if ('rol' in b) {
        const r = await query(
          'update staff set rol = $1 where email = $2 returning email', [validarRol(b.rol), p[1]])
        tocados += r.length
      }
      if ('nombre' in b) {
        const r = await query(
          'update staff set nombre = $1 where email = $2 returning email', [b.nombre || null, p[1]])
        tocados += r.length
      }
      if (!tocados) throw { codigo: 404, error: 'no_existe' }
      return { ok: true }
    }
    if (metodo === 'DELETE' && p[1]) {
      if (p[1] === yo.email) throw { codigo: 400, error: 'no_podes_borrarte' }
      await query('delete from staff where email = $1', [p[1]])
      return { ok: true }
    }
  }

  throw { codigo: 404, error: 'no_existe' }
}

const ROLES = [
  'Cabeza de división',
  'Entrenador',
  'Preparador físico (PF)',
  'PF/entrenador',
  'Manager principal',
  'Manager asistente',
]

function validarRol(rol) {
  if (!rol) return null
  if (!ROLES.includes(rol)) throw { codigo: 400, error: 'rol_invalido' }
  return rol
}

function datosJugador(b) {
  if (!b?.nombre?.trim() || !b?.apellido?.trim()) throw { codigo: 400, error: 'faltan_datos' }
  const aptitudes = Array.isArray(b.aptitudes)
    ? [...new Set(b.aptitudes.filter((a) => APTITUDES.includes(a)))]
    : []
  return [
    b.nombre.trim(), b.apellido.trim(), b.fecha_nacimiento || null, b.dni || null,
    normalizarPosicion(b.posicion), JSON.stringify(aptitudes), b.estado || 'activo', b.tutor_nombre || null,
    b.tutor_telefono || null, !!b.ficha_medica_vigente, b.ficha_medica_vence || null,
    b.observaciones || null,
  ]
}

async function leerCuerpo(req) {
  if (req.method === 'GET' || req.method === 'DELETE') return null
  if (req.body !== undefined) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
  }
  const trozos = []
  for await (const t of req) trozos.push(t)
  const texto = Buffer.concat(trozos).toString('utf8')
  return texto ? JSON.parse(texto) : {}
}

function json(res, codigo, datos) {
  res.statusCode = codigo
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(datos))
}
