// Prueba de permisos por rol contra la API con la base en memoria.
//
//   PGLITE=1 node scripts/test-permisos.mjs
//
// Levanta el router en un puerto libre, crea un entrenador y un manager, y
// recorre una tabla de rutas verificando que el manager reciba 403 en todo lo
// que no es administrativo (server/permisos.js), que el entrenador siga viendo
// todo, y que el manejo del staff quede para quien administra. Correrlo cada
// vez que se agregue una ruta: la lista blanca la cierra sola, pero esto lo
// deja documentado.
import { createServer } from 'http'
import { handle } from '../server/router.js'

process.env.PGLITE = process.env.PGLITE || '1'

const DUENIO = 'benitoric@gmail.com'
const ENTRENADOR = 'entrenador@prueba.test'
const MANAGER = 'manager@prueba.test'
const CLAVE = 'clave123'

let base
let fallas = 0
let pruebas = 0

async function pedir(ruta, { method = 'GET', body, token } = {}) {
  const [camino, extra] = ruta.split('?')
  const res = await fetch(`${base}/api/index?ruta=${encodeURIComponent(camino)}${extra ? `&${extra}` : ''}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const texto = await res.text()
  let datos = {}
  try { datos = JSON.parse(texto) } catch { /* no JSON */ }
  return { codigo: res.status, datos }
}

function esperar(descripcion, condicion, detalle) {
  pruebas++
  if (condicion) return
  fallas++
  console.error(`  ✗ ${descripcion}${detalle ? ` → ${JSON.stringify(detalle)}` : ''}`)
}

async function ingresar(email) {
  let r = await pedir('auth/setup', { method: 'POST', body: { email, password: CLAVE } })
  if (r.codigo === 409) r = await pedir('auth/login', { method: 'POST', body: { email, password: CLAVE } })
  if (r.codigo !== 200) throw new Error(`No se pudo ingresar ${email}: ${r.codigo} ${JSON.stringify(r.datos)}`)
  return r.datos
}

async function main() {
  const servidor = createServer((req, res) => handle(req, res))
  await new Promise((ok) => servidor.listen(0, ok))
  base = `http://localhost:${servidor.address().port}`

  // ---------- armado: dueño, entrenador y manager ----------
  const duenio = await ingresar(DUENIO)
  esperar('el dueño tiene alcance completo en el login', duenio.staff.alcance === 'completo', duenio.staff)
  esperar('el dueño administra', duenio.staff.admin === true, duenio.staff)
  const T = duenio.token

  let r = await pedir('staff', { method: 'POST', token: T, body: { email: 'sinrol@prueba.test', nombre: 'Sin rol' } })
  esperar('no se puede sumar staff sin rol', r.codigo === 400 && r.datos.error === 'rol_requerido', r)
  r = await pedir('staff', { method: 'POST', token: T, body: { email: 'raro@prueba.test', rol: 'Presidente' } })
  esperar('un rol desconocido se rechaza', r.codigo === 400 && r.datos.error === 'rol_invalido', r)

  r = await pedir('staff', { method: 'POST', token: T, body: { email: ENTRENADOR, nombre: 'Entrenador', rol: 'Entrenador' } })
  esperar('el dueño suma un entrenador', r.codigo === 200, r)
  r = await pedir('staff', { method: 'POST', token: T, body: { email: MANAGER, nombre: 'Manager', rol: 'Manager principal' } })
  esperar('el dueño suma un manager', r.codigo === 200, r)
  r = await pedir(`staff/${ENTRENADOR}`, { method: 'PUT', token: T, body: { rol: null } })
  esperar('no se puede dejar a alguien sin rol', r.codigo === 400 && r.datos.error === 'rol_requerido', r)

  // Un jugador y un evento para que las rutas tengan sobre qué responder
  r = await pedir('jugadores', { method: 'POST', token: T, body: {
    nombre: 'Juan', apellido: 'Pérez', dni: '55111222', fecha_nacimiento: '2014-05-20',
    tutor_nombre: 'Ana', tutor_telefono: '381555', observaciones: 'Nota reservada del entrenador',
  } })
  esperar('el dueño crea un jugador', r.codigo === 200, r)
  const jugador = r.datos
  r = await pedir('eventos', { method: 'POST', token: T, body: { tipo: 'entrenamiento', fecha: '2026-03-10' } })
  esperar('el dueño crea un evento', r.codigo === 200, r)
  const evento = r.datos
  r = await pedir('evaluaciones', { method: 'POST', token: T, body: {
    jugador_id: jugador.id, fecha: '2026-03-01', valores: { pase: 3 },
  } })
  esperar('el dueño carga una evaluación', r.codigo === 200, r)

  const entrenador = await ingresar(ENTRENADOR)
  const manager = await ingresar(MANAGER)
  esperar('el entrenador tiene alcance completo', entrenador.staff.alcance === 'completo', entrenador.staff)
  esperar('el entrenador no administra', entrenador.staff.admin === false, entrenador.staff)
  esperar('el manager tiene alcance administrativo', manager.staff.alcance === 'administrativo', manager.staff)
  esperar('el manager no administra', manager.staff.admin === false, manager.staff)
  const E = entrenador.token
  const M = manager.token

  // ---------- lo que el manager no puede ni ver ----------
  console.log('Rutas cerradas al manager:')
  const cerradas = [
    ['GET', 'jugadores'],
    ['POST', 'jugadores', { nombre: 'X', apellido: 'Y' }],
    ['PUT', `jugadores/${jugador.id}`, { nombre: 'X', apellido: 'Y' }],
    ['DELETE', `jugadores/${jugador.id}`],
    ['GET', `jugadores/${jugador.id}/detalle`],
    ['POST', 'jugadores/lote', { jugadores: [] }],
    ['POST', 'jugadores/fichas-vigentes'],
    ['GET', 'eventos'],
    ['POST', 'eventos', { tipo: 'entrenamiento', fecha: '2026-03-11' }],
    ['GET', `eventos/${evento.id}/asistencias`],
    ['GET', `eventos/${evento.id}/plan-tecnico`],
    ['GET', `eventos/${evento.id}/trabajo-fisico`],
    ['GET', `eventos/${evento.id}/tests`],
    ['GET', `eventos/${evento.id}/asistencias-partido`],
    ['GET', `eventos/${evento.id}/asistencias-staff`],
    ['GET', `partido/${evento.id}`],
    ['GET', `partido/${evento.id}/estado`],
    ['POST', 'partido/asignar', {}],
    ['GET', 'stats/asistencia'],
    ['GET', 'stats/asistencia-eventos'],
    ['GET', 'stats/fisico'],
    ['GET', 'stats/tiempos'],
    ['GET', 'stats/lesionados'],
    ['GET', 'stats/lesiones-pendientes'],
    ['GET', 'stats/ausencias-seguidas'],
    ['GET', 'stats/plan-tecnico'],
    ['GET', 'boletin'],
    ['GET', `boletin/${jugador.id}`],
    ['POST', 'evaluaciones', { jugador_id: jugador.id, valores: {} }],
    ['POST', 'seguimientos', { jugador_id: jugador.id, area: 'tecnica' }],
    ['POST', 'tests', { jugador_id: jugador.id }],
    ['POST', 'lesiones', { jugador_id: jugador.id }],
    ['GET', 'asignaciones'],
    ['POST', 'asignaciones/repartir'],
    ['PUT', 'capitanias/x', {}],
    ['GET', 'aspectos-tecnicos'],
    ['GET', 'sugerencias'],
    ['POST', 'staff', { email: 'otro@prueba.test', rol: 'Entrenador' }],
    ['PUT', `staff/${MANAGER}`, { rol: 'Entrenador' }],
    ['PUT', `staff/${ENTRENADOR}`, { activo: false }],
    ['DELETE', `staff/${ENTRENADOR}`],
    ['GET', `staff/${ENTRENADOR}`],
    ['GET', 'ruta-inventada'],
  ]
  for (const [method, ruta, body] of cerradas) {
    r = await pedir(ruta, { method, body, token: M })
    esperar(`manager ${method} ${ruta} → 403`, r.codigo === 403 && r.datos.error === 'solo_entrenadores', r)
  }
  console.log(`  ${cerradas.length} rutas probadas`)

  // ---------- lo que el manager sí puede ----------
  console.log('Rutas abiertas al manager:')
  r = await pedir('me', { token: M })
  esperar('manager GET me', r.codigo === 200 && r.datos.alcance === 'administrativo', r)

  r = await pedir('staff', { token: M })
  esperar('manager GET staff', r.codigo === 200 && r.datos.length >= 3, r)
  esperar('la lista de staff del manager no dice quién ingresó', r.datos.every((s) => !('tiene_clave' in s)), r.datos[0])
  r = await pedir('staff', { token: E })
  esperar('la lista de staff del entrenador sí lo dice', r.codigo === 200 && r.datos.every((s) => 'tiene_clave' in s), r.datos[0])

  r = await pedir('viajes/plantel', { token: M })
  esperar('manager GET viajes/plantel', r.codigo === 200 && r.datos.length === 1, r)
  const reservadas = ['asistencia', 'ultima_evaluacion', 'ultima_evaluacion_valores', 'observaciones', 'tutor_telefono', 'dni']
  esperar('el plantel para viajes no trae nada reservado',
    r.datos.every((j) => reservadas.every((k) => !(k in j))), Object.keys(r.datos[0] || {}))

  r = await pedir('padron', { token: M })
  esperar('manager GET padron', r.codigo === 200 && r.datos.length === 1, r)
  const deportivas = ['asistencia', 'ultima_evaluacion', 'ultima_evaluacion_valores', 'observaciones', 'aptitudes']
  esperar('el padrón no trae nada deportivo ni las observaciones',
    r.datos.every((j) => deportivas.every((k) => !(k in j))), Object.keys(r.datos[0] || {}))
  esperar('el padrón trae lo administrativo',
    ['dni', 'tutor_nombre', 'tutor_telefono', 'ficha_medica_vence', 'fecha_nacimiento'].every((k) => k in r.datos[0]),
    Object.keys(r.datos[0] || {}))

  r = await pedir(`padron/${jugador.id}`, { token: M })
  esperar('manager GET padron/:id', r.codigo === 200 && r.datos.jugador?.dni === '55111222' && Array.isArray(r.datos.documentos), r)
  esperar('el detalle del padrón no trae observaciones ni evaluaciones',
    !('observaciones' in r.datos.jugador) && !('evaluaciones' in r.datos), Object.keys(r.datos))

  r = await pedir(`padron/${jugador.id}`, { method: 'PUT', token: M, body: {
    dni: '55111333', fecha_nacimiento: '2014-05-21', tutor_nombre: 'Ana María',
    tutor_telefono: '381556', ficha_medica_vigente: true, ficha_medica_vence: '2027-01-01',
    nombre: 'Pisado', estado: 'inactivo', observaciones: 'pisada',
  } })
  esperar('manager PUT padron/:id', r.codigo === 200 && r.datos.dni === '55111333' && r.datos.tutor_nombre === 'Ana María', r)
  r = await pedir(`jugadores/${jugador.id}/detalle`, { token: E })
  esperar('el padrón no toca nombre, estado ni observaciones',
    r.datos.jugador.nombre === 'Juan' && r.datos.jugador.estado === 'activo'
      && r.datos.jugador.observaciones === 'Nota reservada del entrenador', r.datos.jugador)
  esperar('el padrón sí guardó la ficha médica', r.datos.jugador.ficha_medica_vence === '2027-01-01', r.datos.jugador)
  r = await pedir(`padron/${jugador.id}`, { method: 'PUT', token: M, body: { fecha_nacimiento: 'ayer' } })
  esperar('el padrón valida las fechas', r.codigo === 400, r)
  r = await pedir('padron/00000000-0000-0000-0000-000000000000', { token: M })
  esperar('padrón de un id inexistente → 404', r.codigo === 404, r)

  // Documentos: un PNG mínimo
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  r = await pedir('documentos', { method: 'POST', token: M, body: {
    jugador_id: jugador.id, nombre: 'dni.png', mime: 'image/png', datos: png, miniatura: png,
  } })
  esperar('manager sube el DNI', r.codigo === 200 && r.datos.id, r)
  const doc = r.datos
  r = await pedir(`documentos/${doc.id}`, { token: M })
  // Postgres corta el base64 en renglones de 76: se compara sin saltos
  esperar('manager ve el DNI', r.codigo === 200 && r.datos.datos?.replace(/\s/g, '') === png, r)
  r = await pedir(`padron/${jugador.id}`, { token: M })
  esperar('el DNI aparece en el padrón', r.datos.documentos.length === 1, r.datos)
  r = await pedir(`documentos/${doc.id}`, { method: 'DELETE', token: M })
  esperar('manager borra el DNI', r.codigo === 200, r)

  // Viajes: el flujo completo
  r = await pedir('viajes', { method: 'POST', token: M, body: {
    nombre: 'Gira a Salta', destino: 'Salta', fecha_salida: '2026-10-10', fecha_regreso: '2026-10-12',
    precio: 1000, cuotas: 2, staff_emails: [MANAGER],
  } })
  esperar('manager crea un viaje', r.codigo === 200 && r.datos.viaje?.id, r)
  const viaje = r.datos.viaje
  r = await pedir(`viajes/${viaje.id}/jugadores`, { method: 'PUT', token: M, body: { jugador_ids: [jugador.id] } })
  esperar('manager elige quiénes viajan', r.codigo === 200, r)
  r = await pedir(`viajes/${viaje.id}/grupos`, { method: 'POST', token: M, body: { familia_nombre: 'Familia López' } })
  esperar('manager crea una casa', r.codigo === 200, r)
  r = await pedir(`viajes/${viaje.id}/pagos`, { method: 'POST', token: M, body: {
    jugador_id: jugador.id, monto: 500, fecha: '2026-09-01', medio: 'efectivo',
  } })
  esperar('manager carga un pago', r.codigo === 200, r)
  r = await pedir(`viajes/${viaje.id}/jugadores/${jugador.id}`, { method: 'PUT', token: M, body: { autorizacion: true } })
  esperar('manager marca un papel', r.codigo === 200, r)
  r = await pedir(`viajes/${viaje.id}`, { token: M })
  esperar('manager ve el detalle del viaje', r.codigo === 200 && r.datos.jugadores?.[0]?.pagado === 500, r)
  // `observaciones` acá es la nota del manager para la casa (viaje_jugadores),
  // no la de los entrenadores en la ficha
  esperar('el detalle del viaje no trae las observaciones del entrenador',
    r.datos.jugadores[0].observaciones !== 'Nota reservada del entrenador', r.datos.jugadores[0])
  r = await pedir(`viajes/${viaje.id}`, { method: 'DELETE', token: M })
  esperar('manager no borra el viaje entero', r.codigo === 403, r)
  r = await pedir('viajes', { token: M })
  esperar('manager lista los viajes', r.codigo === 200 && r.datos.length === 1, r)

  r = await pedir('push/clave', { token: M })
  esperar('manager pide la clave de avisos', r.codigo === 200 && r.datos.clave, r)
  r = await pedir('push/suscripciones', { token: M })
  esperar('manager ve sus suscripciones', r.codigo === 200, r)

  // ---------- el entrenador sigue viendo todo, pero no maneja el staff ----------
  console.log('Entrenador:')
  for (const ruta of ['jugadores', 'eventos', 'stats/asistencia', 'boletin', 'asignaciones', 'padron', 'viajes', 'viajes/plantel']) {
    r = await pedir(ruta, { token: E })
    esperar(`entrenador GET ${ruta} → 200`, r.codigo === 200, r)
  }
  r = await pedir(`jugadores/${jugador.id}/detalle`, { token: E })
  esperar('entrenador ve la ficha con evaluaciones', r.codigo === 200 && r.datos.evaluaciones.length === 1, r)
  r = await pedir('staff', { method: 'POST', token: E, body: { email: 'otro@prueba.test', rol: 'Entrenador' } })
  esperar('entrenador no suma staff', r.codigo === 403 && r.datos.error === 'solo_cabeza', r)
  r = await pedir(`staff/${MANAGER}`, { method: 'PUT', token: E, body: { rol: 'Entrenador' } })
  esperar('entrenador no cambia roles', r.codigo === 403 && r.datos.error === 'solo_cabeza', r)
  r = await pedir(`staff/${MANAGER}`, { method: 'DELETE', token: E })
  esperar('entrenador no quita gente', r.codigo === 403 && r.datos.error === 'solo_cabeza', r)
  r = await pedir(`viajes/${viaje.id}`, { method: 'DELETE', token: E })
  esperar('entrenador no borra un viaje entero', r.codigo === 403, r)

  // ---------- el cambio de rol corta de inmediato ----------
  console.log('Cambio de rol:')
  r = await pedir(`staff/${MANAGER}`, { method: 'PUT', token: T, body: { rol: 'Entrenador' } })
  esperar('el dueño asciende al manager', r.codigo === 200, r)
  r = await pedir('jugadores', { token: M })
  esperar('con el mismo token, ya ve los jugadores', r.codigo === 200, r)
  r = await pedir(`staff/${MANAGER}`, { method: 'PUT', token: T, body: { rol: 'Manager asistente' } })
  esperar('el dueño lo vuelve manager asistente', r.codigo === 200, r)
  r = await pedir('jugadores', { token: M })
  esperar('con el mismo token, ya no los ve', r.codigo === 403, r)
  r = await pedir('me', { token: M })
  esperar('manager asistente: alcance administrativo', r.datos.alcance === 'administrativo', r.datos)

  servidor.close()
  console.log(`\n${pruebas - fallas}/${pruebas} pruebas pasaron`)
  if (fallas) {
    console.error(`${fallas} fallaron`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
