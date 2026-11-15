// Datos ficticios para la versión de prueba (demo) de la app.
//
// Arma una temporada entera inventada —chicos, staff, entrenamientos con
// asistencia y planillas, partidos con bloques y tiempos, tests, lesiones,
// evaluaciones, viajes, encuentros y encuestas— con fechas relativas a hoy,
// para que cada pantalla tenga algo para mostrar. Ningún dato es real: los
// nombres salen de listas comunes combinadas al azar y los DNI y teléfonos son
// inventados. El azar es con semilla fija, así dos siembras dan lo mismo.
//
// Lo usan scripts/seed-demo.mjs (base de Neon de la demo) y
// scripts/dev-server.mjs con DEMO=1 (base en memoria).
//
// Al sumar una función nueva a la app, conviene sumarle acá sus datos de
// ejemplo, así la demo la muestra con contenido.
import { randomUUID, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { areasParaEdad } from '../src/evaluacion.js'
import { CLAVES_FIJAS } from '../src/planTecnico.js'
import { CLAVES_FISICAS } from '../src/trabajoFisico.js'
import { CORTES_POR_DEFECTO, semaforoSugerido } from '../src/tests.js'
import { preguntasPorDefecto } from '../src/encuesta.js'
import { clavesDe } from '../src/lugares.js'
import { EMAIL_DUENIO, ROLES } from '../server/permisos.js'

// El staff inventado usa este dominio, que no existe: así nadie puede recibir
// nada ni reclamar esas cuentas, y la siembra sabe cuáles borrar al repetirse
import { DOMINIO_DEMO } from '../server/demo-dominio.js'
export { DOMINIO_DEMO }

// ---------------------------------------------------------------------------
// Azar con semilla (mulberry32)
// ---------------------------------------------------------------------------
function azar(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let rnd = azar(12)
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const elegir = (l) => l[Math.floor(rnd() * l.length)]
const prob = (p) => rnd() < p
const mezclar = (l) => {
  const c = [...l]
  for (let i = c.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    [c[i], c[k]] = [c[k], c[i]]
  }
  return c
}
const limitar = (n, a, b) => Math.max(a, Math.min(b, n))

// ---------------------------------------------------------------------------
// Fechas como texto 'YYYY-MM-DD' (en UTC, sin desfases de zona)
// ---------------------------------------------------------------------------
const aFecha = (d) => d.toISOString().slice(0, 10)
const deFecha = (s) => new Date(`${s}T12:00:00Z`)
const sumarDias = (s, n) => { const d = deFecha(s); d.setUTCDate(d.getUTCDate() + n); return aFecha(d) }
const diaSemana = (s) => deFecha(s).getUTCDay() // 0 = domingo
const diasEntre = (a, b) => Math.round((deFecha(b) - deFecha(a)) / 86400000)
const momento = (s, hora = '20:00') => `${s} ${hora}:00-03`

// Hoy en Tucumán (UTC-3)
export function hoyTucuman() {
  return aFecha(new Date(Date.now() - 3 * 3600000))
}

// ---------------------------------------------------------------------------
// Inserción por lotes: una sentencia por cada 400 filas, no una por fila (la
// base de la demo está en Neon y cada ida y vuelta cuesta)
// ---------------------------------------------------------------------------
async function insertar(query, tabla, filas) {
  if (!filas.length) return
  const cols = Object.keys(filas[0])
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400)
    const params = []
    const valores = lote.map((f) => `(${cols.map((c) => {
      let v = f[c]
      if (v !== null && v !== undefined && typeof v === 'object') v = JSON.stringify(v)
      params.push(v ?? null)
      return `$${params.length}`
    }).join(',')})`)
    await query(`insert into ${tabla} (${cols.join(',')}) values ${valores.join(',')}`, params)
  }
}

// ---------------------------------------------------------------------------
// Catálogos inventados
// ---------------------------------------------------------------------------
const NOMBRES = ['Mateo', 'Benjamín', 'Santiago', 'Joaquín', 'Thiago', 'Bautista', 'Felipe',
  'Lautaro', 'Valentino', 'Tomás', 'Juan Cruz', 'Ignacio', 'Facundo', 'Agustín', 'Bruno',
  'Lorenzo', 'Francisco', 'Nicolás', 'Simón', 'Benicio', 'Gael', 'Ramiro', 'Máximo', 'Lucas',
  'Julián', 'Pedro', 'Martín', 'Emilio', 'Dante', 'Ciro', 'Federico', 'Gonzalo', 'Manuel',
  'Juan Ignacio', 'Santino', 'Valentín', 'Isidro', 'León']
const APELLIDOS = ['García', 'Paz', 'Terán', 'Frías', 'Aráoz', 'Nougués', 'Zavalía', 'Ruiz',
  'Albornoz', 'Medina', 'Juárez', 'Díaz', 'Romano', 'Posse', 'Méndez', 'Robles', 'Sosa',
  'Herrera', 'Avellaneda', 'Colombres', 'Lobo', 'Silva', 'Toledo', 'Correa', 'Cainzo',
  'Bulacio', 'Chehín', 'Salas', 'Ibáñez', 'Gómez', 'Navarro', 'Vera', 'Padilla', 'Ledesma',
  'Moyano', 'Acosta', 'Saleme', 'Rojas', 'Valdez', 'Figueroa']
const NOMBRES_ADULTOS = ['Carolina', 'Marcelo', 'Florencia', 'Gustavo', 'Paula', 'Sebastián',
  'Valeria', 'Hernán', 'Soledad', 'Alejandro', 'Verónica', 'Fernando', 'Luciana', 'Javier',
  'Natalia', 'Rodrigo', 'Gabriela', 'Diego', 'Cecilia', 'Ricardo']

// Barrios y localidades del Gran Tucumán, con un centro aproximado y las
// formas en que una familia podría escribirlos
const LUGARES = [
  { nombre: 'Yerba Buena', lat: -26.8165, lng: -65.3162, textos: ['Yerba Buena', 'YB', 'Yerba Buena centro'] },
  { nombre: 'Barrio Norte', lat: -26.8170, lng: -65.2055, textos: ['Barrio Norte', 'B° Norte'] },
  { nombre: 'Centro', lat: -26.8305, lng: -65.2040, textos: ['Centro', 'San Miguel centro'] },
  { nombre: 'Barrio Sur', lat: -26.8460, lng: -65.2070, textos: ['Barrio Sur'] },
  { nombre: 'Las Lomitas', lat: -26.8050, lng: -65.3005, textos: ['Las Lomitas', 'Las Lomitas (YB)'] },
  { nombre: 'Marcos Paz', lat: -26.8000, lng: -65.2880, textos: ['Marcos Paz', 'Marcos Paz, Yerba Buena'] },
  { nombre: 'Tafí Viejo', lat: -26.7320, lng: -65.2590, textos: ['Tafí Viejo', 'Tafi Viejo'] },
  { nombre: 'Banda del Río Salí', lat: -26.8390, lng: -65.1690, textos: ['Banda del Río Salí', 'La Banda'] },
  { nombre: 'Alderetes', lat: -26.8170, lng: -65.1340, textos: ['Alderetes'] },
  { nombre: 'San Pablo', lat: -26.8720, lng: -65.3100, textos: ['San Pablo'] },
  { nombre: 'Lules', lat: -26.9250, lng: -65.3380, textos: ['Lules'] },
  { nombre: 'Parque 9 de Julio', lat: -26.8335, lng: -65.1900, textos: ['Parque 9 de Julio', 'Barrio Parque'] },
]
// Escritos que la app todavía no reconoce: van a "Sin ubicar"
const SIN_UBICAR = ['Las Talitas', 'Villa Carmela', 'El Manantial']

const RIVALES = ['Natación y Gimnasia', 'Los Tarcos', 'Universitario', 'Cardenales',
  'Huirapuca', 'Jockey Club', 'Lince', 'Tucumán Rugby', 'Corsarios', 'Old Lions']

const CLUB = 'Tucumán Lawn Tennis'

// Puestos con su tipo, para armar un plantel equilibrado
const FORWARDS = ['pilar', 'hooker', 'segunda', 'octavo']
const BACKS = ['medio_scrum', 'apertura', 'centro', 'wing', 'fullback']
// Camisetas de la formación de 13 (sin 6 ni 7)
const CAMISETAS_FWD = [1, 2, 3, 4, 5, 8]
const CAMISETAS_BACK = [9, 10, 11, 12, 13, 14, 15]
const PUESTO_DE_CAMISETA = {
  1: 'pilar', 2: 'hooker', 3: 'pilar', 4: 'segunda', 5: 'segunda', 8: 'octavo',
  9: 'medio_scrum', 10: 'apertura', 11: 'wing', 12: 'centro', 13: 'centro', 14: 'wing', 15: 'fullback',
}

const CRONICAS = [
  'Buen partido: se vio la salida desde el ruck que veníamos practicando. Falta comunicación en defensa.',
  'Arrancamos dormidos, en el segundo tiempo mejoró mucho el apoyo al portador.',
  'Muy buena actitud de todos. El rival era más grande y igual se tackleó bien.',
  'Partido parejo. Se notó el trabajo de pase, hay que seguir con la defensa en línea.',
  'Jugamos con mucha alegría. Los nuevos se integraron muy bien al equipo.',
  'Costó la obtención en el line. Buen trabajo de los backs con la pelota en movimiento.',
]
const SEGUIMIENTOS = {
  tecnica: ['Mejoró mucho el pase hacia la izquierda.', 'Tiene que bajar más en el tackle.',
    'Buena lectura para atacar el espacio.', 'Le cuesta recibir en movimiento, seguir trabajándolo.'],
  fisica: ['Llega cansado al final del entrenamiento.', 'Gran progreso en velocidad.',
    'Trabajar coordinación en los cambios de dirección.'],
  tactica: ['Entiende bien cuándo sumarse al ruck.', 'Se queda lejos del apoyo, hablarlo.'],
  actitudinal: ['Muy comprometido, siempre llega temprano.', 'Se frustra cuando pierde, acompañarlo.',
    'Excelente actitud con los más nuevos.'],
  social: ['Se lo ve más integrado al grupo.', 'Charlamos con la familia por un tema con un compañero.'],
}
const TEXTOS_GUSTO = ['Los viajes con el equipo', 'El encuentro en Jockey, la pasamos genial',
  'Jugar con mis amigos', 'Aprender a tacklear', 'El tercer tiempo', 'Los partidos', 'Todo',
  'Cuando ganamos contra Lince', 'Los entrenamientos con juegos', 'Estar con mis compañeros',
  'Que aprendí mucho de los entrenadores', 'La gira', 'Hacer tries']
const TEXTOS_CAMBIO = ['Que no griten tanto cuando nos equivocamos', 'Jugar más minutos en los partidos',
  'Nada, todo bien', 'Que los entrenamientos empiecen a horario', 'Más partidos',
  'Que haya más juegos en los entrenamientos', 'Que no se burlen de los más chicos',
  'Nada', 'Que avisen antes los horarios', 'Tener más tiempo de pase', 'Que la cancha tenga luz']
const TEXTOS_MENSAJE = ['Gracias por todo', 'Son los mejores entrenadores', 'Gracias por enseñarnos',
  'Que sigan así', 'Me gustaría que me expliquen más', 'Gracias por bancarnos siempre',
  'No me gustó que me griten en el partido', 'Gracias profe']

// ---------------------------------------------------------------------------
// Borrado de la demo anterior: todo lo inventado, conservando las cuentas
// reales (el dueño y los invitados, con sus contraseñas) y los ajustes
// ---------------------------------------------------------------------------
export async function borrarDemo(query) {
  for (const tabla of ['encuestas', 'viajes', 'eventos', 'procesos_evaluacion', 'jugadores',
    'lugares', 'aspectos_tecnicos', 'avisos_enviados', 'boletines_guardados']) {
    await query(`delete from ${tabla}`)
  }
  await query('delete from staff where email like $1', [`%@${DOMINIO_DEMO}`])
}

// ---------------------------------------------------------------------------
// La siembra
// ---------------------------------------------------------------------------
// invitados: [{ email, rol, nombre? }] — los entrenadores invitados a probar,
// que entran con su propio email y crean la contraseña en el primer ingreso.
export async function sembrarDemo(query, { hoy = hoyTucuman(), invitados = [] } = {}) {
  rnd = azar(12)
  await borrarDemo(query)

  // La temporada arranca el primer lunes de marzo
  const anio = Number(hoy.slice(5, 7)) >= 4 ? Number(hoy.slice(0, 4)) : Number(hoy.slice(0, 4)) - 1
  let inicio = `${anio}-03-01`
  while (diaSemana(inicio) !== 1) inicio = sumarDias(inicio, 1)
  const alta = sumarDias(inicio, -10)
  // Vacaciones de invierno: las dos semanas que siguen al segundo lunes de julio
  let invierno = `${anio}-07-08`
  while (diaSemana(invierno) !== 1) invierno = sumarDias(invierno, 1)
  const finInvierno = sumarDias(invierno, 13)
  const enInvierno = (f) => f >= invierno && f <= finInvierno

  // ------------------------------------------------------------- staff
  const hashInutil = bcrypt.hashSync(randomBytes(24).toString('hex'), 8)
  const staffDemo = [
    { email: `martin.robles@${DOMINIO_DEMO}`, nombre: 'Martín', apellido: 'Robles', rol: 'Cabeza de división' },
    { email: `diego.albornoz@${DOMINIO_DEMO}`, nombre: 'Diego', apellido: 'Albornoz', rol: 'Entrenador' },
    { email: `sofia.medina@${DOMINIO_DEMO}`, nombre: 'Sofía', apellido: 'Medina', rol: 'Entrenador' },
    { email: `pablo.teran@${DOMINIO_DEMO}`, nombre: 'Pablo', apellido: 'Terán', rol: 'Entrenador' },
    { email: `nicolas.ruiz@${DOMINIO_DEMO}`, nombre: 'Nicolás', apellido: 'Ruiz', rol: 'Preparador físico (PF)' },
    { email: `gonzalo.diaz@${DOMINIO_DEMO}`, nombre: 'Gonzalo', apellido: 'Díaz', rol: 'PF/entrenador' },
    { email: `carolina.juarez@${DOMINIO_DEMO}`, nombre: 'Carolina', apellido: 'Juárez', rol: 'Manager principal' },
    { email: `mariana.lopez@${DOMINIO_DEMO}`, nombre: 'Mariana', apellido: 'López', rol: 'Manager asistente' },
  ]
  await insertar(query, 'staff', staffDemo.map((s) => ({
    ...s, dni: String(entre(20000000, 35000000)), password_hash: hashInutil, activo: true,
    created_at: momento(alta),
  })))
  // El dueño ya viene del esquema; los invitados se suman con su rol sin
  // tocarles la contraseña si ya la crearon
  for (const inv of invitados) {
    await query(
      `insert into staff (email, nombre, rol) values ($1, $2, $3)
       on conflict (email) do update set rol = excluded.rol, activo = true`,
      [inv.email, inv.nombre || null, inv.rol])
  }
  const [cabeza, diego, sofia, pablo, pf, gonzalo] = staffDemo.map((s) => s.email)
  const entrenadores = [cabeza, diego, sofia, pablo, gonzalo, EMAIL_DUENIO]
  const cuerpoTecnico = [cabeza, diego, sofia, pablo, pf, gonzalo]

  // ------------------------------------------------------------- lugares
  const lugares = LUGARES.map((l) => ({ ...l, id: randomUUID() }))
  await insertar(query, 'lugares', lugares.map((l) => ({
    id: l.id, nombre: l.nombre, lat: l.lat, lng: l.lng, creado_por: cabeza,
  })))
  const alias = new Map()
  for (const l of lugares) for (const t of l.textos) for (const c of clavesDe(t)) alias.set(c, l.id)
  await insertar(query, 'lugares_alias', [...alias].map(([clave, lugar_id]) => ({ clave, lugar_id })))

  // ------------------------------------------------------------- jugadores
  // 36 que están hoy, más 2 dados de baja a mitad de año. Cada uno tiene una
  // "constancia" (probabilidad de venir) y un nivel, que mueven todo lo demás.
  const usados = new Set()
  const nombreNuevo = () => {
    for (;;) {
      const n = [elegir(NOMBRES), elegir(APELLIDOS)]
      if (!usados.has(n.join())) { usados.add(n.join()); return n }
    }
  }
  const jugadores = []
  for (let i = 0; i < 38; i++) {
    const [nombre, apellido] = nombreNuevo()
    const forward = i % 2 === 0
    const base = forward ? elegir(FORWARDS) : elegir(BACKS)
    const otros = mezclar(forward ? FORWARDS : BACKS).filter((x) => x !== base)
    const puestos = prob(0.45) ? [base, otros[0]] : [base]
    // Cumpleaños: nacidos en el año que cumplen 12, dos de ellos esta quincena
    let nacimiento = `${anio - 12}-${String(entre(1, 12)).padStart(2, '0')}-${String(entre(1, 28)).padStart(2, '0')}`
    if (i === 3) nacimiento = `${anio - 12}${sumarDias(hoy, 4).slice(4)}`
    if (i === 8) nacimiento = `${anio - 12}${sumarDias(hoy, 11).slice(4)}`
    // Dónde viven: los primeros tres, sin ubicar; el resto repartido
    let barrio, lugar_id = null
    if (i < 3) barrio = SIN_UBICAR[i]
    else {
      const l = lugares[i % lugares.length]
      barrio = elegir(l.textos)
      lugar_id = l.id
    }
    // Casi todos con la ficha médica al día; dos vencidas y uno sin cargar
    const vence = i === 9 ? null : i === 16 || i === 29 ? sumarDias(hoy, -entre(5, 40)) : sumarDias(hoy, entre(12, 300))
    jugadores.push({
      id: randomUUID(), nombre, apellido,
      fecha_nacimiento: nacimiento,
      dni: i % 13 === 5 ? null : `5${entre(4000000, 4999999)}`,
      posicion: forward ? 'Forward' : 'Back',
      puestos, puesto_principal: base,
      aptitudes: forward ? [] : mezclar(['conduccion', 'penetracion', 'definicion']).slice(0, entre(0, 2)),
      estado: 'activo',
      tutor_nombre: `${elegir(NOMBRES_ADULTOS)} ${apellido}`,
      tutor_telefono: `381 5${entre(100000, 999999)}`,
      telefono: prob(0.4) ? `381 6${entre(100000, 999999)}` : null,
      ficha_medica_vigente: !!vence && vence >= hoy,
      ficha_medica_vence: vence,
      observaciones: i % 9 === 4 ? 'Asma leve: trae el inhalador a los entrenamientos.' : i % 11 === 7 ? 'Alérgico a la penicilina.' : null,
      barrio, lugar_id,
      // Llegados más tarde: tres que se sumaron con la temporada empezada
      _alta: i === 35 ? sumarDias(inicio, 95) : i === 36 ? sumarDias(inicio, 150) : i === 37 ? sumarDias(inicio, 40) : alta,
      _baja: i === 33 ? sumarDias(inicio, 120) : i === 34 ? sumarDias(inicio, 170) : null,
      _constancia: i % 7 === 2 ? 0.55 + rnd() * 0.1 : 0.72 + rnd() * 0.26,
      _nivel: 2.3 + rnd() * 2.2,
      _forward: forward,
    })
  }
  // Uno que viene de lejos y no falta nunca (para la vista de distancias), y
  // dos que faltaron las últimas veces seguidas (para la tarjeta de faltas)
  const lejos = jugadores.find((j) => j.lugar_id === lugares.find((l) => l.nombre === 'Lules').id)
  if (lejos) lejos._constancia = 0.96
  const faltones = [jugadores[11], jugadores[21]]
  const dadosDeBaja = jugadores.filter((j) => j._baja)
  for (const j of dadosDeBaja) j.estado = 'inactivo'

  // Lesiones: una abierta (el chico queda "lesionado") y tres ya dadas de alta
  const lesionado = jugadores[6]
  const lesiones = [
    { jugador: lesionado, fecha: sumarDias(hoy, -10), descripcion: 'Esguince de tobillo derecho en el entrenamiento', retorno: sumarDias(hoy, 11), alta: null },
    { jugador: jugadores[14], fecha: sumarDias(inicio, 30), descripcion: 'Golpe en el hombro izquierdo, reposo deportivo', retorno: sumarDias(inicio, 44), alta: sumarDias(inicio, 42) },
    { jugador: jugadores[19], fecha: sumarDias(inicio, 110), descripcion: 'Fractura de muñeca (yeso 4 semanas)', retorno: sumarDias(inicio, 140), alta: sumarDias(inicio, 146) },
    { jugador: jugadores[27], fecha: sumarDias(hoy, -60), descripcion: 'Contractura en el isquiotibial', retorno: sumarDias(hoy, -50), alta: sumarDias(hoy, -48) },
  ]
  lesionado.estado = 'lesionado'
  const estaLesionado = (j, f) => lesiones.some((l) => l.jugador === j && f >= l.fecha && f < (l.alta || l.retorno))

  await insertar(query, 'jugadores', jugadores.map((j) => ({
    id: j.id, nombre: j.nombre, apellido: j.apellido, fecha_nacimiento: j.fecha_nacimiento,
    dni: j.dni, posicion: j.posicion, puestos: j.puestos, puesto_principal: j.puesto_principal,
    aptitudes: j.aptitudes, estado: j.estado, tutor_nombre: j.tutor_nombre,
    tutor_telefono: j.tutor_telefono, telefono: j.telefono,
    ficha_medica_vigente: j.ficha_medica_vigente, ficha_medica_vence: j.ficha_medica_vence,
    observaciones: j.observaciones, barrio: j.barrio, lugar_id: j.lugar_id,
    created_at: momento(j._alta, '10:00'), updated_at: momento(j._baja || j._alta, '10:00'),
  })))
  const historial = []
  for (const j of jugadores) {
    historial.push({ jugador_id: j.id, estado: 'activo', desde: momento(j._alta, '10:00'), cambiado_por: cabeza })
    if (j._baja) historial.push({ jugador_id: j.id, estado: 'inactivo', desde: momento(j._baja, '10:00'), cambiado_por: cabeza })
  }
  for (const l of lesiones) {
    historial.push({ jugador_id: l.jugador.id, estado: 'lesionado', desde: momento(l.fecha, '21:00'), cambiado_por: diego })
    if (l.alta) historial.push({ jugador_id: l.jugador.id, estado: 'activo', desde: momento(l.alta, '21:00'), cambiado_por: diego })
  }
  await insertar(query, 'jugadores_historial_estado', historial)
  await insertar(query, 'lesiones', lesiones.map((l) => ({
    jugador_id: l.jugador.id, fecha: l.fecha, descripcion: l.descripcion,
    fecha_retorno_estimada: l.retorno, recuperado: !!l.alta, recuperado_en: l.alta,
    created_at: momento(l.fecha, '21:30'),
  })))

  // Quiénes forman el plantel un día dado (los que ya estaban y no se fueron)
  const plantelDe = (f) => jugadores.filter((j) => j._alta <= f && (!j._baja || f < j._baja))

  // ------------------------------------------------------------- eventos
  const eventos = []
  const plantel = []
  const asistencias = []
  const asistenciasStaff = []
  const planes = []
  const trabajos = []
  const tests = []
  const entrenamientos = []
  const ultimasFechas = new Set()
  // Las dos últimas rutinas antes de hoy (donde faltan los "faltones")
  {
    let f = sumarDias(hoy, -1), n = 0
    while (n < 3) { if ([1, 3].includes(diaSemana(f))) { ultimasFechas.add(f); n++ } f = sumarDias(f, -1) }
  }
  const ultimaRutina = [...ultimasFechas].sort().at(-1)

  // Tests físicos: tres tomas en el año
  const tomasTests = [sumarDias(inicio, 44), sumarDias(inicio, 121), sumarDias(inicio, 213)].filter((f) => f < hoy)
  const tomaDe = (f) => tomasTests.findIndex((t) => f >= t && f < sumarDias(t, 7))
  const testsHechos = new Set()

  for (let f = inicio; f <= sumarDias(hoy, 9); f = sumarDias(f, 1)) {
    const ds = diaSemana(f)
    const rutina = ds === 1 || ds === 3
    // Algún viernes de doble turno
    const extra = ds === 5 && diasEntre(inicio, f) % 35 === 4
    if (!rutina && !extra) continue
    if (enInvierno(f)) continue
    const id = randomUUID()
    const futuro = f >= hoy
    // Unos pocos suspendidos por lluvia o feriado
    const suspendido = !futuro && rutina && (diasEntre(inicio, f) % 47 === 9 || f.slice(5) === '05-25' || f.slice(5) === '07-09')
    eventos.push({
      id, tipo: 'entrenamiento', fecha: f,
      hora: rutina ? '19:30' : '18:00', hora_fin: rutina ? '21:00' : '19:30',
      modalidad: rutina ? 'rutina' : 'extra', rival: null, lugar: CLUB,
      notas: extra ? 'Doble turno: trabajo de destrezas por puesto' : null,
      suspendido, motivo_suspension: suspendido ? (f.slice(5) === '05-25' || f.slice(5) === '07-09' ? 'feriado' : 'clima') : null,
      nota_suspension: suspendido ? (f.slice(5) === '05-25' || f.slice(5) === '07-09' ? 'Feriado nacional' : 'Cancha anegada por la lluvia') : null,
    })
    if (futuro || suspendido) continue
    entrenamientos.push({ id, fecha: f })
    for (const j of plantelDe(f)) {
      plantel.push({ evento_id: id, jugador_id: j.id })
      let viene = prob(j._constancia * (extra ? 0.75 : 1))
      if (estaLesionado(j, f)) viene = false
      if (faltones.includes(j) && ultimasFechas.has(f)) viene = false
      // Golpes del día: uno reciente queda para revisar en Jugadores
      let condicion = null, atendida = false
      if (viene && prob(0.008)) { condicion = 'golpeado'; atendida = true }
      if (f === ultimaRutina && j === jugadores[24]) { viene = true; condicion = 'lesionado'; atendida = false }
      asistencias.push({ evento_id: id, jugador_id: j.id, estado: viene ? 'presente' : 'ausente', condicion, lesion_atendida: atendida })
      // Tests en la semana de cada toma (cada chico una vez por toma)
      const toma = tomaDe(f)
      if (viene && toma >= 0 && !testsHechos.has(`${j.id}-${toma}`)) {
        testsHechos.add(`${j.id}-${toma}`)
        const nivel = j._nivel
        const mejora = toma * 0.04
        const valores = {
          salto_largo: Math.round((112 + nivel * 11 + toma * 6 + entre(-8, 8)) * (j._forward ? 0.95 : 1.03)),
          velocidad_20m: Number((4.95 - nivel * 0.16 - mejora * 2 + (rnd() - 0.5) * 0.25).toFixed(2)),
          resistencia: Math.round(26 + nivel * 4 + toma * 3 + entre(-4, 4)),
          peso: Number((36 + (j._forward ? 8 : 0) + toma * 1.3 + (rnd() - 0.5) * 8).toFixed(1)),
          talla: Math.round(143 + (j._forward ? 4 : 0) + toma * 2 + entre(-6, 6)),
        }
        for (const [test, valor] of Object.entries(valores)) {
          const sem = semaforoSugerido(test, valor, CORTES_POR_DEFECTO)
          tests.push({
            jugador_id: j.id, evento_id: id, fecha: f, test, valor,
            semaforo: sem, semaforo_auto: !!sem, autor_email: pf,
          })
        }
      }
    }
    for (const s of cuerpoTecnico) {
      asistenciasStaff.push({ evento_id: id, staff_email: s, estado: prob(0.86) ? 'presente' : 'ausente' })
    }
    // Plan técnico y planilla del PF de casi todos los días
    if (prob(0.88)) {
      const aspectos = {}
      for (const a of mezclar(CLAVES_FIJAS).slice(0, entre(2, 3))) aspectos[a] = { minutos: prob(0.5) ? elegir([15, 20, 25, 30]) : null }
      planes.push({ evento_id: id, aspectos, sin_planificacion: false, autor_email: elegir(entrenadores.slice(0, 5)), actualizado_en: momento(f, '21:15') })
    }
    if (prob(0.82)) {
      const variables = {}
      for (const v of mezclar(CLAVES_FISICAS).slice(0, entre(2, 3))) variables[v] = { minutos: elegir([8, 10, 12, 15]), intensidad: elegir(['baja', 'media', 'media', 'alta']) }
      trabajos.push({
        evento_id: id, variables, carga: elegir(['baja', 'media', 'media', 'alta']),
        observaciones: prob(0.15) ? 'Mucho calor, se cortó antes con hidratación.' : null,
        autor_email: prob(0.7) ? pf : gonzalo, actualizado_en: momento(f, '21:10'),
      })
    }
  }

  // ------------------------------------------------------------- partidos
  // Sábado por medio desde abril. Uno de ellos es el partido del encuentro.
  const bloques = []
  const bloqueJugadores = []
  const bloqueStaff = []
  const asistenciasPartido = []
  const capitanias = []
  const tiempos = []
  const tiempoJugadores = []
  const yaCapitanes = new Set()
  const tiemposJugados = new Map()
  let primerSabado = sumarDias(inicio, 26)
  while (diaSemana(primerSabado) !== 6) primerSabado = sumarDias(primerSabado, 1)
  const sabados = []
  for (let f = primerSabado; f <= sumarDias(hoy, 30); f = sumarDias(f, 14)) {
    if (!enInvierno(f)) sabados.push(f)
  }
  // De los que vienen quedan dos: el próximo partido y el encuentro siguiente
  while (sabados.filter((f) => f >= hoy).length > 2) sabados.pop()
  const sabadosPasados = sabados.filter((f) => f < hoy)
  const fechaEncuentroPasado = sabadosPasados.at(-2)
  const fechaProximo = sabados.find((f) => f >= hoy)
  const fechaEncuentroProximo = sabados.find((f) => f > fechaProximo)
  const partidoDe = {}
  let nRival = 0

  for (const f of sabados) {
    const id = randomUUID()
    partidoDe[f] = id
    const esEncuentro = f === fechaEncuentroPasado || f === fechaEncuentroProximo
    const local = !esEncuentro && sabados.indexOf(f) % 2 === 0
    const rivalA = RIVALES[nRival++ % RIVALES.length]
    const rivalB = RIVALES[nRival++ % RIVALES.length]
    const sede = esEncuentro ? (f === fechaEncuentroPasado ? 'Jockey Club' : 'Huirapuca') : local ? CLUB : rivalA
    eventos.push({
      id, tipo: 'partido', fecha: f, hora: '10:00', hora_fin: null, modalidad: null,
      rival: null, lugar: sede, notas: esEncuentro ? 'Encuentro de M12 con varios clubes' : null,
      suspendido: false, motivo_suspension: null, nota_suspension: null,
    })
    const futuro = f >= hoy
    const enPlantel = plantelDe(f).filter((j) => !estaLesionado(j, f))
    // Convocatoria de la semana ("va / no va")
    const van = []
    for (const j of plantelDe(f)) {
      if (estaLesionado(j, f)) continue
      // En el próximo partido la convocatoria está a medio marcar
      if (futuro && f === fechaProximo && prob(0.35)) continue
      if (futuro && f === fechaEncuentroProximo) continue
      const va = prob(j._constancia * 0.95)
      asistencias.push({ evento_id: id, jugador_id: j.id, estado: va ? 'presente' : 'ausente', condicion: null, lesion_atendida: false })
      if (va) van.push(j)
    }
    if (van.length || !futuro) for (const j of plantelDe(f)) plantel.push({ evento_id: id, jugador_id: j.id })

    // Bloques: los convocados repartidos parejo entre forwards y backs
    const fw = mezclar(van.filter((j) => j._forward))
    const bk = mezclar(van.filter((j) => !j._forward))
    const reparto = [[], []]
    fw.forEach((j, i) => reparto[i % 2].push(j))
    bk.forEach((j, i) => reparto[(i + 1) % 2].push(j))
    for (let b = 0; b < 2; b++) {
      const bid = randomUUID()
      const rival = b === 0 ? rivalA : rivalB
      bloques.push({
        id: bid, evento_id: id, numero: b + 1, nombre: `Bloque ${b + 1}`,
        rival: futuro && f === fechaEncuentroProximo ? null : rival,
        dificultad: futuro && f === fechaEncuentroProximo ? null : elegir(['bueno', 'regular', 'malo']),
        lugar: sede, hora_convocatoria: '09:15',
        valoracion: futuro ? null : entre(3, 5), cronica: futuro ? null : elegir(CRONICAS),
        cerrado_en: futuro ? null : momento(f, '13:00'), cerrado_por: futuro ? null : cabeza,
      })
      if (futuro) continue
      const staffBloque = b === 0 ? [cabeza, diego, gonzalo] : [sofia, pablo, pf]
      for (const s of staffBloque) bloqueStaff.push({ bloque_id: bid, staff_email: s, presente: prob(0.9) })
      const presentes = []
      for (const j of reparto[b]) {
        bloqueJugadores.push({ bloque_id: bid, jugador_id: j.id })
        const vino = prob(0.94)
        const golpe = vino && prob(0.03)
        asistenciasPartido.push({
          evento_id: id, jugador_id: j.id, estado: vino ? 'presente' : 'ausente',
          tarde: vino && prob(0.06), condicion: golpe ? 'golpeado' : null,
          condicion_desde: golpe ? entre(2, 4) : null, lesion_atendida: golpe,
        })
        if (vino) presentes.push(j)
      }
      // Capitán: alguien a quien todavía no le tocó
      const cap = presentes.find((j) => !yaCapitanes.has(j.id)) || presentes[0]
      if (cap) {
        yaCapitanes.add(cap.id)
        capitanias.push({ jugador_id: cap.id, fecha: f, bloque_id: bid })
      }
      // Cuatro tiempos, 13 en cancha, rotando a los que menos jugaron
      for (let t = 1; t <= 4; t++) {
        const tid = randomUUID()
        tiempos.push({ id: tid, bloque_id: bid, numero: t, cerrado_en: momento(f, `1${t}:00`), valoracion: prob(0.4) ? entre(3, 5) : null })
        const orden = [...presentes].sort((x, y) => (tiemposJugados.get(x.id) || 0) - (tiemposJugados.get(y.id) || 0) || rnd() - 0.5)
        const enCancha = orden.slice(0, 13)
        const libres = { fwd: [...CAMISETAS_FWD], back: [...CAMISETAS_BACK] }
        const sinCamiseta = []
        for (const j of enCancha) {
          const propia = j._forward ? libres.fwd : libres.back
          const preferida = propia.find((n) => j.puestos.includes(PUESTO_DE_CAMISETA[n]))
          const n = preferida ?? propia[0]
          if (n == null) { sinCamiseta.push(j); continue }
          propia.splice(propia.indexOf(n), 1)
          tiempoJugadores.push({ tiempo_id: tid, jugador_id: j.id, puesto: n, prestado: false })
          tiemposJugados.set(j.id, (tiemposJugados.get(j.id) || 0) + 1)
        }
        for (const j of sinCamiseta) {
          const n = libres.fwd.shift() ?? libres.back.shift()
          if (n == null) continue
          tiempoJugadores.push({ tiempo_id: tid, jugador_id: j.id, puesto: n, prestado: false })
          tiemposJugados.set(j.id, (tiemposJugados.get(j.id) || 0) + 1)
        }
      }
    }
  }

  await insertar(query, 'eventos', eventos)
  await insertar(query, 'evento_plantel', plantel)
  await insertar(query, 'asistencias', asistencias)
  await insertar(query, 'asistencias_staff', asistenciasStaff)
  await insertar(query, 'plan_tecnico', planes)
  await insertar(query, 'trabajo_fisico', trabajos)
  await insertar(query, 'tests_fisicos', tests)
  await insertar(query, 'bloques', bloques)
  await insertar(query, 'bloque_jugadores', bloqueJugadores)
  await insertar(query, 'bloque_staff', bloqueStaff)
  await insertar(query, 'asistencias_partido', asistenciasPartido)
  await insertar(query, 'capitanias', capitanias)
  await insertar(query, 'tiempos', tiempos)
  await insertar(query, 'tiempo_jugadores', tiempoJugadores)

  // ------------------------------------------------------------- seguimientos
  const seguimientos = []
  for (let i = 0; i < 26; i++) {
    const j = jugadores[entre(0, 32)]
    const area = elegir(Object.keys(SEGUIMIENTOS))
    const fecha = sumarDias(inicio, entre(10, diasEntre(inicio, hoy) - 1))
    seguimientos.push({
      jugador_id: j.id, fecha, area, valoracion: entre(2, 5), comentario: elegir(SEGUIMIENTOS[area]),
      autor_email: elegir(entrenadores.slice(0, 5)), created_at: momento(fecha, '21:30'),
    })
  }
  await insertar(query, 'seguimientos', seguimientos)

  // ------------------------------------------------------------- evaluaciones
  // Dos rondas cerradas (mayo, sin revisión; septiembre, con revisión cruzada)
  // y una abierta ahora, a medio cargar
  const variables = areasParaEdad(12).flatMap((a) => a.variables.map((v) => v.value))
  const notas = (j, ronda, ruido = 0.7) => Object.fromEntries(variables.map((v, k) => [
    v, limitar(Math.round(j._nivel + ronda * 0.25 + ((k * 7 + j.nombre.length) % 5 - 2) * 0.3 + (rnd() - 0.5) * 2 * ruido), 1, 5),
  ]))
  const revisar = (valores) => Object.fromEntries(Object.entries(valores).map(([k, n]) => [
    k, limitar(n + (prob(0.08) ? elegir([-2, 2]) : prob(0.35) ? elegir([-1, 1]) : 0), 1, 5),
  ]))
  const evaluaciones = []
  const procesos = []
  const evaluadores = [cabeza, diego, sofia, pablo, gonzalo]
  const rondas = [
    { fecha: sumarDias(inicio, 70), revision: false },
    { fecha: sumarDias(inicio, 190), revision: true },
  ].filter((r) => r.fecha < sumarDias(hoy, -20))
  rondas.forEach((r, n) => {
    const reparto = {}
    const activos = plantelDe(r.fecha)
    activos.forEach((j, k) => {
      const autor = evaluadores[k % evaluadores.length]
      const revisor = r.revision ? evaluadores[(k + 2) % evaluadores.length] : null
      const fecha = sumarDias(r.fecha, entre(0, 12))
      const valores = notas(j, n)
      ;(reparto[autor] ||= { evaluar: 0, revisar: 0 }).evaluar++
      if (revisor) (reparto[revisor] ||= { evaluar: 0, revisar: 0 }).revisar++
      evaluaciones.push({
        jugador_id: j.id, fecha, valores, comentario: prob(0.3) ? 'Viene bien, seguir trabajando el contacto.' : null,
        autor_email: autor, revisor_email: revisor, valores_revisor: revisor ? revisar(valores) : null,
        comentario_revisor: null, revisado_en: revisor ? momento(sumarDias(fecha, entre(1, 6))) : null,
        created_at: momento(fecha, '22:00'),
      })
    })
    procesos.push({
      id: randomUUID(), lanzado_en: momento(r.fecha, '09:00'), lanzado_por: cabeza, reparto,
      total: activos.length, cerrado_en: momento(sumarDias(r.fecha, 19)), cancelado_en: null,
    })
  })
  // El proceso abierto: 12 chicos, con algunos pendientes para el dueño
  const abierto = { id: randomUUID(), lanzado_en: momento(sumarDias(hoy, -12), '09:00'), lanzado_por: cabeza, reparto: {}, total: 12, cerrado_en: null, cancelado_en: null }
  const asignaciones = []
  const evaluadoresAhora = [EMAIL_DUENIO, diego, sofia, gonzalo]
  jugadores.filter((j) => !j._baja).slice(0, 12).forEach((j, k) => {
    const autor = evaluadoresAhora[k % 4]
    const revisor = evaluadoresAhora[(k + 1) % 4]
    ;(abierto.reparto[autor] ||= { evaluar: 0, revisar: 0 }).evaluar++
    ;(abierto.reparto[revisor] ||= { evaluar: 0, revisar: 0 }).revisar++
    const fecha = sumarDias(hoy, -entre(2, 10))
    if (k < 4) {
      // Falta evaluar
      asignaciones.push({ jugador_id: j.id, staff_email: autor, revisor_email: revisor, etapa: 'evaluar', evaluacion_id: null, asignado_por: cabeza, proceso_id: abierto.id })
    } else if (k < 7) {
      // Evaluado, falta la revisión
      const eid = randomUUID()
      evaluaciones.push({ id: eid, jugador_id: j.id, fecha, valores: notas(j, 2), comentario: null, autor_email: autor, revisor_email: null, valores_revisor: null, comentario_revisor: null, revisado_en: null, created_at: momento(fecha, '22:00') })
      asignaciones.push({ jugador_id: j.id, staff_email: autor, revisor_email: revisor, etapa: 'revisar', evaluacion_id: eid, asignado_por: cabeza, proceso_id: abierto.id })
    } else {
      const valores = notas(j, 2)
      evaluaciones.push({ id: randomUUID(), jugador_id: j.id, fecha, valores, comentario: null, autor_email: autor, revisor_email: revisor, valores_revisor: revisar(valores), comentario_revisor: null, revisado_en: momento(sumarDias(fecha, 1)), created_at: momento(fecha, '22:00') })
    }
  })
  procesos.push(abierto)
  await insertar(query, 'evaluaciones', evaluaciones.map((e) => ({ ...e, id: e.id || randomUUID() })))
  await insertar(query, 'procesos_evaluacion', procesos)
  await insertar(query, 'asignaciones_evaluacion', asignaciones)

  // ------------------------------------------------------------- viajes
  const viajes = []
  const viajeStaff = []
  const grupos = []
  const viajeJugadores = []
  const pagos = []
  // Los dos encuentros: el que ya se jugó (todo pagado) y el que viene
  for (const [f, nombre, club, precio] of [
    [fechaEncuentroPasado, 'Encuentro M12 en Jockey Club', 'Jockey Club', 6000],
    [fechaEncuentroProximo, 'Encuentro M12 en Huirapuca', 'Huirapuca', 8000],
  ]) {
    if (!f) continue
    const vid = randomUUID()
    viajes.push({
      id: vid, tipo: 'encuentro', nombre, destino: 'Gran Tucumán', club_anfitrion: club,
      fecha_salida: f, fecha_regreso: null, precio, cuotas: null, notas: 'Llevar camiseta alternativa y vianda.',
      hora: '10:00', evento_id: partidoDe[f], creado_por: `carolina.juarez@${DOMINIO_DEMO}`,
    })
    const futuro = f >= hoy
    const lista = futuro ? mezclar(plantelDe(f).filter((j) => !estaLesionado(j, f))).slice(0, 22) : null
    const convocados = futuro ? lista : asistencias.filter((a) => a.evento_id === partidoDe[f] && a.estado === 'presente').map((a) => jugadores.find((j) => j.id === a.jugador_id))
    for (const j of convocados) {
      viajeJugadores.push({ viaje_id: vid, jugador_id: j.id, grupo_id: null, autorizacion: false, dni_copia: false, dni_devuelto: false, observaciones: null })
      if (!futuro || prob(0.55)) {
        pagos.push({ viaje_id: vid, jugador_id: j.id, fecha: futuro ? sumarDias(hoy, -entre(0, 5)) : sumarDias(f, -entre(1, 6)), monto: precio, concepto: 'Inscripción', medio: elegir(['efectivo', 'transferencia']), registrado_por: `carolina.juarez@${DOMINIO_DEMO}` })
      }
      // El encuentro que viene: la lista ya los marca "va" en la convocatoria
      if (futuro) asistencias.push({ evento_id: partidoDe[f], jugador_id: j.id, estado: 'presente', condicion: null, lesion_atendida: false })
    }
    if (futuro && convocados.length) for (const j of plantelDe(f)) plantel.push({ evento_id: partidoDe[f], jugador_id: j.id })
  }
  // La gira de fin de año
  let salida = sumarDias(hoy, 20)
  while (diaSemana(salida) !== 5) salida = sumarDias(salida, 1)
  const gira = randomUUID()
  viajes.push({
    id: gira, tipo: 'gira', nombre: 'Gira de fin de año a Salta', destino: 'Salta',
    club_anfitrion: 'Los Cerros Rugby Club', fecha_salida: salida, fecha_regreso: sumarDias(salida, 2),
    precio: 180000, cuotas: 3, notas: 'Salida 6:00 desde el club. Micro con baño. Llevar ropa de abrigo.',
    hora: null, evento_id: null, creado_por: `carolina.juarez@${DOMINIO_DEMO}`,
  })
  for (const s of [cabeza, diego, sofia, `carolina.juarez@${DOMINIO_DEMO}`]) viajeStaff.push({ viaje_id: gira, staff_email: s })
  const viajan = mezclar(plantelDe(hoy)).slice(0, 26)
  for (let g = 0; g < 9; g++) {
    grupos.push({
      id: randomUUID(), viaje_id: gira, numero: g + 1,
      familia_nombre: `Familia ${elegir(APELLIDOS)}`, familia_contacto: `${elegir(NOMBRES_ADULTOS)} (mamá)`,
      familia_telefono: `387 4${entre(100000, 999999)}`,
      familia_direccion: g < 6 ? `Calle ${elegir(['Los Ceibos', 'Las Rosas', 'Belgrano', 'Mitre', 'Güemes'])} ${entre(100, 2500)}` : null,
      familia_notas: g === 2 ? 'Tienen dos perros grandes.' : g === 5 ? 'Queda a 10 cuadras del club.' : null,
    })
  }
  viajan.forEach((j, k) => {
    viajeJugadores.push({
      viaje_id: gira, jugador_id: j.id, grupo_id: k < 24 ? grupos[k % 9].id : null,
      autorizacion: prob(0.7), dni_copia: prob(0.6), dni_devuelto: false,
      observaciones: j.observaciones || (k % 8 === 3 ? 'No come carne de cerdo.' : null),
    })
    // Seña y cuotas: unos al día, otros atrasados
    const cuotas = k % 5 === 0 ? 0 : k % 3 === 0 ? 3 : entre(1, 2)
    for (let c = 0; c < cuotas; c++) {
      pagos.push({ viaje_id: gira, jugador_id: j.id, fecha: sumarDias(hoy, -50 + c * 20), monto: 60000, concepto: c === 0 ? 'Seña' : `Cuota ${c + 1}`, medio: elegir(['efectivo', 'transferencia', 'transferencia']), registrado_por: `mariana.lopez@${DOMINIO_DEMO}` })
    }
  })
  await insertar(query, 'viajes', viajes)
  await insertar(query, 'viaje_staff', viajeStaff)
  await insertar(query, 'viaje_grupos', grupos)
  await insertar(query, 'viaje_jugadores', viajeJugadores)
  await insertar(query, 'viaje_pagos', pagos)
  // El encuentro que viene: su lista ya está marcada "va" en la convocatoria
  // del partido, así que el plantel de ese día queda congelado
  if (fechaEncuentroProximo) {
    const pid = partidoDe[fechaEncuentroProximo]
    await insertar(query, 'asistencias', asistencias.filter((a) => a.evento_id === pid))
    await insertar(query, 'evento_plantel', plantel.filter((x) => x.evento_id === pid))
  }

  // ------------------------------------------------------------- encuestas
  // La de mitad de año, cerrada y con respuestas; la de fin de año, en borrador
  const preguntas = preguntasPorDefecto()
  const cierre = sumarDias(invierno, -3)
  const encuestaCerrada = randomUUID()
  await insertar(query, 'encuestas', [
    {
      id: encuestaCerrada, titulo: 'Encuesta de mitad de año', preguntas, estado: 'cerrada',
      cierra: cierre, creada_por: cabeza, created_at: momento(sumarDias(cierre, -20)),
      abierta_en: momento(sumarDias(cierre, -14)), cerrada_en: momento(cierre, '23:59'),
      pedido_ayuda: null, avisar_a: null,
    },
    {
      id: randomUUID(), titulo: 'Encuesta de fin de año', preguntas, estado: 'borrador',
      cierra: sumarDias(hoy, 20), creada_por: cabeza, created_at: momento(sumarDias(hoy, -2)),
      abierta_en: null, cerrada_en: null, pedido_ayuda: null, avisar_a: null,
    },
  ])
  const alCierre = plantelDe(cierre)
  const contestaron = new Set(mezclar(alCierre).slice(0, Math.round(alCierre.length * 0.75)).map((j) => j.id))
  await insertar(query, 'encuesta_links', alCierre.map((j) => ({
    token: randomBytes(16).toString('hex'), encuesta_id: encuestaCerrada, jugador_id: j.id,
    enviado: true, usado: contestaron.has(j.id),
  })))
  const frecuencia = (bueno) => (prob(bueno) ? elegir([4, 4, 3]) : elegir([2, 2, 1]))
  const respuestas = [...contestaron].map((_, k) => {
    const r = {}
    for (const p of preguntas) {
      if (p.tipo === 'frecuencia') r[p.clave] = frecuencia(p.clave === 'sin_gritos' ? 0.62 : p.clave === 'juego_suficiente' ? 0.68 : 0.86)
      else if (p.tipo === 'si_nose_no') r[p.clave] = prob(0.82) ? 'si' : elegir(['nose', 'nose', 'no'])
      else if (p.tipo === 'si_no') r[p.clave] = p.negativa ? (prob(0.12) ? 'si' : 'no') : (prob(0.9) ? 'si' : 'no')
      else if (p.tipo === 'nota') r[p.clave] = limitar(entre(6, 10) + (prob(0.1) ? -2 : 0), 1, 10)
      else if (p.tipo === 'opciones') r[p.clave] = elegir([0, 1, 1, 2, 2])
      else if (p.tipo === 'abierta') {
        const pool = p.clave === 'mas_gusto' ? TEXTOS_GUSTO : p.clave === 'cambiaria' ? TEXTOS_CAMBIO : TEXTOS_MENSAJE
        if (prob(p.clave === 'mensaje' ? 0.55 : 0.8)) r[p.clave] = pool[(k * 3 + p.clave.length) % pool.length]
      }
    }
    return { encuesta_id: encuestaCerrada, respuestas: r }
  })
  await insertar(query, 'encuesta_respuestas', mezclar(respuestas))
  const pedidoDe = [...contestaron].slice(0, 2)
  await insertar(query, 'encuesta_pedidos', pedidoDe.map((jid, k) => ({
    encuesta_id: encuestaCerrada, jugador_id: jid, atendido: k === 0,
    atendido_por: k === 0 ? cabeza : null, created_at: momento(sumarDias(cierre, -5)),
  })))

  // ------------------------------------------------------------- marca
  await query(
    `insert into ajustes (clave, valor) values ('base_demo', $1)
     on conflict (clave) do update set valor = excluded.valor`, [hoy])

  return {
    jugadores: jugadores.length,
    staff: staffDemo.length,
    invitados: invitados.length,
    eventos: eventos.length,
    asistencias: asistencias.length,
    tests: tests.length,
    evaluaciones: evaluaciones.length,
    viajes: viajes.length,
  }
}

// Lee los invitados de DEMO_INVITADOS: "ana@x.com:Entrenador, juan@y.com:Manager principal".
// Sin rol, entran como Entrenador.
export function leerInvitados(texto = '') {
  return String(texto).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const [email, ...resto] = s.split(':')
    const rol = resto.join(':').trim() || 'Entrenador'
    if (!ROLES.includes(rol)) throw new Error(`Rol desconocido para ${email}: "${rol}". Los roles válidos son: ${ROLES.join(', ')}`)
    const limpio = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio)) throw new Error(`Email inválido: "${email}"`)
    return { email: limpio, rol }
  })
}
