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
import { query } from '../server/db.js'
import {
  analizarEncuesta, bloquesDe, insertarEnBloque, limpiarPreguntas, preguntasPorDefecto, reemplazarPregunta,
  renombrarBloque, resumirEncuesta, validarRespuestas,
} from '../src/encuesta.js'
import { generarCuestionarioPDF, generarReporteEncuestaPDF } from '../src/encuestaPDF.js'
import { analizarTextosLibres, normalizar, tonoDe } from '../src/encuestaTextos.js'
import { textoAvisoRespuesta } from '../server/encuestas.js'

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
  r = await pedir('eventos', { method: 'POST', token: T, body: {
    tipo: 'partido', fecha: '2026-11-07', bloques: [{ rival: 'Los Tarcos' }, { rival: 'Natación' }],
  } })
  esperar('el dueño crea un partido', r.codigo === 200 && r.datos.bloques?.length === 2, r)
  const partidoComun = r.datos
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
    ['PUT', `eventos/${partidoComun.id}`, { suspendido: true, motivo_suspension: 'clima' }],
    ['DELETE', `eventos/${partidoComun.id}`],
    ['GET', `eventos/${partidoComun.id}/asistencias`],
    ['PUT', `eventos/${partidoComun.id}/asistencias`, { marcas: [] }],
    ['GET', `eventos/${partidoComun.id}/asistencias-partido`],
    ['GET', `eventos/${partidoComun.id}/asistencias-staff`],
    ['GET', `partido/${partidoComun.id}`],
    ['GET', `partido/${partidoComun.id}/estado`],
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
    ['GET', 'informe?desde=2026-01-01&hasta=2026-03-31'],
    ['GET', 'encuestas'],
    ['GET', 'encuestas/00000000-0000-0000-0000-000000000000/inactivos'],
    ['POST', 'encuestas', { titulo: 'X' }],
    ['POST', 'evaluaciones', { jugador_id: jugador.id, valores: {} }],
    ['POST', 'seguimientos', { jugador_id: jugador.id, area: 'tecnica' }],
    ['POST', 'tests', { jugador_id: jugador.id }],
    ['GET', 'tests/cortes'],
    ['GET', 'stats/tests'],
    ['GET', 'tests/exportar'],
    ['PUT', 'tests/cortes/salto_largo', { verde: 150, amarillo: 120 }],
    ['DELETE', 'tests/cortes/salto_largo'],
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

  // Encuentros: el manager lo carga, nace su partido en la sección Partidos
  // (que el manager no ve) y marca de un toque quién pagó la inscripción
  r = await pedir('viajes', { method: 'POST', token: M, body: {
    tipo: 'encuentro', nombre: 'Encuentro en Los Tarcos', club_anfitrion: 'Los Tarcos',
    fecha_salida: '2026-11-07', hora: '10:00', precio: 800, fecha_regreso: '2026-11-09', cuotas: 3,
  } })
  esperar('manager crea un encuentro', r.codigo === 200 && r.datos.viaje?.tipo === 'encuentro' && !!r.datos.viaje.evento_id, r)
  esperar('el encuentro no tiene regreso ni cuotas',
    r.datos.viaje?.fecha_regreso === null && r.datos.viaje?.cuotas === null, r.datos.viaje)
  const encuentro = r.datos.viaje
  r = await pedir('eventos', { token: T })
  let partido = r.datos.find((e) => e.id === encuentro.evento_id)
  esperar('el encuentro creó su partido con dos bloques',
    partido?.tipo === 'partido' && partido.fecha === '2026-11-07' && partido.hora?.startsWith('10:00')
      && partido.lugar === 'Los Tarcos' && partido.encuentro === 'Encuentro en Los Tarcos'
      && partido.bloques?.length === 2 && !partido.rival, partido)
  r = await pedir(`viajes/${encuentro.id}/jugadores`, { method: 'PUT', token: M, body: { jugador_ids: [jugador.id] } })
  esperar('manager elige quiénes van al encuentro', r.codigo === 200, r)
  r = await pedir(`viajes/${encuentro.id}/jugadores/${jugador.id}/pagado`, { method: 'PUT', token: M, body: { pagado: true } })
  esperar('manager marca pagado de un toque',
    r.codigo === 200 && r.datos.jugadores[0].pagado === 800 && r.datos.pagos[0]?.concepto === 'Inscripción', r)
  r = await pedir(`viajes/${encuentro.id}/jugadores/${jugador.id}/pagado`, { method: 'PUT', token: M, body: { pagado: true } })
  esperar('marcarlo dos veces no cobra dos veces', r.codigo === 200 && r.datos.pagos.length === 1, r)
  r = await pedir('viajes', { token: M })
  esperar('el listado cuenta quiénes pagaron',
    r.datos.find((v) => v.id === encuentro.id)?.pagaron === 1, r.datos)
  r = await pedir(`viajes/${encuentro.id}/jugadores/${jugador.id}/pagado`, { method: 'PUT', token: M, body: { pagado: false } })
  esperar('manager desmarca pagado', r.codigo === 200 && r.datos.jugadores[0].pagado === 0 && !r.datos.pagos.length, r)
  // Los de la lista del encuentro quedan como "va" en la convocatoria del
  // partido, pagos aparte; al sacarlos de la lista vuelven a "sin responder"
  r = await pedir(`eventos/${encuentro.evento_id}/asistencias`, { token: T })
  esperar('el de la lista del encuentro queda como "va" en el partido',
    r.datos.some((a) => a.jugador_id === jugador.id && a.estado === 'presente'), r.datos)
  r = await pedir(`viajes/${encuentro.id}/jugadores`, { method: 'PUT', token: M, body: { jugador_ids: [] } })
  esperar('manager lo saca de la lista', r.codigo === 200 && !r.datos.jugadores.length, r)
  r = await pedir(`eventos/${encuentro.evento_id}/asistencias`, { token: T })
  esperar('fuera de la lista, vuelve a "sin responder"', !r.datos.some((a) => a.jugador_id === jugador.id), r.datos)
  r = await pedir(`viajes/${encuentro.id}/jugadores`, { method: 'PUT', token: M, body: { jugador_ids: [jugador.id] } })
  esperar('manager lo vuelve a poner en la lista', r.codigo === 200 && r.datos.jugadores.length === 1, r)
  // La convocatoria del partido de un encuentro no se toca desde Partidos
  r = await pedir(`eventos/${encuentro.evento_id}/asistencias`, { method: 'PUT', token: T, body: { marcas: [{ jugador_id: jugador.id, estado: null }] } })
  esperar('la convocatoria del partido del encuentro no se edita desde Partidos',
    r.codigo === 409 && r.datos.error === 'convocatoria_del_encuentro', r)
  r = await pedir(`eventos/${encuentro.evento_id}/asistencias`, { token: T })
  esperar('la marca "va" del encuentro sigue', r.datos.some((a) => a.jugador_id === jugador.id && a.estado === 'presente'), r.datos)
  // Para el manager, la convocatoria del partido del encuentro se mira pero no se marca
  r = await pedir(`convocatoria/${encuentro.evento_id}`, { token: M })
  esperar('manager ve la convocatoria del partido del encuentro, con el acceso al encuentro',
    r.codigo === 200 && r.datos.partido?.encuentro_id === encuentro.id && r.datos.confirmaciones.length === 1, r)
  r = await pedir(`convocatoria/${encuentro.evento_id}`, { method: 'PUT', token: M, body: { marcas: [{ jugador_id: jugador.id, estado: 'ausente' }] } })
  esperar('manager no marca la convocatoria del partido del encuentro',
    r.codigo === 409 && r.datos.error === 'convocatoria_del_encuentro', r)
  r = await pedir('convocatoria', { token: M })
  esperar('la lista de convocatoria del manager trae el id del encuentro',
    r.datos.find((e) => e.id === encuentro.evento_id)?.encuentro_id === encuentro.id, r.datos.length)
  r = await pedir('eventos', { token: T })
  esperar('el listado de eventos trae el id del encuentro',
    r.datos.find((e) => e.id === encuentro.evento_id)?.encuentro_id === encuentro.id, r.datos.length)
  r = await pedir(`eventos/${evento.id}/asistencias`, { method: 'PUT', token: T, body: { marcas: [{ jugador_id: jugador.id, estado: 'presente' }] } })
  esperar('la asistencia de un evento común sigue igual', r.codigo === 200, r)
  r = await pedir(`viajes/${viaje.id}/jugadores/${jugador.id}/pagado`, { method: 'PUT', token: M, body: { pagado: true } })
  esperar('el pagado de un toque es solo para encuentros', r.codigo === 400 && r.datos.error === 'solo_encuentros', r)
  const cambios = { ...encuentro, tipo: 'gira', fecha_salida: '2026-11-14', hora: '11:00', club_anfitrion: 'Cardenales' }
  r = await pedir(`viajes/${encuentro.id}`, { method: 'PUT', token: M, body: cambios })
  esperar('manager no edita los datos del encuentro', r.codigo === 403 && r.datos.error === 'solo_administrador', r)
  r = await pedir(`viajes/${viaje.id}`, { method: 'PUT', token: M, body: { ...viaje, destino: 'Jujuy' } })
  esperar('manager sigue editando la gira', r.codigo === 200 && r.datos.viaje.destino === 'Jujuy', r)
  r = await pedir(`viajes/${encuentro.id}`, { method: 'PUT', token: T, body: cambios })
  esperar('el dueño edita el encuentro (y el tipo no cambia)', r.codigo === 200 && r.datos.viaje.tipo === 'encuentro', r)
  r = await pedir('eventos', { token: T })
  partido = r.datos.find((e) => e.id === encuentro.evento_id)
  esperar('el partido sigue los cambios del encuentro',
    partido?.fecha === '2026-11-14' && partido.hora?.startsWith('11:00') && partido.lugar === 'Cardenales', partido)
  r = await pedir(`viajes/${encuentro.id}`, { method: 'DELETE', token: M })
  esperar('manager no borra el encuentro', r.codigo === 403, r)
  r = await pedir(`viajes/${encuentro.id}`, { method: 'DELETE', token: T })
  esperar('el dueño borra el encuentro y su partido vacío', r.codigo === 200 && r.datos.partido_borrado === true, r)
  r = await pedir('eventos', { token: T })
  esperar('el partido del encuentro se fue con él', !r.datos.some((e) => e.id === encuentro.evento_id), r.datos.length)

  r = await pedir('push/clave', { token: M })
  esperar('manager pide la clave de avisos', r.codigo === 200 && r.datos.clave, r)
  r = await pedir('push/suscripciones', { token: M })
  esperar('manager ve sus suscripciones', r.codigo === 200, r)

  // Convocatoria de los partidos: lista, plantel y "va / no va"
  r = await pedir('convocatoria', { token: M })
  const enLista = r.datos.find((e) => e.id === partidoComun.id)
  esperar('manager GET convocatoria', r.codigo === 200 && !!enLista, r)
  esperar('la lista de convocatoria no trae entrenamientos', r.datos.every((e) => e.tipo === 'partido'), r.datos)
  esperar('la lista trae los bloques con su rival', enLista?.bloques?.[0]?.rival === 'Los Tarcos', enLista)
  esperar('los bloques de la convocatoria no traen crónica ni valoración',
    !('cronica' in enLista.bloques[0]) && !('valoracion' in enLista.bloques[0]), Object.keys(enLista.bloques[0]))
  r = await pedir(`convocatoria/${partidoComun.id}`, { token: M })
  esperar('manager GET convocatoria/:id', r.codigo === 200 && r.datos.jugadores?.length === 1 && Array.isArray(r.datos.confirmaciones), r)
  esperar('el plantel de la convocatoria no trae nada reservado',
    r.datos.jugadores.every((j) => reservadas.every((k) => !(k in j))), Object.keys(r.datos.jugadores[0] || {}))
  esperar('la convocatoria no trae bloques armados ni asistencia del día',
    !('asignaciones' in r.datos) && !('asistencias_dia' in r.datos) && !('tiempos' in r.datos), Object.keys(r.datos))
  r = await pedir(`convocatoria/${evento.id}`, { token: M })
  esperar('la convocatoria de un entrenamiento no existe para el manager', r.codigo === 404, r)
  r = await pedir(`convocatoria/${partidoComun.id}`, { method: 'PUT', token: M, body: {
    marcas: [{ jugador_id: jugador.id, estado: 'presente', condicion: 'lesionado' }],
  } })
  esperar('manager marca que va', r.codigo === 200, r)
  r = await pedir(`eventos/${partidoComun.id}/asistencias`, { token: E })
  esperar('la marca quedó en la convocatoria del partido',
    r.datos.length === 1 && r.datos[0].estado === 'presente', r.datos)
  esperar('la condición que mandó el manager se descartó', r.datos[0].condicion == null, r.datos[0])
  r = await pedir(`convocatoria/${partidoComun.id}`, { method: 'PUT', token: M, body: {
    marcas: [{ jugador_id: jugador.id, estado: 'ausente' }],
  } })
  esperar('manager marca que no va', r.codigo === 200, r)
  r = await pedir(`convocatoria/${partidoComun.id}`, { token: M })
  esperar('la convocatoria devuelve la marca nueva', r.datos.confirmaciones[0]?.estado === 'ausente', r.datos.confirmaciones)
  r = await pedir(`convocatoria/${partidoComun.id}`, { method: 'PUT', token: M, body: {
    marcas: [{ jugador_id: jugador.id, estado: 'tal vez' }],
  } })
  esperar('un estado inválido se rechaza', r.codigo === 400, r)
  r = await pedir(`convocatoria/${partidoComun.id}`, { method: 'PUT', token: M, body: {
    marcas: [{ jugador_id: jugador.id, estado: null }],
  } })
  esperar('manager borra la marca', r.codigo === 200, r)
  r = await pedir(`convocatoria/${partidoComun.id}`, { token: M })
  esperar('sin marca queda sin responder', r.datos.confirmaciones.length === 0, r.datos.confirmaciones)
  r = await pedir(`convocatoria/${partidoComun.id}/estado`, { token: M })
  esperar('convocatoria con más tramos → 404', r.codigo === 404, r)
  r = await pedir('convocatoria', { token: T })
  esperar('el partido sigue sin suspender ni borrar',
    r.datos.find((e) => e.id === partidoComun.id)?.suspendido === false, r.datos)

  // ---------- el entrenador sigue viendo todo, pero no maneja el staff ----------
  console.log('Entrenador:')
  for (const ruta of ['jugadores', 'eventos', 'stats/asistencia', 'boletin', 'asignaciones', 'padron', 'viajes', 'viajes/plantel', 'convocatoria']) {
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
  r = await pedir(`staff/${MANAGER}`, { method: 'PUT', token: E, body: { blanquear_clave: true } })
  esperar('entrenador no blanquea claves', r.codigo === 403 && r.datos.error === 'solo_cabeza', r)
  r = await pedir(`viajes/${viaje.id}`, { method: 'DELETE', token: E })
  esperar('entrenador no borra un viaje entero', r.codigo === 403, r)
  r = await pedir('informe?desde=2026-01-01&hasta=2026-03-31', { token: E })
  esperar('entrenador no ve el informe de gestión', r.codigo === 403 && r.datos.error === 'solo_cabeza', r)

  // ---------- informe de gestión: solo quien administra ----------
  console.log('Informe de gestión:')
  r = await pedir('informe?desde=2026-03-01&hasta=2026-03-31', { token: T })
  esperar('el dueño pide el informe', r.codigo === 200, r)
  const informe = r.datos
  esperar('el informe trae todas las secciones',
    ['indicadores', 'plantel', 'actividad', 'asistencia', 'staff', 'evaluaciones', 'entrenado', 'tests', 'lesiones', 'partidos', 'administrativo', 'registro']
      .every((k) => k in informe), Object.keys(informe))
  esperar('el informe compara con el período anterior de igual largo',
    informe.anterior?.desde === '2026-01-29' && informe.anterior?.hasta === '2026-02-28', informe.anterior)
  esperar('el entrenamiento del período cuenta como realizado', informe.actividad.entrenamientos.realizados === 1, informe.actividad)
  esperar('la asistencia tomada se refleja en el informe',
    informe.asistencia.division.entrenamientos === 100 && informe.asistencia.por_evento.length === 1, informe.asistencia.division)
  esperar('la evaluación de marzo cuenta', informe.evaluaciones.cargadas === 1 && informe.evaluaciones.jugadores_evaluados === 1, informe.evaluaciones)
  esperar('la hoja del staff cuenta la evaluación del dueño',
    informe.staff.integrantes.find((s) => s.email === DUENIO)?.evaluaciones === 1, informe.staff.integrantes)
  esperar('el partido futuro no entra en el informe', informe.actividad.partidos.programados === 0, informe.actividad.partidos)
  r = await pedir('informe?desde=2026-03-31&hasta=2026-03-01', { token: T })
  esperar('un rango al revés se rechaza', r.codigo === 400 && r.datos.error === 'rango_invalido', r)
  r = await pedir('informe?desde=2099-01-01&hasta=2099-12-31', { token: T })
  esperar('un rango enteramente futuro se rechaza', r.codigo === 400 && r.datos.error === 'rango_futuro', r)
  // El historial de estado: la baja queda fechada y el informe la cuenta
  r = await pedir(`jugadores/${jugador.id}`, { method: 'PUT', token: T, body: { ...jugador, estado: 'inactivo' } })
  esperar('el dueño da de baja al jugador', r.codigo === 200 && r.datos.estado === 'inactivo', r)
  const hoyISO = new Date().toISOString().slice(0, 10)
  r = await pedir(`informe?desde=${hoyISO}&hasta=${hoyISO}`, { token: T })
  esperar('la baja de hoy sale en el informe de hoy',
    r.codigo === 200 && r.datos.plantel.bajas.length === 1 && r.datos.plantel.bajas[0].aproximado === false, r.datos?.plantel)
  esperar('al cierre de hoy no queda ningún activo', r.datos.plantel.activos_cierre === 0, r.datos?.plantel)
  r = await pedir(`jugadores/${jugador.id}`, { method: 'PUT', token: T, body: { ...jugador, estado: 'activo' } })
  esperar('el dueño lo reincorpora', r.codigo === 200, r)
  r = await pedir(`informe?desde=${hoyISO}&hasta=${hoyISO}`, { token: T })
  esperar('la reincorporación también queda registrada',
    r.datos.plantel.reincorporaciones.length === 1 && r.datos.plantel.activos_cierre === 1, r.datos?.plantel)

  // ---------- encuesta anónima a los jugadores ----------
  console.log('Encuesta a los jugadores:')
  r = await pedir('staff', { method: 'POST', token: T, body: { email: 'cabeza@prueba.test', nombre: 'Cabeza', rol: 'Cabeza de división' } })
  esperar('el dueño suma una cabeza de división', r.codigo === 200, r)
  const C = (await ingresar('cabeza@prueba.test')).token
  r = await pedir('encuestas', { token: E })
  esperar('el entrenador no ve las encuestas', r.codigo === 403 && r.datos.error === 'solo_cabeza', r)
  // Más chicos, para llegar al mínimo de respuestas que muestra resultados
  const chicos = [jugador.id]
  for (const [n, tel] of [['Uno', '381 15 400 0001'], ['Dos', null], ['Tres', null], ['Cuatro', null], ['Cinco', null]]) {
    r = await pedir('jugadores', { method: 'POST', token: T, body: { nombre: n, apellido: 'Encuesta', telefono: tel, tutor_telefono: '3815550000' } })
    chicos.push(r.datos.id)
  }
  esperar('el celular del chico se guarda en la ficha', r.codigo === 200 && 'telefono' in r.datos, r.datos)
  r = await pedir(`jugadores/${chicos[1]}/detalle`, { token: T })
  esperar('la ficha devuelve el celular del chico', r.datos.jugador.telefono === '381 15 400 0001', r.datos.jugador)
  r = await pedir(`jugadores/${chicos[1]}`, { method: 'PUT', token: T, body: { nombre: 'Uno', apellido: 'Encuesta' } })
  r = await pedir(`jugadores/${chicos[1]}/detalle`, { token: T })
  esperar('editar sin mandar el celular no lo borra', r.datos.jugador.telefono === '381 15 400 0001', r.datos.jugador)
  r = await pedir(`padron/${chicos[2]}`, { method: 'PUT', token: M, body: { telefono: '3814000002' } })
  esperar('el manager carga el celular del chico en el padrón', r.codigo === 200 && r.datos.telefono === '3814000002', r.datos)
  r = await pedir('viajes/plantel', { token: M })
  esperar('el plantel para viajes no trae el celular del chico', r.datos.every((j) => !('telefono' in j)), Object.keys(r.datos[0] || {}))

  const cierra = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
  r = await pedir('encuestas', { method: 'POST', token: T, body: { titulo: 'Fin de año', cierra } })
  esperar('el dueño crea una encuesta con las preguntas de siempre',
    r.codigo === 200 && r.datos.encuesta.estado === 'borrador' && r.datos.encuesta.preguntas.length === 22 && r.datos.editable, r.datos)
  const enc = r.datos.encuesta
  esperar('quien crea la encuesta recibe el aviso de cada respuesta', JSON.stringify(enc.avisar_a) === JSON.stringify([DUENIO]), enc.avisar_a)
  r = await pedir(`encuestas/${enc.id}/avisarme`, { method: 'PUT', token: C, body: { activo: true } })
  esperar('la cabeza de división se suma al aviso', r.codigo === 200 && r.datos.encuesta.avisar_a.includes('cabeza@prueba.test') && r.datos.encuesta.avisar_a.includes(DUENIO), r.datos.encuesta?.avisar_a)
  r = await pedir(`encuestas/${enc.id}/avisarme`, { method: 'PUT', token: T, body: { activo: false } })
  esperar('cada uno apaga su aviso sin tocar el de los demás', JSON.stringify(r.datos.encuesta.avisar_a) === JSON.stringify(['cabeza@prueba.test']), r.datos.encuesta?.avisar_a)
  r = await pedir(`encuestas/${enc.id}/avisarme`, { method: 'PUT', token: T, body: { activo: true } })
  esperar('y lo vuelve a prender', r.datos.encuesta.avisar_a.includes(DUENIO), r.datos.encuesta?.avisar_a)
  r = await pedir(`encuestas/${enc.id}/avisarme`, { method: 'PUT', token: E, body: { activo: true } })
  esperar('el entrenador no se suma a los avisos', r.codigo === 403, r)
  const aviso = textoAvisoRespuesta('Fin de año', 12, 40)
  esperar('el aviso dice cuántas van', aviso.cuerpo === 'Fin de año: van 12 de 40 (30%).', aviso)
  esperar('con todas, el aviso lo dice', textoAvisoRespuesta('Fin de año', 40, 40).titulo.includes('Contestaron todos'), null)
  r = await pedir(`encuestas/${enc.id}`, { method: 'PUT', token: T, body: { preguntas: [] } })
  esperar('una encuesta sin preguntas se rechaza', r.codigo === 400 && r.datos.error === 'preguntas_invalidas', r)
  const preguntas = enc.preguntas
    .filter((q) => q.clave !== 'mensaje')
    .map((q) => (q.clave === 'ganas' ? { ...q, texto: 'Tengo ganas de venir al club.' } : q))
  preguntas.push({ clave: 'x_comida', bloque: 'Organización', tipo: 'opciones', texto: '¿Qué preferís en el tercer tiempo?', opciones: ['Pizza', 'Sándwiches'], obligatoria: true })
  r = await pedir(`encuestas/${enc.id}`, { method: 'PUT', token: T, body: { preguntas } })
  esperar('se cambia, se saca y se suma una pregunta',
    r.codigo === 200 && r.datos.encuesta.preguntas.length === 22
      && r.datos.encuesta.preguntas.find((q) => q.clave === 'ganas').texto === 'Tengo ganas de venir al club.'
      && !r.datos.encuesta.preguntas.some((q) => q.clave === 'mensaje'), r.datos.encuesta?.preguntas?.length)
  const guardadas = r.datos.encuesta.preguntas.map((q) => q.clave)
  esperar('la pregunta sumada al final queda al final de su parte',
    guardadas.indexOf('x_comida') === guardadas.indexOf('nota_anio') + 1 && guardadas.at(-1) !== 'x_comida', guardadas.slice(-6))
  // El orden por parte del editor (src/encuesta.js)
  const deSiempre = preguntasPorDefecto()
  const conNueva = insertarEnBloque(deSiempre, { clave: 'x_nueva', bloque: 'Aprender', texto: 'Nueva' })
  esperar('una pregunta nueva va al final de su parte',
    conNueva[conNueva.findIndex((q) => q.clave === 'sin_gritos') + 1].clave === 'x_nueva', conNueva.map((q) => q.clave))
  const parteNueva = insertarEnBloque(deSiempre, { clave: 'x_otra', bloque: 'Parte nueva', texto: 'Otra' })
  esperar('una pregunta de una parte nueva va al final de todo', parteNueva.at(-1).clave === 'x_otra', null)
  const movida = reemplazarPregunta(deSiempre, 1, { ...deSiempre[1], bloque: 'Grupo' })
  esperar('una pregunta que cambia de parte va al final de la nueva',
    movida[movida.findIndex((q) => q.clave === 'molestaron') + 1].clave === deSiempre[1].clave, movida.map((q) => q.clave))
  const renombrada = renombrarBloque(deSiempre, 'Aprender', 'Lo que aprendí')
  esperar('renombrar una parte cambia todas sus preguntas',
    renombrada.filter((q) => q.bloque === 'Lo que aprendí').length === 3 && !renombrada.some((q) => q.bloque === 'Aprender'), null)
  const juntas = renombrarBloque(deSiempre, 'Grupo', 'Aprender')
  esperar('renombrar con el nombre de otra parte las junta en una',
    bloquesDe(juntas).find((b) => b.nombre === 'Aprender').preguntas.length === 6 && bloquesDe(juntas).length === 7, bloquesDe(juntas).map((b) => b.nombre))
  // Respuesta de 1 a 5 estrellas
  const conEstrellas = limpiarPreguntas([{ clave: 'x_estrellas', bloque: 'Prueba', tipo: 'estrellas', texto: '¿Cómo calificás el año?' }])
  esperar('la pregunta de estrellas se guarda', conEstrellas[0].tipo === 'estrellas' && conEstrellas[0].obligatoria, conEstrellas[0])
  esperar('se aceptan de 1 a 5 estrellas', validarRespuestas(conEstrellas, { x_estrellas: 5 }).x_estrellas === 5, null)
  let fueraDeRango = null
  try { validarRespuestas(conEstrellas, { x_estrellas: 6 }) } catch (e) { fueraDeRango = e.error }
  esperar('6 estrellas no vale', fueraDeRango === 'faltan_respuestas', fueraDeRango)
  const resEstrellas = resumirEncuesta(conEstrellas, [5, 4, 4, 3, 1].map((v) => ({ x_estrellas: v })))
  const est = resEstrellas.preguntas[0]
  esperar('las estrellas dan promedio y 4 o 5 cuentan como favorables',
    est.promedio === 3.4 && est.favorable === 60 && resEstrellas.indice === 60, est)

  // Casilleros: varias opciones
  const conVarias = limpiarPreguntas([{ clave: 'x_varias', bloque: 'Prueba', tipo: 'varias', texto: '¿Qué te gusta?', opciones: ['Correr', 'Tacklear', 'Pasar'] }])
  esperar('la pregunta de casilleros guarda sus opciones', conVarias[0].opciones?.length === 3 && !conVarias[0].segmento, conVarias[0])
  let sinOpciones = null
  try { limpiarPreguntas([{ clave: 'x_v2', bloque: 'P', tipo: 'varias', texto: 'X', opciones: ['Una'] }]) } catch (e) { sinOpciones = e.error }
  esperar('los casilleros necesitan al menos dos opciones', sinOpciones === 'preguntas_invalidas', sinOpciones)
  esperar('se pueden marcar varias, sin repetir y en orden',
    JSON.stringify(validarRespuestas(conVarias, { x_varias: [2, 0, 2] }).x_varias) === '[0,2]', null)
  let ningunaMarcada = null
  try { validarRespuestas(conVarias, { x_varias: [] }) } catch (e) { ningunaMarcada = e.error }
  esperar('obligatoria, sin ninguna marcada no se manda', ningunaMarcada === 'faltan_respuestas', ningunaMarcada)
  let opcionInventada = null
  try { validarRespuestas(conVarias, { x_varias: [7] }) } catch (e) { opcionInventada = e.error }
  esperar('una opción que no existe no vale', opcionInventada === 'faltan_respuestas', opcionInventada)
  const resVarias = resumirEncuesta(conVarias, [[0, 1], [0], [0, 2], [1, 2], [0, 1, 2]].map((v) => ({ x_varias: v })))
  esperar('cada opción cuenta a los chicos que la marcaron',
    resVarias.preguntas[0].opciones.map((o) => `${o.cantidad}/${o.pct}`).join(',') === '4/80,3/60,3/60' && resVarias.preguntas[0].favorable == null,
    resVarias.preguntas[0].opciones)

  let sinNombre = null
  try { renombrarBloque(deSiempre, 'Grupo', '  ') } catch (e) { sinNombre = e.error }
  esperar('una parte no puede quedar sin nombre', sinNombre === 'nombre_vacio', sinNombre)

  r = await pedir('encuesta-publica/token-que-no-existe-123')
  esperar('un link inventado no abre nada', r.codigo === 404 && r.datos.error === 'link_invalido', r)
  r = await pedir(`encuestas/${enc.id}/abrir`, { method: 'POST', token: T })
  esperar('al abrirla se arma un link por chico activo',
    r.codigo === 200 && r.datos.encuesta.estado === 'abierta' && r.datos.links.length === chicos.length
      && r.datos.links.every((l) => l.token && !l.usado), r.datos.links?.length)
  const tokens = Object.fromEntries(r.datos.links.map((l) => [l.jugador_id, l.token]))
  r = await pedir(`encuesta-publica/${tokens[chicos[0]]}`)
  esperar('el chico abre su link sin sesión', r.codigo === 200 && r.datos.estado === 'abierta' && r.datos.preguntas.length === 22, r.datos)
  esperar('la encuesta pública no dice de quién es el link', !JSON.stringify(r.datos).includes('Pérez') && !JSON.stringify(r.datos).includes('Juan'), r.datos)
  r = await pedir(`encuesta-publica/${tokens[chicos[0]]}`, { method: 'POST', body: { respuestas: { ganas: 4 } } })
  esperar('sin las obligatorias no se manda', r.codigo === 400 && r.datos.error === 'faltan_respuestas', r)
  const respuesta = (k) => {
    const res = {}
    for (const q of preguntas) {
      if (q.tipo === 'frecuencia') res[q.clave] = 1 + ((k + q.clave.length) % 4)
      else if (q.tipo === 'si_no') res[q.clave] = k % 2 ? 'si' : 'no'
      else if (q.tipo === 'si_nose_no') res[q.clave] = ['si', 'nose', 'no'][k % 3]
      else if (q.tipo === 'nota') res[q.clave] = 5 + k
      else if (q.tipo === 'opciones') res[q.clave] = k % q.opciones.length
      else if (q.clave === 'mas_gusto') res[q.clave] = `Me gustó ${k}`
    }
    return res
  }
  r = await pedir(`encuesta-publica/${tokens[chicos[0]]}`, { method: 'POST', body: { respuestas: respuesta(0), hablar: true } })
  esperar('el chico manda la encuesta y pide hablar', r.codigo === 200, r)
  r = await pedir(`encuesta-publica/${tokens[chicos[0]]}`, { method: 'POST', body: { respuestas: respuesta(0) } })
  esperar('el link no sirve dos veces', r.codigo === 409 && r.datos.error === 'ya_respondida', r)
  r = await pedir(`encuesta-publica/${tokens[chicos[0]]}`)
  esperar('el link usado dice que ya está contestada', r.datos.estado === 'respondida' && !r.datos.preguntas, r.datos)
  const columnas = (await query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'encuesta_respuestas' order by column_name`)).map((c) => c.column_name)
  esperar('la respuesta se guarda sin chico, sin token y sin hora',
    JSON.stringify(columnas) === JSON.stringify(['encuesta_id', 'id', 'respuestas']), columnas)
  const columnasFecha = (await query(
    `select table_name, column_name from information_schema.columns
     where table_schema = 'public' and table_name in ('encuesta_links', 'encuesta_respuestas')
       and (data_type like 'timestamp%' or data_type in ('date', 'time without time zone'))`))
  esperar('ni el link ni la respuesta guardan una fecha u hora', !columnasFecha.length, columnasFecha)
  r = await pedir(`encuestas/${enc.id}`, { token: T })
  esperar('con una respuesta, las preguntas quedan fijas y no hay resultados',
    r.datos.respuestas === 1 && r.datos.editable === false && !('resultados' in r.datos), r.datos)
  esperar('el dueño ve que hay un pedido, pero no de quién', !('pedidos' in r.datos) && r.datos.pedidos_pendientes === 1, r.datos)
  esperar('el link del que contestó ya no viaja', r.datos.links.find((l) => l.jugador_id === chicos[0]).token === null, r.datos.links)
  r = await pedir(`encuestas/${enc.id}`, { method: 'PUT', token: T, body: { preguntas } })
  esperar('con respuestas, las preguntas no se pueden cambiar', r.codigo === 409 && r.datos.error === 'preguntas_bloqueadas', r)
  r = await pedir(`encuestas/${enc.id}`, { token: C })
  esperar('la cabeza de división ve el pedido con el nombre',
    r.datos.pedidos?.length === 1 && r.datos.pedidos[0].nombre === 'Juan', r.datos.pedidos)
  const pedido = r.datos.pedidos[0]
  r = await pedir(`encuestas/pedidos/${pedido.id}`, { method: 'PUT', token: T, body: { atendido: true } })
  esperar('el dueño no atiende pedidos', r.codigo === 403 && r.datos.error === 'solo_cabeza_division', r)
  r = await pedir(`encuestas/pedidos/${pedido.id}`, { method: 'PUT', token: E, body: { atendido: true } })
  esperar('el entrenador no atiende pedidos', r.codigo === 403, r)
  r = await pedir(`encuestas/pedidos/${pedido.id}`, { method: 'PUT', token: C, body: { atendido: true } })
  esperar('la cabeza de división marca el pedido como atendido', r.codigo === 200 && r.datos.pedidos[0].atendido === true, r.datos.pedidos)
  r = await pedir(`encuestas/${enc.id}/links/${chicos[0]}/nuevo`, { method: 'POST', token: T })
  esperar('no hay link nuevo para el que ya contestó', r.codigo === 409, r)
  r = await pedir(`encuestas/${enc.id}/links/${chicos[1]}/nuevo`, { method: 'POST', token: T })
  const nuevoToken = r.datos.links.find((l) => l.jugador_id === chicos[1]).token
  esperar('un link nuevo reemplaza al anterior', r.codigo === 200 && nuevoToken !== tokens[chicos[1]], r.datos)
  r = await pedir(`encuesta-publica/${tokens[chicos[1]]}`)
  esperar('el link viejo deja de funcionar', r.codigo === 404, r)
  tokens[chicos[1]] = nuevoToken
  r = await pedir(`encuestas/${enc.id}/links/${chicos[1]}`, { method: 'PUT', token: T, body: { enviado: true } })
  esperar('se marca un link como enviado', r.codigo === 200, r)
  for (let k = 1; k < 5; k++) {
    r = await pedir(`encuesta-publica/${tokens[chicos[k]]}`, { method: 'POST', body: { respuestas: respuesta(k) } })
    esperar(`contesta el chico ${k + 1}`, r.codigo === 200, r)
  }
  r = await pedir(`encuestas/${enc.id}/cerrar`, { method: 'POST', token: T })
  esperar('al cerrarla aparecen los resultados',
    r.codigo === 200 && r.datos.encuesta.estado === 'cerrada' && r.datos.resultados?.suficientes === true
      && r.datos.resultados.respuestas === 5 && typeof r.datos.resultados.indice === 'number', r.datos.resultados)
  const res = r.datos.resultados
  esperar('los resultados traen la nota y las respuestas libres',
    res.nota?.promedio === 7 && res.preguntas.find((q) => q.clave === 'mas_gusto').textos.length === 5, res.nota)
  esperar('la pregunta nueva sale en los resultados',
    res.preguntas.find((q) => q.clave === 'x_comida')?.opciones.map((o) => o.cantidad).join() === '3,2', res.preguntas.find((q) => q.clave === 'x_comida'))
  esperar('"me molestaron" cuenta el no como favorable',
    res.preguntas.find((q) => q.clave === 'molestaron').favorable === 60, res.preguntas.find((q) => q.clave === 'molestaron'))
  // El análisis y los PDF, sobre la encuesta recién cerrada
  r = await pedir(`encuestas/${enc.id}`, { token: T })
  esperar('el detalle trae la cantidad de pedidos para el reporte', r.datos.pedidos_total === 1, r.datos.pedidos_total)
  const analisis = analizarEncuesta(r.datos.resultados, {
    links: r.datos.links.length, respondieron: 5, pedidos: r.datos.pedidos_total, pedidos_pendientes: r.datos.pedidos_pendientes,
  })
  esperar('el análisis cuenta la participación', analisis.participacion === 83, analisis.participacion)
  esperar('el análisis avisa de las burlas, en plural',
    analisis.alertas.some((a) => a.startsWith('2 chicos dicen que este año alguien del equipo se burló de ellos')), analisis.alertas)
  esperar('el análisis avisa de los que no tienen un adulto de confianza',
    analisis.alertas.some((a) => a.startsWith('3 chicos sienten que no tienen un adulto')), analisis.alertas)
  esperar('el análisis menciona el pedido ya atendido',
    analisis.alertas.some((a) => a.includes('pidió que alguien del club hable con él') && a.includes('ya se atendieron')), analisis.alertas)
  esperar('el análisis trae lectura y sugerencias', analisis.lectura.length >= 3 && analisis.sugerencias.length > 0, analisis)
  const reporte = generarReporteEncuestaPDF({
    encuesta: r.datos.encuesta, resultados: r.datos.resultados, links: r.datos.links.length, respondieron: 5,
    pedidos: 1, pedidosPendientes: 0, generadoPor: 'Prueba',
  })
  const textoReporte = new TextDecoder('latin1').decode(reporte.bytes())
  esperar('el reporte en PDF se arma', reporte.paginas >= 2 && textoReporte.startsWith('%PDF'), reporte.paginas)
  esperar('el reporte no lleva el nombre del chico que pidió hablar', !textoReporte.includes('Juan') && !textoReporte.includes('rez'), null)
  const cuestionario = generarCuestionarioPDF({ titulo: 'Fin de año', preguntas: r.datos.encuesta.preguntas, cierra })
  esperar('el cuestionario en PDF se arma', cuestionario.paginas >= 2, cuestionario.paginas)

  // Las respuestas libres: temas, tono y tendencias (sin servicios de afuera)
  {
    const conTextos = {
      ...r.datos.resultados,
      preguntas: [...r.datos.resultados.preguntas.filter((q) => q.tipo !== 'abierta' && q.clave !== 'juego_suficiente'),
        { clave: 'mas_gusto', tipo: 'abierta' }, { clave: 'cambiaria', tipo: 'abierta' }, { clave: 'mensaje', tipo: 'abierta' },
        { clave: 'juego_suficiente', tipo: 'frecuencia', texto: 'En los partidos juego lo suficiente.', opciones: [], n: 5 }].map((q) => {
        if (q.clave === 'juego_suficiente') return { ...q, favorable: 52 }
        if (q.clave === 'mas_gusto') {
          return { ...q, texto: 'Lo que más me gustó del año fue…', textos: ['El viaje a Salta con mis amigos', 'La gira a Mendoza!!!', 'los viajes', 'Jugar con mis compañeros',
            'Cuando ganamos el torneo', 'Los partidos', 'nada', 'Los entrenamientos', 'Ir a Jujuy con el equipo', 'Que nos divertimos muchoooo'] }
        }
        if (q.clave === 'cambiaria') {
          return { ...q, texto: 'Lo que cambiaría es…', textos: ['Nada', 'nada, está todo bien', 'Que todos jueguen lo mismo', 'jugar más minutos en los partidos',
            'Que no griten tanto', 'no se', 'Que siempre juegan los mismos', 'Que no me dejen en el banco', 'que algunos se burlan de los mas chicos'] }
        }
        if (q.clave === 'mensaje') {
          return { ...q, texto: 'Algo que les quiero decir a los entrenadores…', textos: ['Gracias por todo!!', 'Los quiero mucho, son los mejores', 'Que sigan así', 'gracias profes', 'que no griten', 'son unos capos'] }
        }
        return q
      }),
    }
    const libres = analizarTextosLibres(conTextos)
    const pq = Object.fromEntries(libres.preguntas.map((q) => [q.clave, q]))
    esperar('"nada" y "no sé" no cuentan como contenido', pq.mas_gusto.vacias === 1 && pq.cambiaria.vacias === 1, pq.cambiaria)
    esperar('"nada, está todo bien" es no cambiar nada', pq.cambiaria.nada_que_cambiar === 2, pq.cambiaria)
    esperar('los viajes son lo que más valoran',
      libres.valoran[0]?.id === 'viajes' || libres.valoran[0]?.id === 'agradecimiento', libres.valoran)
    esperar('jugar más minutos es lo que más piden cambiar', libres.piden[0]?.id === 'minutos' && libres.piden[0].en_contra === 4, libres.piden)
    esperar('"que no griten" es un pedido, no un elogio', tonoDe(normalizar('que no griten')) === 'negativo'
      && tonoDe(normalizar('no me aburrí nunca')) === 'positivo' && tonoDe(normalizar('no me gustó')) === 'negativo', null)
    esperar('los mensajes a los entrenadores salen con tono positivo', pq.mensaje.tonos.positivo >= 4,
      pq.mensaje.tonos)
    esperar('lo escrito se cruza con la pregunta cerrada floja',
      libres.cruces.some((c) => c.startsWith('Jugar más minutos') && c.includes('52% favorable')), libres.cruces)
    esperar('las burlas escritas salen para leer con atención',
      libres.sensibles.length === 1 && libres.sensibles[0].includes('burlan'), libres.sensibles)
    esperar('las tendencias salen redactadas', libres.tendencias.some((t) => t.startsWith('Lo que más piden cambiar')), libres.tendencias)
    const a2 = analizarEncuesta(conTextos, { links: 6, respondieron: 5 })
    esperar('el análisis avisa de las respuestas escritas sensibles',
      a2.alertas.some((t) => t.startsWith('1 respuesta escrita habla de burlas')) && a2.libres?.escritas > 0, a2.alertas)
    const rep2 = generarReporteEncuestaPDF({
      encuesta: r.datos.encuesta, resultados: conTextos, links: 6, respondieron: 5, pedidos: 1, pedidosPendientes: 0, generadoPor: 'Prueba',
    })
    const texto2 = new TextDecoder('latin1').decode(rep2.bytes())
    esperar('el reporte en PDF trae las tendencias de lo escrito',
      texto2.includes('Lo que escribieron: tendencias') && texto2.includes('Para leer con atenci'), rep2.paginas)
    esperar('con pocas respuestas no se analizan los textos', analizarTextosLibres({ suficientes: false }) === null, null)
  }

  r = await pedir(`encuesta-publica/${tokens[chicos[5]]}`, { method: 'POST', body: { respuestas: respuesta(5) } })
  esperar('cerrada, el link que quedaba ya no sirve', r.codigo === 409 && r.datos.error === 'encuesta_cerrada', r)
  r = await pedir(`encuestas/${enc.id}`, { method: 'DELETE', token: T })
  esperar('una encuesta con respuestas no se borra', r.codigo === 409, r)
  const hoyEnc = new Date().toISOString().slice(0, 10)
  r = await pedir(`informe?desde=${hoyEnc}&hasta=${hoyEnc}`, { token: T })
  esperar('la encuesta cerrada entra en el informe de gestión',
    r.codigo === 200 && r.datos.encuesta?.encuesta?.titulo === 'Fin de año' && r.datos.encuesta.respondieron === 5
      && r.datos.encuesta.pedidos === 1 && r.datos.encuesta.resultados.suficientes, r.datos.encuesta)
  r = await pedir('encuestas', { method: 'POST', token: T, body: { titulo: 'Para borrar' } })
  r = await pedir(`encuestas/${r.datos.encuesta.id}`, { method: 'DELETE', token: T })
  esperar('una encuesta sin respuestas se borra', r.codigo === 200, r)

  // El pedido para hablar del final: se edita, se saca y se vuelve a poner
  r = await pedir('encuestas', { method: 'POST', token: T, body: { titulo: 'Con pedido configurable', cierra } })
  const enc2 = r.datos.encuesta
  esperar('una encuesta nueva trae el pedido para hablar de siempre',
    enc2.pedido_ayuda?.activo === true && enc2.pedido_ayuda.texto.startsWith('Quiero que alguien del club'), enc2.pedido_ayuda)
  r = await pedir(`encuestas/${enc2.id}`, { method: 'PUT', token: T, body: { pedido_ayuda: { activo: true, texto: '  ', aclaracion: '' } } })
  esperar('el pedido no puede quedar sin texto', r.codigo === 400 && r.datos.error === 'pedido_invalido', r)
  r = await pedir(`encuestas/${enc2.id}`, { method: 'PUT', token: T, body: { pedido_ayuda: { activo: true, texto: 'Quiero hablar con un entrenador.', aclaracion: '' } } })
  esperar('se cambia el texto del pedido y se saca la aclaración',
    r.codigo === 200 && r.datos.encuesta.pedido_ayuda.texto === 'Quiero hablar con un entrenador.' && r.datos.encuesta.pedido_ayuda.aclaracion === '', r.datos.encuesta?.pedido_ayuda)
  r = await pedir(`encuestas/${enc2.id}/abrir`, { method: 'POST', token: T })
  const link2 = r.datos.links.find((l) => l.jugador_id === chicos[1]).token
  const link3 = r.datos.links.find((l) => l.jugador_id === chicos[2]).token
  r = await pedir(`encuesta-publica/${link2}`)
  esperar('el chico ve el pedido con el texto configurado', r.datos.pedido_ayuda?.texto === 'Quiero hablar con un entrenador.', r.datos.pedido_ayuda)
  const respuestas2 = {}
  for (const q of r.datos.preguntas) {
    if (q.tipo === 'frecuencia') respuestas2[q.clave] = 3
    else if (q.tipo === 'si_no' || q.tipo === 'si_nose_no') respuestas2[q.clave] = 'si'
    else if (q.tipo === 'nota') respuestas2[q.clave] = 8
    else if (q.tipo === 'opciones') respuestas2[q.clave] = 0
  }
  r = await pedir(`encuesta-publica/${link2}`, { method: 'POST', body: { respuestas: respuestas2, hablar: true } })
  esperar('con el pedido puesto, el chico lo puede marcar', r.codigo === 200, r)
  r = await pedir(`encuestas/${enc2.id}`, { method: 'PUT', token: T, body: { pedido_ayuda: { activo: false, texto: 'Quiero hablar con un entrenador.', aclaracion: '' } } })
  esperar('el pedido se saca aunque ya haya respuestas', r.codigo === 200 && r.datos.encuesta.pedido_ayuda.activo === false, r.datos.encuesta?.pedido_ayuda)
  r = await pedir(`encuesta-publica/${link3}`)
  esperar('sin pedido, la encuesta del chico lo trae apagado', r.datos.pedido_ayuda?.activo === false, r.datos.pedido_ayuda)
  r = await pedir(`encuesta-publica/${link3}`, { method: 'POST', body: { respuestas: respuestas2, hablar: true } })
  esperar('sin pedido, la respuesta se guarda igual', r.codigo === 200, r)
  r = await pedir(`encuestas/${enc2.id}`, { token: C })
  esperar('sin pedido, un "hablar" que llega no se registra (queda solo el de antes)', r.datos.pedidos?.length === 1, r.datos.pedidos)
  r = await pedir(`encuestas/${enc2.id}/cerrar`, { method: 'POST', token: T })
  r = await pedir(`encuestas/${enc2.id}`, { method: 'PUT', token: T, body: { pedido_ayuda: { activo: true, texto: 'X', aclaracion: '' } } })
  esperar('cerrada, el pedido ya no se toca', r.codigo === 409 && r.datos.error === 'encuesta_cerrada', r)
  const cuestionarioSin = generarCuestionarioPDF({ titulo: 'X', preguntas: deSiempre, pedidoAyuda: { activo: false } })
  const cuestionarioCon = generarCuestionarioPDF({ titulo: 'X', preguntas: deSiempre, pedidoAyuda: { activo: true, texto: 'Quiero hablar con un entrenador.', aclaracion: '' } })
  const texto = (doc) => new TextDecoder('latin1').decode(doc.bytes())
  esperar('el cuestionario sin pedido no lo muestra', !texto(cuestionarioSin).includes('hable conmigo'), null)
  esperar('el cuestionario muestra el texto configurado', texto(cuestionarioCon).includes('Quiero hablar con un entrenador.'), null)

  // Jugadores dados de baja: no reciben link solos, pero se suman eligiéndolos
  r = await pedir('jugadores', { method: 'POST', token: T, body: { nombre: 'Baja', apellido: 'Encuesta', estado: 'inactivo', tutor_telefono: '3815550000' } })
  const deBaja = r.datos
  esperar('hay un jugador dado de baja', deBaja.estado === 'inactivo', deBaja)
  r = await pedir('encuestas', { method: 'POST', token: T, body: { titulo: 'Con dados de baja', cierra } })
  const enc3 = r.datos.encuesta
  r = await pedir(`encuestas/${enc3.id}/abrir`, { method: 'POST', token: T })
  const linksAntes = r.datos.links.length
  esperar('al abrirla, el dado de baja no recibe link', !r.datos.links.some((l) => l.jugador_id === deBaja.id), linksAntes)
  r = await pedir(`encuestas/${enc3.id}/inactivos`, { token: T })
  esperar('la lista de dados de baja lo trae sin link', r.datos.some((j) => j.id === deBaja.id && !j.tiene_link), r.datos)
  r = await pedir(`encuestas/${enc3.id}/inactivos`, { token: E })
  esperar('el entrenador no ve la lista', r.codigo === 403, r)
  r = await pedir(`encuestas/${enc3.id}/links`, { method: 'POST', token: T, body: { jugador_ids: [deBaja.id, chicos[0]] } })
  const linkBaja = r.datos.links?.find((l) => l.jugador_id === deBaja.id)
  esperar('se suma el dado de baja elegido (y un activo no se duplica)',
    r.codigo === 200 && r.datos.links.length === linksAntes + 1 && linkBaja?.token && linkBaja.estado === 'inactivo', r.datos.links?.length)
  r = await pedir(`encuesta-publica/${linkBaja.token}`)
  esperar('el dado de baja abre su encuesta', r.codigo === 200 && r.datos.estado === 'abierta', r.datos)
  r = await pedir(`encuestas/${enc3.id}`, { token: T })
  esperar('mirar la encuesta no le saca el link', r.datos.links.some((l) => l.jugador_id === deBaja.id), null)
  r = await pedir(`encuestas/${enc3.id}/links/${chicos[0]}`, { method: 'DELETE', token: T })
  esperar('a un activo no se lo saca de la encuesta', r.codigo === 409 && r.datos.error === 'jugador_activo', r)
  r = await pedir(`encuestas/${enc3.id}/links/${deBaja.id}`, { method: 'DELETE', token: T })
  esperar('al dado de baja se lo saca', r.codigo === 200 && !r.datos.links.some((l) => l.jugador_id === deBaja.id), r.datos.links?.length)
  r = await pedir(`encuesta-publica/${linkBaja.token}`)
  esperar('su link deja de funcionar', r.codigo === 404, r)
  r = await pedir(`encuestas/${enc3.id}/links`, { method: 'POST', token: T, body: { jugador_ids: [deBaja.id] } })
  const linkBaja2 = r.datos.links.find((l) => l.jugador_id === deBaja.id).token
  r = await pedir(`encuesta-publica/${linkBaja2}`, { method: 'POST', body: { respuestas: respuestas2 } })
  esperar('el dado de baja contesta', r.codigo === 200, r)
  r = await pedir(`encuestas/${enc3.id}/links/${deBaja.id}`, { method: 'DELETE', token: T })
  esperar('si ya contestó no se lo saca', r.codigo === 409 && r.datos.error === 'ya_respondio', r)

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

  // ---------- blanqueo de clave: vuelve al flujo del primer ingreso ----------
  console.log('Blanqueo de clave:')
  r = await pedir(`staff/${ENTRENADOR}`, { method: 'PUT', token: T, body: { blanquear_clave: true } })
  esperar('el dueño blanquea la clave del entrenador', r.codigo === 200, r)
  r = await pedir('staff', { token: T })
  esperar('la lista lo muestra sin clave',
    r.datos.find((s) => s.email === ENTRENADOR)?.tiene_clave === false, r.datos)
  r = await pedir('auth/login', { method: 'POST', body: { email: ENTRENADOR, password: CLAVE } })
  esperar('su próximo login pide crear contraseña', r.codigo === 409 && r.datos.error === 'necesita_clave', r)
  r = await pedir('jugadores', { token: E })
  esperar('su sesión abierta sigue andando', r.codigo === 200, r)
  r = await pedir('auth/setup', { method: 'POST', body: { email: ENTRENADOR, password: 'clave-nueva' } })
  esperar('y crea una contraseña nueva', r.codigo === 200, r)
  r = await pedir('auth/login', { method: 'POST', body: { email: ENTRENADOR, password: 'clave-nueva' } })
  esperar('con la que ya puede ingresar', r.codigo === 200, r)

  // ---------- dónde viven: barrio libre, lugares que se aprenden ----------
  console.log('Barrios y lugares:')
  r = await pedir(`padron/${jugador.id}`, { method: 'PUT', token: M, body: {
    dni: '55111333', tutor_nombre: 'Ana María', barrio: 'country Vilago',
  } })
  esperar('manager carga el barrio en el padrón',
    r.codigo === 200 && r.datos.barrio === 'country Vilago' && r.datos.lugar_id === null, r)
  r = await pedir('lugares', { token: M })
  esperar('manager GET lugares', r.codigo === 200 && Array.isArray(r.datos.lugares)
    && Number.isFinite(r.datos.club?.lat), r)
  r = await pedir('lugares', { method: 'POST', token: M, body: {
    nombre: 'Vilago', lat: -26.81, lng: -65.29, textos: ['country Vilago'],
  } })
  esperar('manager ubica un lugar nuevo', r.codigo === 200 && r.datos.alias.includes('vilago'), r)
  const vilago = r.datos
  r = await pedir(`padron/${jugador.id}`, { token: M })
  esperar('el chico pendiente queda ubicado solo', r.datos.jugador.lugar_id === vilago.id, r.datos.jugador)
  r = await pedir(`padron/${jugador.id}`, { method: 'PUT', token: M, body: { dni: '55111333' } })
  esperar('un PUT sin el campo barrio no lo borra',
    r.datos.barrio === 'country Vilago' && r.datos.lugar_id === vilago.id, r.datos)
  r = await pedir('jugadores', { method: 'POST', token: E, body: {
    nombre: 'Pedro', apellido: 'Gómez', barrio: 'B° Világo, Yerba Buena',
  } })
  esperar('otra forma de escribirlo se reconoce sola', r.codigo === 200 && r.datos.lugar_id === vilago.id, r)
  const pedro = r.datos
  r = await pedir('jugadores', { method: 'POST', token: E, body: {
    nombre: 'Luis', apellido: 'Díaz', barrio: 'Las Lomitas',
  } })
  esperar('un barrio desconocido queda sin ubicar', r.codigo === 200 && r.datos.barrio === 'Las Lomitas' && r.datos.lugar_id === null, r)
  const luis = r.datos
  r = await pedir(`lugares/${vilago.id}/alias`, { method: 'POST', token: M, body: { texto: 'Lomitas' } })
  esperar('sumar un alias resuelve a los pendientes', r.codigo === 200 && r.datos.alias.includes('lomitas'), r)
  r = await pedir(`jugadores/${luis.id}/detalle`, { token: E })
  esperar('la ficha trae el lugar con la distancia al club',
    r.datos.jugador.lugar?.id === vilago.id && r.datos.jugador.lugar.distancia_km > 5, r.datos.jugador)
  r = await pedir(`lugares/${vilago.id}`, { method: 'PUT', token: M, body: { lat: -26.8, lng: -65.3 } })
  esperar('manager corrige el punto', r.codigo === 200 && r.datos.lat === -26.8, r)
  r = await pedir('lugares', { method: 'POST', token: M, body: { nombre: 'Lejos', lat: 40, lng: 3 } })
  esperar('un punto fuera del país se rechaza', r.codigo === 400 && r.datos.error === 'ubicacion_invalida', r)
  r = await pedir('lugares/club', { method: 'PUT', token: M, body: { lat: -26.83, lng: -65.19 } })
  esperar('manager no mueve el club', r.codigo === 403, r)
  r = await pedir('lugares/club', { method: 'PUT', token: E, body: { lat: -26.83, lng: -65.19 } })
  esperar('entrenador no mueve el club', r.codigo === 403, r)
  r = await pedir('lugares/club', { method: 'PUT', token: T, body: { lat: -26.83, lng: -65.19 } })
  esperar('el dueño mueve el club', r.codigo === 200, r)
  r = await pedir('lugares', { token: E })
  esperar('el club queda donde lo dejó', r.datos.club.lat === -26.83 && r.datos.club.guardada, r.datos.club)
  r = await pedir(`lugares/${vilago.id}`, { method: 'DELETE', token: M })
  esperar('manager no borra lugares', r.codigo === 403, r)
  r = await pedir(`lugares/${vilago.id}`, { method: 'DELETE', token: T })
  esperar('el dueño borra un lugar', r.codigo === 200, r)
  r = await pedir(`padron/${pedro.id}`, { token: M })
  esperar('sus chicos vuelven a quedar sin ubicar',
    r.datos.jugador.lugar_id === null && r.datos.jugador.barrio === 'B° Világo, Yerba Buena', r.datos.jugador)
  r = await pedir('jugadores', { token: M })
  esperar('el manager sigue sin ver jugadores (ni la asistencia por zona)', r.codigo === 403, r)

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
