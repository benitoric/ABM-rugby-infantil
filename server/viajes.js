// Giras a otras provincias: rutas `viajes/...` de la API. Viven aparte del
// router para no seguir engordándolo; el router delega acá todo lo que
// empieza con `viajes`.
//
// Un viaje tiene: quiénes van (viaje_jugadores), cómo se reparten para dormir
// en casas de familia del club anfitrión (viaje_grupos, un grupo por casa) y
// la parte administrativa de los managers: el checklist de papeles de cada
// chico y los pagos de cada familia (viaje_pagos). Lo cobrado nunca se guarda
// como total: se suma de los pagos, así el historial es la fuente.
import { query } from './db.js'

const COLS_VIAJE = `v.id, v.nombre, v.destino, v.club_anfitrion,
  v.fecha_salida::text as fecha_salida, v.fecha_regreso::text as fecha_regreso,
  v.precio::float8 as precio, v.cuotas, v.notas, v.creado_por,
  v.created_at::text as created_at`

const COLS_GRUPO = `id, viaje_id, numero, familia_nombre, familia_contacto, familia_telefono,
  familia_direccion, familia_notas`

const COLS_PAGO = `id, viaje_id, jugador_id, fecha::text as fecha,
  monto::float8 as monto, concepto, medio, registrado_por,
  created_at::text as created_at`

// Papeles que los padres entregan antes de viajar. Mismo catálogo que en
// src/helpers.js (PAPELES_VIAJE): acá solo se validan las claves.
const PAPELES = ['autorizacion', 'dni_copia', 'dni_devuelto']
const MEDIOS_PAGO = ['efectivo', 'transferencia', 'otro']
const MAX_CUOTAS = 24

const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
const texto = (v, max = 200) => {
  const t = String(v ?? '').trim()
  return t ? t.slice(0, max) : null
}

// Campos del viaje validados a partir del cuerpo del POST/PUT
function datosViaje(b) {
  const nombre = texto(b?.nombre, 120)
  if (!nombre) throw { codigo: 400, error: 'faltan_datos' }
  if (!esFecha(b.fecha_salida)) throw { codigo: 400, error: 'fecha_invalida' }
  const regreso = b.fecha_regreso || null
  if (regreso && !esFecha(regreso)) throw { codigo: 400, error: 'fecha_invalida' }
  if (regreso && regreso < b.fecha_salida) throw { codigo: 400, error: 'regreso_antes_de_salida' }
  let precio = null
  if (b.precio !== undefined && b.precio !== null && b.precio !== '') {
    precio = Number(b.precio)
    if (!Number.isFinite(precio) || precio < 0) throw { codigo: 400, error: 'precio_invalido' }
    precio = Math.round(precio * 100) / 100
  }
  let cuotas = null
  if (b.cuotas !== undefined && b.cuotas !== null && b.cuotas !== '') {
    cuotas = Number(b.cuotas)
    if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > MAX_CUOTAS) {
      throw { codigo: 400, error: 'cuotas_invalidas' }
    }
  }
  return [
    nombre, texto(b.destino, 120), texto(b.club_anfitrion, 120),
    b.fecha_salida, regreso, precio, cuotas, texto(b.notas, 2000),
  ]
}

async function viajeExiste(id) {
  const [v] = await query('select id from viajes where id = $1', [id])
  if (!v) throw { codigo: 404, error: 'no_existe' }
}

// Reemplaza el staff que viaja por la lista recibida
async function guardarStaff(viajeId, emails) {
  const lista = [...new Set((Array.isArray(emails) ? emails : [])
    .map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))]
  await query('delete from viaje_staff where viaje_id = $1 and not (staff_email = any($2))',
    [viajeId, lista])
  for (const email of lista) {
    await query(
      `insert into viaje_staff (viaje_id, staff_email)
       select $1, email from staff where email = $2
       on conflict do nothing`, [viajeId, email])
  }
}

// El detalle completo del viaje, que es lo que la pantalla necesita para
// dibujar cualquiera de sus vistas
async function detalle(id) {
  const [viaje] = await query(`select ${COLS_VIAJE} from viajes v where v.id = $1`, [id])
  if (!viaje) throw { codigo: 404, error: 'no_existe' }
  const staff = await query(
    `select s.email, s.nombre, s.apellido, s.rol
     from viaje_staff vs join staff s on s.email = vs.staff_email
     where vs.viaje_id = $1 order by s.apellido, s.nombre, s.email`, [id])
  const grupos = await query(
    `select ${COLS_GRUPO} from viaje_grupos where viaje_id = $1 order by numero`, [id])
  // Quiénes viajan, con los datos del jugador que hacen falta en el viaje
  // (tutor, DNI, ficha médica) y lo que ya pagó. `tiene_dni_app` avisa que el
  // DNI está escaneado en la app: el manager puede imprimir la copia de ahí.
  const jugadores = await query(
    `select vj.jugador_id, vj.grupo_id, vj.autorizacion, vj.dni_copia,
       vj.dni_devuelto, vj.observaciones,
       j.nombre, j.apellido, j.dni, j.fecha_nacimiento::text as fecha_nacimiento,
       j.estado, j.puestos, j.puesto_principal, j.posicion,
       j.tutor_nombre, j.tutor_telefono, j.ficha_medica_vigente,
       j.ficha_medica_vence::text as ficha_medica_vence,
       coalesce((select sum(p.monto) from viaje_pagos p
                 where p.viaje_id = vj.viaje_id and p.jugador_id = vj.jugador_id), 0)::float8 as pagado,
       (select count(*) from viaje_pagos p
         where p.viaje_id = vj.viaje_id and p.jugador_id = vj.jugador_id)::int as cantidad_pagos,
       exists (select 1 from documentos d where d.jugador_id = j.id) as tiene_dni_app
     from viaje_jugadores vj join jugadores j on j.id = vj.jugador_id
     where vj.viaje_id = $1 order by j.apellido, j.nombre`, [id])
  const pagos = await query(
    `select ${COLS_PAGO} from viaje_pagos where viaje_id = $1
     order by fecha desc, created_at desc`, [id])
  return { viaje, staff, grupos, jugadores, pagos }
}

// Devuelve el resultado de la ruta, o lanza { codigo, error }. `admin` dice
// si quien llama puede administrar (borrar un viaje entero queda para ellos).
export async function enrutarViajes({ metodo, p, b, yo, admin }) {
  // ---------- plantel para elegir quiénes viajan ----------
  // Lo mínimo para reconocer a cada chico: la pantalla de Viajes usa esto y
  // no el listado de jugadores, que trae asistencia y evaluaciones (y que
  // los managers no pueden ver).
  if (metodo === 'GET' && p[1] === 'plantel' && !p[2]) {
    return query(`select id, nombre, apellido, estado, posicion, puestos, puesto_principal
      from jugadores order by apellido, nombre`)
  }

  // ---------- listado y alta ----------
  if (metodo === 'GET' && !p[1]) {
    return query(`select ${COLS_VIAJE},
        (select count(*) from viaje_jugadores vj where vj.viaje_id = v.id)::int as jugadores,
        (select count(*) from viaje_grupos vg where vg.viaje_id = v.id)::int as grupos,
        (select count(*) from viaje_jugadores vj
          where vj.viaje_id = v.id and vj.grupo_id is null)::int as sin_alojar,
        (select count(*) from viaje_jugadores vj
          where vj.viaje_id = v.id
            and not (vj.autorizacion and vj.dni_copia and vj.dni_devuelto)
        )::int as papeles_pendientes,
        coalesce((select sum(monto) from viaje_pagos vp where vp.viaje_id = v.id), 0)::float8 as cobrado
      from viajes v order by v.fecha_salida desc, v.created_at desc`)
  }
  if (metodo === 'POST' && !p[1]) {
    const d = datosViaje(b)
    const [v] = await query(
      `insert into viajes (nombre, destino, club_anfitrion, fecha_salida, fecha_regreso,
         precio, cuotas, notas, creado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [...d, yo.email])
    if (b.staff_emails) await guardarStaff(v.id, b.staff_emails)
    return detalle(v.id)
  }

  const viajeId = p[1]
  if (!viajeId) throw { codigo: 404, error: 'no_existe' }

  // ---------- el viaje ----------
  if (metodo === 'GET' && !p[2]) return detalle(viajeId)
  if (metodo === 'PUT' && !p[2]) {
    const d = datosViaje(b)
    const filas = await query(
      `update viajes set nombre=$1, destino=$2, club_anfitrion=$3, fecha_salida=$4,
         fecha_regreso=$5, precio=$6, cuotas=$7, notas=$8, updated_at=now()
       where id=$9 returning id`, [...d, viajeId])
    if (!filas.length) throw { codigo: 404, error: 'no_existe' }
    if (b.staff_emails) await guardarStaff(viajeId, b.staff_emails)
    return detalle(viajeId)
  }
  if (metodo === 'DELETE' && !p[2]) {
    // Borra jugadores, grupos y pagos en cascada: queda para quien administra
    if (!admin) throw { codigo: 403, error: 'solo_administrador' }
    await query('delete from viajes where id = $1', [viajeId])
    return { ok: true }
  }

  await viajeExiste(viajeId)

  // ---------- staff que viaja ----------
  if (p[2] === 'staff' && metodo === 'PUT' && !p[3]) {
    await guardarStaff(viajeId, b?.emails)
    return detalle(viajeId)
  }

  // ---------- quiénes viajan ----------
  if (p[2] === 'jugadores') {
    // La lista completa de una vez: entran los nuevos y salen los que se
    // desmarcaron. Uno con pagos cargados no se puede sacar sin borrarlos
    // antes, para no perder el registro de lo que pagó su familia.
    if (metodo === 'PUT' && !p[3]) {
      const ids = [...new Set((Array.isArray(b?.jugador_ids) ? b.jugador_ids : [])
        .map(String).filter(Boolean))]
      const conPagos = await query(
        `select distinct vj.jugador_id from viaje_jugadores vj
         where vj.viaje_id = $1 and not (vj.jugador_id = any($2::uuid[]))
           and exists (select 1 from viaje_pagos p
                       where p.viaje_id = vj.viaje_id and p.jugador_id = vj.jugador_id)`,
        [viajeId, ids])
      if (conPagos.length) throw { codigo: 409, error: 'tiene_pagos' }
      await query(
        `delete from viaje_jugadores where viaje_id = $1 and not (jugador_id = any($2::uuid[]))`,
        [viajeId, ids])
      for (const jid of ids) {
        await query(
          `insert into viaje_jugadores (viaje_id, jugador_id)
           select $1, id from jugadores where id = $2
           on conflict do nothing`, [viajeId, jid])
      }
      return detalle(viajeId)
    }
    // Checklist, grupo de alojados y observaciones de un jugador del viaje.
    // Solo se tocan los campos que vienen en el cuerpo.
    if (metodo === 'PUT' && p[3]) {
      const sets = []
      const valores = []
      for (const clave of PAPELES) {
        if (clave in b) {
          valores.push(!!b[clave])
          sets.push(`${clave} = $${valores.length}`)
        }
      }
      if ('grupo_id' in b) {
        if (b.grupo_id) {
          const [g] = await query(
            'select id from viaje_grupos where id = $1 and viaje_id = $2', [b.grupo_id, viajeId])
          if (!g) throw { codigo: 400, error: 'grupo_invalido' }
        }
        valores.push(b.grupo_id || null)
        sets.push(`grupo_id = $${valores.length}`)
      }
      if ('observaciones' in b) {
        valores.push(texto(b.observaciones, 1000))
        sets.push(`observaciones = $${valores.length}`)
      }
      if (!sets.length) throw { codigo: 400, error: 'faltan_datos' }
      valores.push(viajeId, p[3])
      const filas = await query(
        `update viaje_jugadores set ${sets.join(', ')}
         where viaje_id = $${valores.length - 1} and jugador_id = $${valores.length}
         returning jugador_id`, valores)
      if (!filas.length) throw { codigo: 404, error: 'no_existe' }
      return { ok: true }
    }
  }

  // ---------- grupos de alojados (una casa por grupo) ----------
  if (p[2] === 'grupos') {
    const datosGrupo = (c) => [
      texto(c?.familia_nombre, 120), texto(c?.familia_contacto, 120), texto(c?.familia_telefono, 60),
      texto(c?.familia_direccion, 200), texto(c?.familia_notas, 1000),
    ]
    if (metodo === 'POST' && !p[3]) {
      const [g] = await query(
        `insert into viaje_grupos (viaje_id, numero, familia_nombre, familia_contacto,
           familia_telefono, familia_direccion, familia_notas)
         values ($1, (select coalesce(max(numero), 0) + 1 from viaje_grupos where viaje_id = $1),
                 $2, $3, $4, $5, $6)
         returning ${COLS_GRUPO}`, [viajeId, ...datosGrupo(b)])
      // Se puede crear la casa ya con sus chicos adentro
      const ids = Array.isArray(b?.jugador_ids) ? b.jugador_ids.map(String) : []
      if (ids.length) {
        await query(
          `update viaje_jugadores set grupo_id = $1
           where viaje_id = $2 and jugador_id = any($3::uuid[])`, [g.id, viajeId, ids])
      }
      return detalle(viajeId)
    }
    if (metodo === 'PUT' && p[3]) {
      const filas = await query(
        `update viaje_grupos set familia_nombre=$1, familia_contacto=$2, familia_telefono=$3,
           familia_direccion=$4, familia_notas=$5
         where id=$6 and viaje_id=$7 returning id`, [...datosGrupo(b), p[3], viajeId])
      if (!filas.length) throw { codigo: 404, error: 'no_existe' }
      return detalle(viajeId)
    }
    if (metodo === 'DELETE' && p[3]) {
      // Los chicos de la casa quedan sin alojar (grupo_id vuelve a null solo)
      await query('delete from viaje_grupos where id = $1 and viaje_id = $2', [p[3], viajeId])
      return detalle(viajeId)
    }
  }

  // ---------- pagos ----------
  if (p[2] === 'pagos') {
    if (metodo === 'POST' && !p[3]) {
      const monto = Math.round(Number(b?.monto) * 100) / 100
      if (!b?.jugador_id) throw { codigo: 400, error: 'faltan_datos' }
      if (!Number.isFinite(monto) || monto <= 0) throw { codigo: 400, error: 'monto_invalido' }
      const fecha = b.fecha || new Date().toISOString().slice(0, 10)
      if (!esFecha(fecha)) throw { codigo: 400, error: 'fecha_invalida' }
      const medio = b.medio || null
      if (medio && !MEDIOS_PAGO.includes(medio)) throw { codigo: 400, error: 'medio_invalido' }
      const [vj] = await query(
        'select 1 from viaje_jugadores where viaje_id = $1 and jugador_id = $2',
        [viajeId, b.jugador_id])
      if (!vj) throw { codigo: 400, error: 'no_viaja' }
      await query(
        `insert into viaje_pagos (viaje_id, jugador_id, fecha, monto, concepto, medio, registrado_por)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [viajeId, b.jugador_id, fecha, monto, texto(b.concepto, 120), medio, yo.email])
      return detalle(viajeId)
    }
    if (metodo === 'DELETE' && p[3]) {
      await query('delete from viaje_pagos where id = $1 and viaje_id = $2', [p[3], viajeId])
      return detalle(viajeId)
    }
  }

  throw { codigo: 404, error: 'no_existe' }
}
