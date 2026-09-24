// Padrón administrativo: rutas `padron/...` de la API. Es la vista de los
// chicos que ven los managers (alcance administrativo): datos de contacto,
// DNI, fecha de nacimiento, ficha médica y los escaneos del DNI. Nunca
// devuelve nada deportivo ni de salud más allá de la ficha médica: ni
// asistencia, ni evaluaciones, ni lesiones, ni tests, ni observaciones de los
// entrenadores. Los entrenadores también pueden usarlo, pero tienen la ficha.
import { query } from './db.js'

// Columnas administrativas. `estado` viaja para distinguir a los dados de
// baja; `puestos` y `posicion`, para reconocer al chico en el listado.
const COLS_PADRON = `j.id, j.nombre, j.apellido, j.fecha_nacimiento::text as fecha_nacimiento,
  j.dni, j.estado, j.posicion, j.puestos, j.puesto_principal, j.tutor_nombre, j.tutor_telefono,
  j.ficha_medica_vigente, j.ficha_medica_vence::text as ficha_medica_vence`

const COLS_DOCUMENTO = `id, jugador_id, tipo, nombre, mime,
  octet_length(datos) as bytes, created_at::date::text as fecha, subido_por,
  miniatura is not null as tiene_miniatura`

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')

// Solo lo administrativo se puede editar desde acá: nombre, estado, puestos
// y observaciones quedan para la ficha de los entrenadores.
function datosAdministrativos(b) {
  if (b?.fecha_nacimiento && !esFecha(b.fecha_nacimiento)) throw { codigo: 400, error: 'fecha_invalida' }
  if (b?.ficha_medica_vence && !esFecha(b.ficha_medica_vence)) throw { codigo: 400, error: 'fecha_invalida' }
  return [
    b?.fecha_nacimiento || null,
    String(b?.dni ?? '').trim() || null,
    String(b?.tutor_nombre ?? '').trim() || null,
    String(b?.tutor_telefono ?? '').trim() || null,
    !!b?.ficha_medica_vigente,
    b?.ficha_medica_vence || null,
  ]
}

export async function enrutarPadron({ metodo, p, b }) {
  if (metodo === 'GET' && !p[1]) {
    // Con la miniatura del primer documento con imagen, como el listado de
    // jugadores: unos pocos KB por chico.
    return query(`select ${COLS_PADRON}, doc.documento_id, doc.miniatura,
        (select count(*) from documentos d where d.jugador_id = j.id)::int as documentos
      from jugadores j
      left join lateral (
        select d.id as documento_id, encode(d.miniatura, 'base64') as miniatura
        from documentos d
        where d.jugador_id = j.id and d.miniatura is not null
        order by d.created_at limit 1
      ) doc on true
      order by j.apellido, j.nombre`)
  }

  const jugadorId = p[1]
  if (!jugadorId || p[2]) throw { codigo: 404, error: 'no_existe' }

  if (metodo === 'GET') {
    const [jugador] = await query(
      `select ${COLS_PADRON} from jugadores j where j.id = $1`, [jugadorId])
    if (!jugador) throw { codigo: 404, error: 'no_existe' }
    const documentos = await query(
      `select ${COLS_DOCUMENTO} from documentos where jugador_id = $1 order by created_at`,
      [jugadorId])
    return { jugador, documentos }
  }

  if (metodo === 'PUT') {
    const d = datosAdministrativos(b)
    const filas = await query(
      `update jugadores set fecha_nacimiento = $1, dni = $2, tutor_nombre = $3,
         tutor_telefono = $4, ficha_medica_vigente = $5, ficha_medica_vence = $6,
         updated_at = now()
       where id = $7
       returning id`, [...d, jugadorId])
    if (!filas.length) throw { codigo: 404, error: 'no_existe' }
    const [jugador] = await query(
      `select ${COLS_PADRON} from jugadores j where j.id = $1`, [jugadorId])
    return jugador
  }

  throw { codigo: 404, error: 'no_existe' }
}
