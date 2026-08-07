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
const COLS_EVENTO = `id, tipo, fecha::text as fecha, hora::text as hora,
  hora_fin::text as hora_fin, modalidad, rival, lugar, notas,
  suspendido, motivo_suspension, nota_suspension`
const COLS_SEGUIMIENTO = `id, jugador_id, fecha::text as fecha, area, valoracion, comentario, autor_email`
const COLS_EVALUACION = `id, jugador_id, fecha::text as fecha, valores, comentario, autor_email,
  revisor_email, valores_revisor, comentario_revisor, revisado_en::date::text as revisado_en`
// Metadatos del documento: nunca el contenido (se pide aparte al abrirlo)
const COLS_DOCUMENTO = `id, jugador_id, tipo, nombre, mime,
  octet_length(datos) as bytes, created_at::date::text as fecha, subido_por,
  miniatura is not null as tiene_miniatura`

// Formatos aceptados para la documentación escaneada
const MIMES_DOC = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
// Vercel corta los cuerpos en 4,5 MB y base64 infla ~33%: 3 MB de archivo real
const MAX_DOC_BYTES = 3 * 1024 * 1024
const COLS_BLOQUE = `id, evento_id, numero, nombre, rival, dificultad, lugar,
  hora_convocatoria::text as hora_convocatoria, valoracion, cronica,
  suspendido, motivo_suspension, nota_suspension`

const MOTIVOS_SUSPENSION = ['clima', 'feriado', 'otro']

// Qué tan difícil se espera que sea el rival del bloque
const DIFICULTADES = ['bueno', 'regular', 'malo']

// Quiénes evalúan: entrenadores. Quedan afuera managers y preparadores
// físicos que no entrenan (los roles salen de ROLES_STAFF en src/helpers.js).
const ROLES_EVALUADORES = ['Cabeza de división', 'Entrenador', 'PF/entrenador']

// Jugadores que necesitan evaluación: sin evaluar o con la última de hace más
// de 30 días, sin contar a los dados de baja ni a los ya repartidos.
const DIAS_EVALUACION = 30
const SIN_EVALUAR = `
  left join lateral (
    select max(e.fecha) as fecha from evaluaciones e where e.jugador_id = j.id
  ) ult on true
  where j.estado <> 'inactivo'
    and (ult.fecha is null or ult.fecha < current_date - ${DIAS_EVALUACION})
    and not exists (
      select 1 from asignaciones_evaluacion a where a.jugador_id = j.id
    )`

// Horario del entrenamiento de rutina (lunes y miércoles)
const RUTINA = { hora: '19:30', hora_fin: '21:00' }

// Del cuerpo solo se guardan puntajes enteros de 1 a 5
function puntajesValidos(crudo) {
  const valores = {}
  for (const [k, v] of Object.entries(crudo || {})) {
    const n = Number(v)
    if (Number.isInteger(n) && n >= 1 && n <= 5) valores[k] = n
  }
  return valores
}

// Parejas cruzadas al azar: cada uno revisa lo que evaluó el otro. Con un
// número impar, los tres últimos forman una ronda (A→B→C→A).
function armarParejas(emails) {
  const mezclados = [...emails]
  for (let i = mezclados.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]]
  }
  const revisorDe = {}
  let i = 0
  while (mezclados.length - i >= 2) {
    // Los tres últimos, cuando sobra uno: ronda de a tres
    if (mezclados.length - i === 3) {
      const [a, b, c] = mezclados.slice(i)
      revisorDe[a] = b; revisorDe[b] = c; revisorDe[c] = a
      i += 3
      break
    }
    const a = mezclados[i]
    const b = mezclados[i + 1]
    revisorDe[a] = b
    revisorDe[b] = a
    i += 2
  }
  return revisorDe
}

function validarMotivo(m) {
  if (!m) return null
  if (!MOTIVOS_SUSPENSION.includes(m)) throw { codigo: 400, error: 'motivo_invalido' }
  return m
}

function validarDificultad(d) {
  if (!d) return null
  if (!DIFICULTADES.includes(d)) throw { codigo: 400, error: 'dificultad_invalida' }
  return d
}

// Un evento cuenta para las estadísticas si no está suspendido del todo: los
// partidos con un solo bloque suspendido siguen contando (el otro se jugó).
function eventoVigente(alias) {
  return `(not ${alias}.suspendido and (
    not exists (select 1 from bloques bl where bl.evento_id = ${alias}.id)
    or exists (select 1 from bloques bl where bl.evento_id = ${alias}.id and not bl.suspendido)))`
}

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
      // La miniatura del primer documento con imagen acompaña al listado: son
      // unos pocos KB por jugador, contra cientos si se mandara el archivo.
      return query(`select ${COLS_JUGADOR},
        ue.fecha::text as ultima_evaluacion,
        ue.valores as ultima_evaluacion_valores,
        ue.valores_revisor as ultima_evaluacion_revisor,
        doc.documento_id,
        doc.miniatura
        from jugadores
        left join lateral (
          select e.fecha, e.valores, e.valores_revisor from evaluaciones e
          where e.jugador_id = jugadores.id
          order by e.fecha desc, e.created_at desc limit 1
        ) ue on true
        left join lateral (
          select d.id as documento_id, encode(d.miniatura, 'base64') as miniatura
          from documentos d
          where d.jugador_id = jugadores.id and d.miniatura is not null
          order by d.created_at limit 1
        ) doc on true
        order by apellido, nombre`)
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
      const documentos = await query(
        `select ${COLS_DOCUMENTO} from documentos where jugador_id = $1
         order by created_at`, [p[1]])
      // Ausente por defecto: cuentan todos los eventos ya ocurridos en los que
      // se tomó asistencia; presente solo si tiene la marca explícita.
      const [tot] = await query(
        `select count(*) filter (where e.tipo = 'entrenamiento')::int as ent,
                count(*) filter (where e.tipo = 'partido')::int as par
         from eventos e
         where e.fecha <= current_date
           and exists (select 1 from asistencias a where a.evento_id = e.id)
           and ${eventoVigente('e')}`)
      const [pres] = await query(
        `select count(*) filter (where ev.tipo = 'entrenamiento')::int as ent,
                count(*) filter (where ev.tipo = 'partido')::int as par
         from asistencias a
         join eventos ev on ev.id = a.evento_id
         where a.jugador_id = $1 and a.estado = 'presente' and ev.fecha <= current_date
           and ${eventoVigente('ev')}`,
        [p[1]])
      const [{ total }] = await query(
        'select count(*)::int as total from tiempo_jugadores where jugador_id = $1', [p[1]])
      const pct = (presentes, totales) =>
        totales ? Math.round((100 * presentes) / totales) : null
      return {
        jugador, seguimientos, lesiones, evaluaciones, documentos,
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
    // Segunda mirada, a ciegas: el revisor puntúa sin ver la nota del primero
    if (metodo === 'POST' && p[1] && p[2] === 'revision') {
      const valores = puntajesValidos(b?.valores)
      if (!Object.keys(valores).length) throw { codigo: 400, error: 'faltan_datos' }
      const filas = await query(
        `update evaluaciones
         set revisor_email = $1, valores_revisor = $2, comentario_revisor = $3,
             revisado_en = now()
         where id = $4 returning ${COLS_EVALUACION}`,
        [yo.email, JSON.stringify(valores), b.comentario_revisor?.trim() || null, p[1]])
      if (!filas.length) throw { codigo: 404, error: 'no_existe' }
      await query('delete from asignaciones_evaluacion where evaluacion_id = $1', [p[1]])
      return filas[0]
    }
    if (metodo === 'POST' && !p[1]) {
      if (!b?.jugador_id) throw { codigo: 400, error: 'faltan_datos' }
      const valores = puntajesValidos(b.valores)
      if (!Object.keys(valores).length) throw { codigo: 400, error: 'faltan_datos' }
      const filas = await query(
        `insert into evaluaciones (jugador_id, fecha, valores, comentario, autor_email)
         values ($1, $2, $3, $4, $5) returning ${COLS_EVALUACION}`,
        [b.jugador_id, b.fecha || new Date().toISOString().slice(0, 10),
         JSON.stringify(valores), b.comentario?.trim() || null, yo.email])
      // Con la primera nota cargada, el jugador pasa a manos de su revisor.
      // Si no hay pareja asignada, la asignación se cierra acá.
      const paso = await query(
        `update asignaciones_evaluacion
         set etapa = 'revisar', evaluacion_id = $1
         where jugador_id = $2 and etapa = 'evaluar' and revisor_email is not null
         returning jugador_id`, [filas[0].id, b.jugador_id])
      if (!paso.length) {
        await query('delete from asignaciones_evaluacion where jugador_id = $1', [b.jugador_id])
      }
      return filas[0]
    }
    if (metodo === 'DELETE' && p[1]) {
      await query('delete from evaluaciones where id = $1', [p[1]])
      return { ok: true }
    }
  }

  // ---------- reparto de evaluaciones ----------
  if (p[0] === 'asignaciones') {
    if (metodo === 'GET' && !p[1]) {
      const mias = await query(
        `select a.jugador_id, j.nombre, j.apellido, j.posicion, a.evaluacion_id,
                ue.fecha::text as ultima_evaluacion
         from asignaciones_evaluacion a
         join jugadores j on j.id = a.jugador_id
         left join lateral (
           select max(e.fecha) as fecha from evaluaciones e where e.jugador_id = j.id
         ) ue on true
         where a.etapa = 'evaluar' and a.staff_email = $1
         order by j.apellido, j.nombre`, [yo.email])
      // Segunda etapa: lo que me toca revisar de mi pareja
      const revisar = await query(
        `select a.jugador_id, j.nombre, j.apellido, a.evaluacion_id, a.staff_email as evaluo,
                s.nombre as evaluo_nombre, s.apellido as evaluo_apellido
         from asignaciones_evaluacion a
         join jugadores j on j.id = a.jugador_id
         left join staff s on s.email = a.staff_email
         where a.etapa = 'revisar' and a.revisor_email = $1
         order by j.apellido, j.nombre`, [yo.email])
      const porEvaluador = await query(
        `select quien as staff_email, s.nombre, s.apellido,
                count(*) filter (where etapa = 'evaluar')::int as evaluar,
                count(*) filter (where etapa = 'revisar')::int as revisar
         from (
           select case when etapa = 'evaluar' then staff_email else revisor_email end as quien, etapa
           from asignaciones_evaluacion
         ) a
         join staff s on s.email = a.quien
         group by quien, s.nombre, s.apellido
         order by s.nombre, s.apellido`)
      const [{ n }] = await query(
        `select count(*)::int as n from jugadores j ${SIN_EVALUAR}`)
      return { mias, revisar, por_evaluador: porEvaluador, sin_repartir: n }
    }

    // Reparte al azar, en partes parejas, entre los entrenadores
    if (metodo === 'POST' && p[1] === 'repartir') {
      const evaluadores = await query(
        `select email from staff where activo and rol = any($1) order by email`,
        [ROLES_EVALUADORES])
      if (!evaluadores.length) throw { codigo: 409, error: 'sin_evaluadores' }
      const pendientes = await query(
        `select j.id from jugadores j ${SIN_EVALUAR} order by random()`)
      if (!pendientes.length) return { asignados: 0, evaluadores: evaluadores.length }
      // Cada evaluador queda cruzado con una pareja, que después revisa su
      // trabajo. Con un solo entrenador no hay con quién cruzar.
      const revisorDe = armarParejas(evaluadores.map((e) => e.email))
      // Se empieza en un evaluador al azar para que el resto no reciba
      // siempre uno menos cuando el reparto no es exacto.
      const inicio = Math.floor(Math.random() * evaluadores.length)
      for (let i = 0; i < pendientes.length; i++) {
        const quien = evaluadores[(inicio + i) % evaluadores.length].email
        await query(
          `insert into asignaciones_evaluacion (jugador_id, staff_email, revisor_email, asignado_por)
           values ($1, $2, $3, $4) on conflict (jugador_id) do nothing`,
          [pendientes[i].id, quien, revisorDe[quien] || null, yo.email])
      }
      return {
        asignados: pendientes.length,
        evaluadores: evaluadores.length,
        cruzado: Object.keys(revisorDe).length > 0,
      }
    }

    if (metodo === 'DELETE' && !p[1]) {
      await query('delete from asignaciones_evaluacion')
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

  // ---------- documentación escaneada (DNI) ----------
  if (p[0] === 'documentos') {
    // El contenido se pide de a un archivo, solo al abrirlo
    if (metodo === 'GET' && p[1]) {
      const [d] = await query(
        `select nombre, mime, encode(datos, 'base64') as datos
         from documentos where id = $1`, [p[1]])
      if (!d) throw { codigo: 404, error: 'no_existe' }
      return d
    }
    if (metodo === 'POST' && !p[1]) {
      const datos = String(b?.datos || '')
      if (!b?.jugador_id || !b?.nombre?.trim() || !datos) throw { codigo: 400, error: 'faltan_datos' }
      if (!MIMES_DOC.includes(b.mime)) throw { codigo: 400, error: 'formato_no_admitido' }
      // Tamaño real del archivo a partir del largo del base64
      const bytes = Math.floor((datos.length * 3) / 4)
      if (bytes > MAX_DOC_BYTES) throw { codigo: 413, error: 'archivo_muy_grande' }
      const filas = await query(
        `insert into documentos (jugador_id, tipo, nombre, mime, datos, miniatura, subido_por)
         values ($1, 'dni', $2, $3, decode($4, 'base64'),
                 case when $5::text is null then null else decode($5, 'base64') end, $6)
         returning ${COLS_DOCUMENTO}`,
        [b.jugador_id, b.nombre.trim().slice(0, 120), b.mime, datos,
         b.miniatura || null, yo.email])
      return filas[0]
    }
    // Miniatura recortada por el navegador: al cambiar el encuadre de la cara,
    // y para los documentos subidos antes de que las miniaturas existieran.
    if (metodo === 'PUT' && p[1] && p[2] === 'miniatura') {
      if (!b?.miniatura) throw { codigo: 400, error: 'faltan_datos' }
      await query(
        `update documentos set miniatura = decode($1, 'base64') where id = $2`,
        [b.miniatura, p[1]])
      return { ok: true }
    }
    if (metodo === 'DELETE' && p[1]) {
      await query('delete from documentos where id = $1', [p[1]])
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
           and exists (select 1 from asistencias a where a.evento_id = e.id)
           and ${eventoVigente('e')}`)
      const filas = await query(
        `select j.id, j.nombre, j.apellido,
           count(a.id) filter (where ev.tipo = 'entrenamiento' and a.estado = 'presente')::int as ent_presentes,
           count(a.id) filter (where ev.tipo = 'partido' and a.estado = 'presente')::int as par_presentes
         from jugadores j
         left join asistencias a on a.jugador_id = j.id
         left join eventos ev on ev.id = a.evento_id
           and ev.fecha <= current_date and ${eventoVigente('ev')}
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

  // ---------- sugerencias para autocompletar ----------
  // Salen de lo ya cargado en eventos y bloques (no hay catálogo aparte): cada
  // rival o lugar que se guarda queda disponible la próxima vez. Se ordenan por
  // uso, y las variantes que solo cambian en mayúsculas se unifican en la más
  // usada ("Cardenales" y "cardenales" son el mismo lugar).
  if (p[0] === 'sugerencias' && metodo === 'GET') {
    const usados = async (campo) => {
      const filas = await query(
        `select (array_agg(valor order by usos desc, valor))[1] as valor
         from (
           select trim(${campo}) as valor, count(*)::int as usos from eventos
           where coalesce(trim(${campo}), '') <> '' group by 1
           union all
           select trim(${campo}) as valor, count(*)::int as usos from bloques
           where coalesce(trim(${campo}), '') <> '' group by 1
         ) t
         group by lower(valor)
         order by sum(usos) desc, min(valor)`)
      return filas.map((f) => f.valor)
    }
    return { rivales: await usados('rival'), lugares: await usados('lugar') }
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
      // La modalidad (rutina/extra) es solo de los entrenamientos; el de rutina
      // tiene horario fijo salvo que se mande otro explícitamente.
      const modalidad = b.tipo === 'entrenamiento' && ['rutina', 'extra'].includes(b.modalidad)
        ? b.modalidad
        : null
      const hora = modalidad === 'rutina' ? b.hora || RUTINA.hora : b.hora || null
      const horaFin = modalidad === 'rutina' ? b.hora_fin || RUTINA.hora_fin : b.hora_fin || null
      const filas = await query(
        `insert into eventos (tipo, fecha, hora, hora_fin, modalidad, rival, lugar, notas)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning ${COLS_EVENTO}`,
        [b.tipo, b.fecha, hora, horaFin, modalidad, b.rival || null, b.lugar || null,
         b.notas || null])
      const evento = filas[0]
      // Un partido nace con sus 2 bloques, cada uno con rival/lugar/convocatoria
      if (b.tipo === 'partido') {
        const datos = Array.isArray(b.bloques) ? b.bloques : []
        evento.bloques = []
        for (const numero of [1, 2]) {
          const d = datos.find((x) => Number(x?.numero) === numero) || {}
          const [bl] = await query(
            `insert into bloques (evento_id, numero, nombre, rival, dificultad, lugar, hora_convocatoria)
             values ($1, $2, $3, $4, $5, $6, $7)
             on conflict (evento_id, numero) do nothing
             returning ${COLS_BLOQUE}`,
            [evento.id, numero, `Bloque ${numero}`, d.rival || null,
             validarDificultad(d.dificultad), d.lugar || null,
             d.hora_convocatoria || null])
          if (bl) evento.bloques.push(bl)
        }
      }
      return evento
    }
    // Actualización parcial del evento: solo cambian los campos presentes en
    // el cuerpo. Se usa sobre todo para suspender / reactivar.
    if (metodo === 'PUT' && p[1] && !p[2]) {
      const sets = []
      const vals = []
      const asignar = (campo, valor) => {
        vals.push(valor)
        sets.push(`${campo} = $${vals.length}`)
      }
      for (const campo of ['fecha', 'hora', 'hora_fin', 'lugar', 'notas', 'rival']) {
        if (campo in b) asignar(campo, b[campo] || null)
      }
      if ('modalidad' in b) {
        const m = b.modalidad || null
        if (m && !['rutina', 'extra'].includes(m)) throw { codigo: 400, error: 'modalidad_invalida' }
        asignar('modalidad', m)
      }
      if ('suspendido' in b) {
        asignar('suspendido', !!b.suspendido)
        // Al reactivar se limpian motivo y nota; no quedan datos huérfanos
        if (!b.suspendido) {
          asignar('motivo_suspension', null)
          asignar('nota_suspension', null)
        }
      }
      if ('motivo_suspension' in b && b.suspendido !== false) {
        asignar('motivo_suspension', validarMotivo(b.motivo_suspension))
      }
      if ('nota_suspension' in b && b.suspendido !== false) {
        asignar('nota_suspension', b.nota_suspension?.trim() || null)
      }
      if (!sets.length) throw { codigo: 400, error: 'faltan_datos' }
      vals.push(p[1])
      const filas = await query(
        `update eventos set ${sets.join(', ')} where id = $${vals.length} returning ${COLS_EVENTO}`,
        vals)
      if (!filas.length) throw { codigo: 404, error: 'no_existe' }
      const evento = filas[0]
      if (evento.tipo === 'partido') {
        evento.bloques = await query(
          `select ${COLS_BLOQUE} from bloques where evento_id = $1 order by numero`, [evento.id])
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
    if (p[2] === 'asistencias-staff' && p[1]) {
      if (metodo === 'GET') {
        return query('select staff_email, estado from asistencias_staff where evento_id = $1', [p[1]])
      }
      if (metodo === 'PUT') {
        // b.marcas: [{staff_email, estado|null}] — null borra la marca
        for (const m of b.marcas || []) {
          if (m.estado === null) {
            await query('delete from asistencias_staff where evento_id = $1 and staff_email = $2',
              [p[1], m.staff_email])
          } else {
            if (!['presente', 'ausente'].includes(m.estado)) {
              throw { codigo: 400, error: 'estado_invalido' }
            }
            await query(
              `insert into asistencias_staff (evento_id, staff_email, estado) values ($1,$2,$3)
               on conflict (evento_id, staff_email) do update set estado = excluded.estado`,
              [p[1], m.staff_email, m.estado])
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
      if ('dificultad' in b) {
        vals.push(validarDificultad(b.dificultad))
        sets.push(`dificultad = $${vals.length}`)
      }
      // Suspensión de un solo bloque: el otro puede jugarse igual
      if ('suspendido' in b) {
        vals.push(!!b.suspendido)
        sets.push(`suspendido = $${vals.length}`)
        if (!b.suspendido) sets.push('motivo_suspension = null, nota_suspension = null')
      }
      if (b.suspendido !== false) {
        if ('motivo_suspension' in b) {
          vals.push(validarMotivo(b.motivo_suspension))
          sets.push(`motivo_suspension = $${vals.length}`)
        }
        if ('nota_suspension' in b) {
          vals.push(b.nota_suspension?.trim() || null)
          sets.push(`nota_suspension = $${vals.length}`)
        }
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
        `select email, nombre, apellido, rol, activo, password_hash is not null as tiene_clave
         from staff order by created_at`)
    }
    if (metodo === 'POST') {
      const email = String(b.email || '').trim().toLowerCase()
      if (!email) throw { codigo: 400, error: 'faltan_datos' }
      const filas = await query(
        `insert into staff (email, nombre, apellido, rol) values ($1, $2, $3, $4)
         on conflict (email) do nothing returning email`,
        [email, b.nombre?.trim() || null, b.apellido?.trim() || null, validarRol(b.rol)])
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
          'update staff set nombre = $1 where email = $2 returning email',
          [b.nombre?.trim() || null, p[1]])
        tocados += r.length
      }
      if ('apellido' in b) {
        const r = await query(
          'update staff set apellido = $1 where email = $2 returning email',
          [b.apellido?.trim() || null, p[1]])
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
