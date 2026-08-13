import { query } from './db.js'
import { autenticar, crearToken, hashClave, compararClave } from './auth.js'

const COLS_JUGADOR = `id, nombre, apellido, fecha_nacimiento::text as fecha_nacimiento,
  dni, posicion, puestos, puesto_principal, aptitudes, estado, tutor_nombre, tutor_telefono, ficha_medica_vigente,
  ficha_medica_vence::text as ficha_medica_vence, observaciones`

const APTITUDES = ['conduccion', 'penetracion', 'definicion']

// Números de camiseta válidos en la formación de 13 (sin 6 ni 7)
const PUESTOS_VALIDOS = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15]

// Puestos específicos que puede tener un jugador, y su tipo
const TIPO_PUESTO = {
  pilar: 'forward', hooker: 'forward', segunda: 'forward', octavo: 'forward',
  medio_scrum: 'back', apertura: 'back', centro: 'back', wing: 'back', fullback: 'back',
}

// La posición genérica se deriva de los puestos cargados
function posicionDePuestos(puestos) {
  const tipos = new Set(puestos.map((k) => TIPO_PUESTO[k]))
  if (tipos.size === 2) return 'Mixto'
  if (tipos.has('forward')) return 'Forward'
  if (tipos.has('back')) return 'Back'
  return null
}

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
  cerrado_en::text as cerrado_en, cerrado_por,
  suspendido, motivo_suspension, nota_suspension`

const MOTIVOS_SUSPENSION = ['clima', 'feriado', 'otro']

// Qué tan difícil se espera que sea el rival del bloque
const DIFICULTADES = ['bueno', 'regular', 'malo']

// Bloques por partido: lo normal son 2, pero puede haber más (tope del check
// de la tabla bloques)
const MAX_BLOQUES = 6

// Quiénes evalúan: entrenadores. Quedan afuera managers y preparadores
// físicos que no entrenan (los roles salen de ROLES_STAFF en src/helpers.js).
const ROLES_EVALUADORES = ['Cabeza de división', 'Entrenador', 'PF/entrenador']

// Acciones reservadas: borrar evaluaciones. Las puede hacer la cabeza de
// división y el dueño del repositorio (el email sembrado en db/schema.sql),
// que conserva el permiso aunque cambie de rol o no tenga ninguno.
const EMAIL_DUENIO = 'benitoric@gmail.com'
function puedeAdministrar(yo) {
  return yo.email === EMAIL_DUENIO || yo.rol === 'Cabeza de división'
}

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

// ---------- sugerencia de armado de bloques ----------
// Reparte a los convocados en los dos bloques buscando: fuerza pareja según la
// última evaluación (con un sesgo a favor del bloque que enfrenta al rival más
// difícil), misma cantidad de forwards y de backs (los mixtos son comodines) y
// misma cantidad de conductores, penetradores y definidores.

// Sesgo de fuerza por escalón de diferencia de dificultad entre rivales
const SESGO_POR_ESCALON = 0.3
const ESCALA_DIFICULTAD = { malo: 0, regular: 1, bueno: 2 }

function tipoJugador(j) {
  const tipos = new Set((j.puestos || []).map((k) => TIPO_PUESTO[k]).filter(Boolean))
  if (tipos.size === 1) return tipos.has('forward') ? 'fw' : 'back'
  if (tipos.size === 2) return 'mx'
  if (j.posicion === 'Forward') return 'fw'
  if (j.posicion === 'Back') return 'back'
  return 'mx'
}

// El puesto donde de verdad juega: con uno solo cargado es ese; con varios,
// el marcado como principal (null si todavía no se eligió).
function principalDe(j) {
  const propios = j.puestos || []
  if (propios.length === 1) return propios[0]
  return propios.includes(j.puesto_principal) ? j.puesto_principal : null
}

// ¿Tiene cargado ese puesto específico? (sin puestos cargados no opina)
function esEspecialista(j, clave) {
  return (j.puestos || []).includes(clave)
}

// Penalidad de un reparto: cuanto más baja, mejor. sesgo = cuánto más fuerte
// (en promedio de calificación) debería quedar el bloque B respecto del A.
function penalidadReparto(jugadores, calif, A, B, sesgo) {
  const a = jugadores.filter((j) => A.has(j.id))
  const b = jugadores.filter((j) => B.has(j.id))
  const media = (l) => (l.length ? l.reduce((acc, j) => acc + calif[j.id], 0) / l.length : 0)
  let p = 3 * Math.abs(a.length - b.length)
  // Misma cantidad de jugadores de cada puesto en los dos bloques, contando a
  // cada uno por su puesto principal (con el que de verdad juega). Los que no
  // tienen puestos cargados se agrupan por su posición genérica vieja.
  const grupo = (j) => principalDe(j) || `generico:${tipoJugador(j)}`
  const claves = new Set([...a, ...b].map(grupo))
  for (const clave of claves) {
    const cuantos = (l) => l.filter((j) => grupo(j) === clave).length
    p += 2 * Math.abs(cuantos(a) - cuantos(b))
  }
  p += 4 * Math.abs((media(b) - media(a)) - sesgo)
  for (const apt of APTITUDES) {
    const con = (l) => l.filter((j) => (j.aptitudes || []).includes(apt)).length
    p += Math.abs(con(a) - con(b))
  }
  return p
}

function sugerirReparto(jugadores, calif, sesgo) {
  const A = new Set()
  const B = new Set()
  // Reparto inicial en serpentina (A B B A…) dentro de cada puesto principal,
  // de mejor a peor: cada puesto arranca ya repartido en partes iguales
  const grupo = (j) => principalDe(j) || `generico:${tipoJugador(j)}`
  for (const clave of new Set(jugadores.map(grupo))) {
    jugadores
      .filter((j) => grupo(j) === clave)
      .sort((x, y) => calif[y.id] - calif[x.id])
      .forEach((j, i) => (i % 4 === 1 || i % 4 === 2 ? B : A).add(j.id))
  }
  // Refinamiento: intercambios y movimientos simples mientras mejoren
  let mejorP = penalidadReparto(jugadores, calif, A, B, sesgo)
  for (let pasada = 0; pasada < 20; pasada++) {
    let mejoro = false
    const deA = jugadores.filter((j) => A.has(j.id))
    const deB = jugadores.filter((j) => B.has(j.id))
    const movimientos = []
    for (const x of deA) movimientos.push([x, null])
    for (const y of deB) movimientos.push([null, y])
    for (const x of deA) for (const y of deB) movimientos.push([x, y])
    for (const [x, y] of movimientos) {
      // las listas se arman al inicio de la pasada: un movimiento aceptado
      // puede dejar obsoletos a los siguientes
      if (x && !A.has(x.id)) continue
      if (y && !B.has(y.id)) continue
      if (x) { A.delete(x.id); B.add(x.id) }
      if (y) { B.delete(y.id); A.add(y.id) }
      const p = penalidadReparto(jugadores, calif, A, B, sesgo)
      if (p < mejorP - 1e-9) {
        mejorP = p
        mejoro = true
      } else {
        if (x) { B.delete(x.id); A.add(x.id) }
        if (y) { A.delete(y.id); B.add(y.id) }
      }
    }
    if (!mejoro) break
  }
  return { A, B }
}

// ---------- sugerencia de equipos por tiempo ----------
// Para cada tiempo pendiente elige quiénes juegan (repartiendo los tiempos lo
// más parejo posible, con prioridad para los de mejor asistencia a
// entrenamientos), quiénes se prestan al rival (rotando: no repetir siempre a
// los mismos) y qué puesto ocupa cada uno (forwards a 1-8, backs a 9-15, los
// mixtos donde falte; el 9 y el 10 para conductores; se intenta mantener el
// puesto que cada uno ya venía jugando).
function sugerirEquipos({ jugadores, tiempos, enCancha, desde, prestamos, asistencia, prestamosAnio }) {
  const jugados = {}
  const prestadosHoy = {}
  for (const j of jugadores) { jugados[j.id] = 0; prestadosHoy[j.id] = 0 }
  const ultimoPuesto = {}
  const previos = tiempos.filter((t) => t.numero < desde)
  for (const t of previos) {
    for (const [jid, e] of Object.entries(enCancha[t.id] || {})) {
      if (!(jid in jugados)) continue
      jugados[jid]++
      if (e.prestado) prestadosHoy[jid]++
      else if (e.puesto) ultimoPuesto[jid] = e.puesto
    }
  }
  let prestadosAnterior = new Set(Object.entries(enCancha[previos.at(-1)?.id] || {})
    .filter(([, e]) => e.prestado).map(([jid]) => jid))
  const esConductor = (j) => (j.aptitudes || []).includes('conduccion')
  const resultado = {}
  // Se sugiere UN tiempo por vez: lo anterior ya está jugado y no se toca,
  // y lo que venga después se decide en su momento, con la cancha a la vista
  for (const t of tiempos.filter((x) => x.numero === desde)) {
    // Juegan (en cancha o prestados) los que menos tiempos llevan; a igualdad,
    // los de mejor % de asistencia a entrenamientos. Llegar tarde al partido
    // quita prioridad (pesa más que la asistencia, menos que un tiempo).
    const puntaje = (j) => jugados[j.id] * 1000 + (j.tarde ? 500 : 0) - (asistencia[j.id] || 0)
    const orden = [...jugadores].sort((a, b) => puntaje(a) - puntaje(b))
    const corte = Math.min(13 + prestamos, jugadores.length)
    let juegan = orden.slice(0, corte)
    let banco = orden.slice(corte)
    // La rotación pareja no puede dejar la cancha sin pareja de medios: si
    // quedan menos de 2 conductores jugando, entra uno del banco por el no
    // conductor que más tiempos lleva
    while (juegan.filter(esConductor).length < 2) {
      const entra = banco.find(esConductor)
      const sale = [...juegan].reverse().find((j) => !esConductor(j))
      if (!entra || !sale) break
      juegan = juegan.filter((j) => j !== sale).concat(entra)
      banco = banco.filter((j) => j !== entra).concat(sale)
    }
    // De los que juegan, se prestan los que vienen rotando menos préstamos
    // (hoy y en el año) y no fueron prestados el tiempo anterior, cuidando
    // que en cancha queden al menos 2 conductores
    const ordenPrestar = [...juegan].sort((a, b) =>
      (prestadosAnterior.has(a.id) - prestadosAnterior.has(b.id)) ||
      (prestadosHoy[a.id] - prestadosHoy[b.id]) ||
      ((prestamosAnio[a.id] || 0) - (prestamosAnio[b.id] || 0)) ||
      (jugados[b.id] - jugados[a.id]))
    const prestar = new Set()
    let condQuedan = juegan.filter(esConductor).length
    for (const j of ordenPrestar) {
      if (prestar.size >= prestamos) break
      if (esConductor(j)) {
        if (condQuedan <= 2) continue
        condQuedan--
      }
      prestar.add(j.id)
    }
    for (const j of ordenPrestar) {
      if (prestar.size >= prestamos) break
      prestar.add(j.id)
    }
    const enJuego = juegan.filter((j) => !prestar.has(j.id))
    // Puestos
    const porPuesto = {}
    const usados = new Set()
    const poner = (num, j) => { porPuesto[num] = j.id; usados.add(j.id) }
    // 1) la pareja de medios primero, para que la estabilidad de los demás
    // puestos no se lleve a los conductores: mantiene al que ya venía de 9
    // o 10 y completa priorizando al especialista del puesto con conducción
    for (const num of [9, 10]) {
      const previo = enJuego.find((j) => ultimoPuesto[j.id] === num)
      if (previo && !usados.has(previo.id)) poner(num, previo)
    }
    for (const num of [9, 10]) {
      if (porPuesto[num]) continue
      const clave = PUESTOS_FORMACION.find((x) => x.num === num).clave
      const libres = enJuego.filter((j) => !usados.has(j.id))
      const cand =
        libres.find((j) => esEspecialista(j, clave) && esConductor(j)) ||
        libres.find((j) => esConductor(j) && tipoJugador(j) !== 'fw') ||
        libres.find(esConductor) ||
        libres.find((j) => esEspecialista(j, clave))
      if (cand) poner(num, cand)
    }
    // 2) los demás mantienen el puesto que ya venían jugando
    for (const j of enJuego) {
      const p = ultimoPuesto[j.id]
      if (p && p !== 9 && p !== 10 && !porPuesto[p] && !usados.has(j.id)) poner(p, j)
    }
    // 3) cada puesto para su especialista; si no hay, alguien del mismo tipo
    // (forward/back), después los mixtos o sin datos, y al final entra
    // cualquiera antes que dejar huecos. Los puestos con menos especialistas
    // libres se resuelven primero, para que no se los "roben".
    const pendientes = PUESTOS_FORMACION
      .filter((f) => !porPuesto[f.num])
      .sort((x, y) => {
        const libres = enJuego.filter((j) => !usados.has(j.id))
        const esp = (f) => libres.filter((j) => esEspecialista(j, f.clave)).length
        return esp(x) - esp(y)
      })
    for (const f of pendientes) {
      if (porPuesto[f.num]) continue
      const libres = enJuego.filter((j) => !usados.has(j.id))
      const cand =
        libres.find((j) => esEspecialista(j, f.clave)) ||
        libres.find((j) => tipoJugador(j) === (f.tipo === 'forward' ? 'fw' : 'back')) ||
        libres.find((j) => tipoJugador(j) === 'mx') ||
        libres[0]
      if (cand) poner(f.num, cand)
    }
    // 4) depuración: nada forzado si hay cómo evitarlo. Un puesto está
    // "forzado" cuando su ocupante no lo tiene entre sus puestos (los
    // jugadores sin puestos cargados solo cuentan como forzados si ni el
    // tipo coincide). Se intenta arreglar cada uno, primero permutando
    // puestos entre los que ya están en cancha, y si no, trayendo del banco
    // a un especialista igual de merecedor (mismos tiempos jugados y sin
    // peor marca de tardanza) a cambio del forzado.
    const aptoEn = (j, f) => {
      if (esEspecialista(j, f.clave)) return true
      if (!(j.puestos || []).length) {
        const tj = tipoJugador(j)
        return tj === 'mx' || tj === (f.tipo === 'forward' ? 'fw' : 'back')
      }
      return false
    }
    const nivel = (j) => jugados[j.id] * 2 + (j.tarde ? 1 : 0)
    // el cambio en la pareja de medios nunca puede dejar el puesto sin conductor
    const okMedios = (f, sale, entra) =>
      !f.conductor || esConductor(entra) || !esConductor(sale)
    // banco ya existe (los que quedaron fuera de la selección de este tiempo)
    const jugadorEn = (num) => enJuego.find((j) => j.id === porPuesto[num])
    for (let vuelta = 0; vuelta < 20; vuelta++) {
      let cambio = false
      for (const f of PUESTOS_FORMACION) {
        const oc = jugadorEn(f.num)
        if (!oc || aptoEn(oc, f)) continue
        // a) permutar con otro puesto en cancha si baja lo forzado
        let resuelto = false
        for (const f2 of PUESTOS_FORMACION) {
          if (f2.num === f.num) continue
          const oc2 = jugadorEn(f2.num)
          if (!oc2 || !aptoEn(oc2, f)) continue
          if (!okMedios(f, oc, oc2) || !okMedios(f2, oc2, oc)) continue
          const antes = 1 + (aptoEn(oc2, f2) ? 0 : 1)
          const despues = (aptoEn(oc, f2) ? 0 : 1)
          if (despues < antes) {
            porPuesto[f.num] = oc2.id
            porPuesto[f2.num] = oc.id
            cambio = resuelto = true
            break
          }
        }
        if (resuelto) continue
        // b) entra un especialista del banco por el forzado
        const idx = banco.findIndex((b) =>
          esEspecialista(b, f.clave) && nivel(b) <= nivel(oc) && okMedios(f, oc, b))
        if (idx >= 0) {
          const entra = banco[idx]
          banco[idx] = oc
          porPuesto[f.num] = entra.id
          for (const lista of [juegan, enJuego]) {
            const i = lista.indexOf(oc)
            if (i >= 0) lista[i] = entra
          }
          cambio = true
        }
      }
      if (!cambio) break
    }
    resultado[t.id] = {
      equipo: [
        ...enJuego.map((j) => {
          const num = Object.keys(porPuesto).find((n) => porPuesto[n] === j.id)
          return { jugador_id: j.id, puesto: num ? Number(num) : null, prestado: false }
        }),
        ...[...prestar].map((jid) => ({ jugador_id: jid, puesto: null, prestado: true })),
      ],
    }
    for (const j of juegan) jugados[j.id]++
    for (const jid of prestar) prestadosHoy[jid]++
    for (const [num, jid] of Object.entries(porPuesto)) ultimoPuesto[jid] = Number(num)
    prestadosAnterior = prestar
  }
  return resultado
}

// La formación de 13: 6 forwards y 7 backs (los números 6 y 7 no existen)
const PUESTOS_FORMACION = [
  { num: 1, tipo: 'forward', clave: 'pilar' }, { num: 2, tipo: 'forward', clave: 'hooker' },
  { num: 3, tipo: 'forward', clave: 'pilar' }, { num: 4, tipo: 'forward', clave: 'segunda' },
  { num: 5, tipo: 'forward', clave: 'segunda' }, { num: 8, tipo: 'forward', clave: 'octavo' },
  { num: 9, tipo: 'back', clave: 'medio_scrum' }, { num: 10, tipo: 'back', clave: 'apertura' },
  { num: 11, tipo: 'back', clave: 'wing' }, { num: 12, tipo: 'back', clave: 'centro' },
  { num: 13, tipo: 'back', clave: 'centro' }, { num: 14, tipo: 'back', clave: 'wing' },
  { num: 15, tipo: 'back', clave: 'fullback' },
]

// Promedio simple de un jsonb {variable: 1..5}
function promedioValores(valores) {
  const vs = Object.values(valores || {}).map(Number).filter((n) => n > 0)
  return vs.length ? vs.reduce((s, n) => s + n, 0) / vs.length : null
}

// ---------- cierre de tiempos y bloques ----------
// Un bloque cerrado queda congelado: el servidor rechaza cualquier cambio
// sobre su asistencia, sus equipos y sus datos hasta que se lo reabra.

async function exigirBloqueAbierto(bloqueId) {
  const [bl] = await query('select cerrado_en from bloques where id = $1', [bloqueId])
  if (!bl) throw { codigo: 404, error: 'no_existe' }
  if (bl.cerrado_en) throw { codigo: 409, error: 'bloque_cerrado' }
}

async function exigirTiempoAbierto(tiempoId) {
  const [t] = await query(
    `select t.cerrado_en as tc, bl.cerrado_en as bc
     from tiempos t join bloques bl on bl.id = t.bloque_id where t.id = $1`, [tiempoId])
  if (!t) throw { codigo: 404, error: 'no_existe' }
  if (t.bc) throw { codigo: 409, error: 'bloque_cerrado' }
  if (t.tc) throw { codigo: 409, error: 'tiempo_cerrado' }
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

  if (p[0] === 'me') {
    return { email: yo.email, nombre: yo.nombre, rol: yo.rol, admin: puedeAdministrar(yo) }
  }

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
        `insert into jugadores (nombre, apellido, fecha_nacimiento, dni, posicion, puestos,
           puesto_principal, aptitudes, estado, tutor_nombre, tutor_telefono,
           ficha_medica_vigente, ficha_medica_vence, observaciones)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13,$14) returning ${COLS_JUGADOR}`, d)
      return filas[0]
    }
    if (metodo === 'PUT' && p[1]) {
      const d = datosJugador(b)
      const filas = await query(
        `update jugadores set nombre=$1, apellido=$2, fecha_nacimiento=$3, dni=$4,
           posicion=$5, puestos=$6::jsonb, puesto_principal=$7, aptitudes=$8::jsonb,
           estado=$9, tutor_nombre=$10, tutor_telefono=$11,
           ficha_medica_vigente=$12, ficha_medica_vence=$13, observaciones=$14, updated_at=now()
         where id=$15 returning ${COLS_JUGADOR}`, [...d, p[1]])
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
      // Rastro de las confirmaciones incumplidas: avisó que iba (asistencias,
      // marcado en la semana) y el día del partido no apareció (asistencias_partido)
      const [faltas] = await query(
        `select count(*)::int as total
         from asistencias a
         join eventos e on e.id = a.evento_id
         left join asistencias_partido ap on ap.evento_id = e.id and ap.jugador_id = a.jugador_id
         where a.jugador_id = $1 and a.estado = 'presente' and e.tipo = 'partido'
           and e.fecha <= current_date
           and coalesce(ap.estado, 'ausente') = 'ausente'
           and exists (select 1 from asistencias_partido x where x.evento_id = e.id)
           and ${eventoVigente('e')}`, [p[1]])
      const pct = (presentes, totales) =>
        totales ? Math.round((100 * presentes) / totales) : null
      return {
        jugador, seguimientos, lesiones, evaluaciones, documentos,
        stats: {
          entrenamientos: pct(pres.ent, tot.ent),
          partidos: pct(pres.par, tot.par),
          tiempos: total,
          faltas_avisadas: faltas.total,
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
      if (!puedeAdministrar(yo)) throw { codigo: 403, error: 'solo_cabeza' }
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
        `select j.id, j.nombre, j.apellido, count(tj.jugador_id)::int as tiempos,
           count(tj.jugador_id) filter (where tj.prestado)::int as prestados
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
    // Lesionados durante un partido que todavía no tienen la lesión cargada
    // en su ficha: alimentan el recordatorio de seguimiento en Jugadores.
    if (metodo === 'GET' && p[1] === 'lesiones-pendientes') {
      return query(
        `select j.id as jugador_id, j.nombre, j.apellido,
           e.fecha::text as fecha, e.id as evento_id,
           (select string_agg(bl.rival, ' / ') from bloques bl
            where bl.evento_id = e.id and bl.rival is not null) as rival
         from asistencias_partido ap
         join jugadores j on j.id = ap.jugador_id
         join eventos e on e.id = ap.evento_id
         where ap.condicion = 'lesionado' and j.estado <> 'inactivo'
           and not exists (
             select 1 from lesiones l
             where l.jugador_id = ap.jugador_id and l.fecha >= e.fecha)
         order by e.fecha desc, j.apellido, j.nombre`)
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
      // Un partido nace con sus bloques (lo habitual son 2, pueden ser más),
      // cada uno con su rival, lugar y hora de convocatoria. Se numeran en el
      // orden en que vienen.
      if (b.tipo === 'partido') {
        const datos = Array.isArray(b.bloques) && b.bloques.length
          ? b.bloques
          : [{}, {}]
        if (datos.length > MAX_BLOQUES) throw { codigo: 400, error: 'demasiados_bloques' }
        evento.bloques = []
        for (let numero = 1; numero <= datos.length; numero++) {
          const d = datos[numero - 1] || {}
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
    if (p[2] === 'asistencias-partido' && p[1]) {
      if (metodo === 'GET') {
        return query(
          'select jugador_id, estado, tarde, condicion from asistencias_partido where evento_id = $1', [p[1]])
      }
      if (metodo === 'PUT') {
        // b.marcas: [{jugador_id, estado|null, condicion?}] — estado null borra
        // la marca; condicion solo se toca si viene en el objeto. Las marcas
        // de jugadores cuyo bloque ya se cerró se rechazan.
        for (const m of b.marcas || []) {
          const [cerrado] = await query(
            `select 1 from bloques bl join bloque_jugadores bj on bj.bloque_id = bl.id
             where bl.evento_id = $1 and bj.jugador_id = $2 and bl.cerrado_en is not null
             limit 1`, [p[1], m.jugador_id])
          if (cerrado) throw { codigo: 409, error: 'bloque_cerrado' }
          if (m.estado === null) {
            await query('delete from asistencias_partido where evento_id = $1 and jugador_id = $2',
              [p[1], m.jugador_id])
            continue
          }
          if (!['presente', 'ausente'].includes(m.estado)) {
            throw { codigo: 400, error: 'estado_invalido' }
          }
          // llegó tarde: solo tiene sentido junto con presente
          const tarde = m.estado === 'presente' && !!m.tarde
          if (!('condicion' in m)) {
            await query(
              `insert into asistencias_partido (evento_id, jugador_id, estado, tarde)
               values ($1,$2,$3,$4)
               on conflict (evento_id, jugador_id)
               do update set estado = excluded.estado, tarde = excluded.tarde`,
              [p[1], m.jugador_id, m.estado, tarde])
            continue
          }
          const cond = m.condicion || null
          if (cond && !['golpeado', 'lesionado'].includes(cond)) {
            throw { codigo: 400, error: 'condicion_invalida' }
          }
          await query(
            `insert into asistencias_partido (evento_id, jugador_id, estado, condicion)
             values ($1,$2,$3,$4)
             on conflict (evento_id, jugador_id)
             do update set estado = excluded.estado, condicion = excluded.condicion`,
            [p[1], m.jugador_id, m.estado, cond])
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
      // Partidos viejos, creados antes de que existieran los bloques: se les
      // arman los 2 de siempre. A los que ya tienen no se les toca la cantidad.
      const [{ n }] = await query(
        'select count(*)::int as n from bloques where evento_id = $1', [eventoId])
      if (!n) {
        await query(
          `insert into bloques (evento_id, numero, nombre)
           values ($1, 1, 'Bloque 1'), ($1, 2, 'Bloque 2')
           on conflict (evento_id, numero) do nothing`, [eventoId])
      }
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
        `select id, bloque_id, numero, cerrado_en::text as cerrado_en, valoracion
         from tiempos where bloque_id = any($1) order by numero`, [ids])
      const asignaciones = await query(
        'select bloque_id, jugador_id from bloque_jugadores where bloque_id = any($1)', [ids])
      const staff = await query(
        'select bloque_id, staff_email, presente from bloque_staff where bloque_id = any($1)', [ids])
      const enCancha = await query(
        `select tj.tiempo_id, tj.jugador_id, tj.puesto, tj.prestado from tiempo_jugadores tj
         join tiempos t on t.id = tj.tiempo_id where t.bloque_id = any($1)`, [ids])
      return { bloques, tiempos, asignaciones, staff, en_cancha: enCancha }
    }
    if (metodo === 'POST' && p[1] === 'asignar') {
      // saca al jugador de ambos bloques del evento (y de sus tiempos) y lo pone en el nuevo
      const bloques = await query('select id from bloques where evento_id = $1', [b.evento_id])
      const [cerrado] = await query(
        `select 1 from bloques bl
         where bl.evento_id = $1 and bl.cerrado_en is not null
           and (bl.id = $2 or exists (select 1 from bloque_jugadores bj
                where bj.bloque_id = bl.id and bj.jugador_id = $3))
         limit 1`, [b.evento_id, b.bloque_id || null, b.jugador_id])
      if (cerrado) throw { codigo: 409, error: 'bloque_cerrado' }
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
    if (metodo === 'POST' && p[1] === 'asignar-staff') {
      const bloques = await query('select id from bloques where evento_id = $1', [b.evento_id])
      const [cerrado] = await query(
        `select 1 from bloques bl
         where bl.evento_id = $1 and bl.cerrado_en is not null
           and (bl.id = $2 or exists (select 1 from bloque_staff bs
                where bs.bloque_id = bl.id and bs.staff_email = $3))
         limit 1`, [b.evento_id, b.bloque_id || null, b.staff_email])
      if (cerrado) throw { codigo: 409, error: 'bloque_cerrado' }
      const ids = bloques.map((x) => x.id)
      await query('delete from bloque_staff where staff_email = $1 and bloque_id = any($2)',
        [b.staff_email, ids])
      if (b.bloque_id) {
        await query('insert into bloque_staff (bloque_id, staff_email) values ($1,$2)',
          [b.bloque_id, b.staff_email])
      }
      return { ok: true }
    }
    if (metodo === 'POST' && p[1] === 'staff-presente') {
      // Presencia efectiva del staff el día del partido, sobre su bloque
      // asignado (null vuelve a "sin marcar")
      const bloques = await query('select id from bloques where evento_id = $1', [b.evento_id])
      const [cerrado] = await query(
        `select 1 from bloques bl join bloque_staff bs on bs.bloque_id = bl.id
         where bl.evento_id = $1 and bs.staff_email = $2 and bl.cerrado_en is not null
         limit 1`, [b.evento_id, b.staff_email])
      if (cerrado) throw { codigo: 409, error: 'bloque_cerrado' }
      await query(
        'update bloque_staff set presente = $1 where staff_email = $2 and bloque_id = any($3)',
        [b.presente ?? null, b.staff_email, bloques.map((x) => x.id)])
      return { ok: true }
    }
    if (metodo === 'POST' && p[1] === 'limpiar-bloques') {
      const [cerrado] = await query(
        'select 1 from bloques where evento_id = $1 and cerrado_en is not null limit 1',
        [b.evento_id])
      if (cerrado) throw { codigo: 409, error: 'bloque_cerrado' }
      // Borra de una vez el armado completo: jugadores de los bloques y de
      // sus tiempos (el staff asignado no se toca)
      const bloques = await query('select id from bloques where evento_id = $1', [b.evento_id])
      const ids = bloques.map((x) => x.id)
      await query(
        `delete from tiempo_jugadores
         where tiempo_id in (select id from tiempos where bloque_id = any($1))`, [ids])
      await query('delete from bloque_jugadores where bloque_id = any($1)', [ids])
      return { ok: true }
    }
    if (metodo === 'POST' && p[1] === 'sugerir-bloques') {
      // Propone un reparto de los convocados entre los dos bloques. No
      // persiste nada: el staff lo ve, lo retoca y recién ahí lo aplica.
      const bloques = await query(
        'select id, numero, dificultad from bloques where evento_id = $1 order by numero',
        [b.evento_id])
      // El reparto equilibra dos bloques; con más, el armado se hace a mano
      if (bloques.length !== 2) throw { codigo: 400, error: 'solo_dos_bloques' }
      const ids = Array.isArray(b.jugador_ids) ? b.jugador_ids : []
      if (ids.length < 2) throw { codigo: 400, error: 'faltan_jugadores' }
      const jugadores = await query(
        `select id, posicion, puestos, puesto_principal, aptitudes
         from jugadores where id = any($1)`, [ids])
      // Última evaluación de cada uno; si hay revisión, promedia las dos miradas
      const evs = await query(
        `select distinct on (jugador_id) jugador_id, valores, valores_revisor
         from evaluaciones where jugador_id = any($1)
         order by jugador_id, fecha desc, created_at desc`, [ids])
      const calif = {}
      for (const ev of evs) {
        const notas = [promedioValores(ev.valores), promedioValores(ev.valores_revisor)]
          .filter((n) => n !== null)
        if (notas.length) calif[ev.jugador_id] = notas.reduce((s, n) => s + n, 0) / notas.length
      }
      // Sin evaluación: mediana del grupo, para que no desbalancee
      const conocidas = Object.values(calif).sort((x, y) => x - y)
      const mediana = conocidas.length
        ? conocidas[Math.floor(conocidas.length / 2)]
        : 3
      const sinEvaluacion = jugadores.filter((j) => calif[j.id] === undefined).map((j) => j.id)
      for (const id of sinEvaluacion) calif[id] = mediana
      // Sesgo: el bloque que enfrenta al rival más difícil queda un poco más fuerte
      const escala = (d) => ESCALA_DIFICULTAD[d] ?? 1
      const sesgo = (escala(bloques[1].dificultad) - escala(bloques[0].dificultad)) * SESGO_POR_ESCALON
      const { A, B } = sugerirReparto(jugadores, calif, sesgo)
      const asignacion = {}
      for (const id of A) asignacion[id] = bloques[0].id
      for (const id of B) asignacion[id] = bloques[1].id
      return { asignacion, califs: calif, sin_evaluacion: sinEvaluacion, sesgo }
    }
    if (metodo === 'PUT' && p[1] === 'bloque' && p[2]) {
      // Actualización parcial: solo cambian los campos presentes en el cuerpo
      await exigirBloqueAbierto(p[2])
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
    if (metodo === 'POST' && p[1] === 'sugerir-tiempos') {
      // Propone el equipo de un tiempo. No persiste: el cliente aplica con
      // partido/tiempo-equipo. Condición: el tiempo anterior tiene que estar
      // cerrado (valorado y confirmado), así lo cargado es un dato firme.
      const desde = Number(b.desde_numero) || 1
      await exigirBloqueAbierto(b.bloque_id)
      const [estadoTiempos] = await query(
        `select max(cerrado_en) filter (where numero = $2) as destino,
                count(*) filter (where numero = $2 - 1 and cerrado_en is null)::int as anterior_abierto
         from tiempos where bloque_id = $1`, [b.bloque_id, desde])
      if (estadoTiempos?.destino) throw { codigo: 409, error: 'tiempo_cerrado' }
      if (estadoTiempos?.anterior_abierto > 0) throw { codigo: 409, error: 'tiempo_anterior_abierto' }
      const prestamos = Math.max(0, Math.min(6, Number(b.prestamos_por_tiempo) || 0))
      // Los equipos se arman SOLO con los marcados "vino" ese día
      // (asistencias_partido, tomada en la cancha por el staff del bloque;
      // sin marca cuenta como faltó). Los golpeados y lesionados quedan
      // afuera hasta que se los desmarque.
      const delBloque = await query(
        `select j.id, j.posicion, j.puestos, j.aptitudes, ap.estado, ap.tarde, ap.condicion
         from bloque_jugadores bj
         join jugadores j on j.id = bj.jugador_id
         join bloques bl on bl.id = bj.bloque_id
         left join asistencias_partido ap
           on ap.evento_id = bl.evento_id and ap.jugador_id = j.id
         where bj.bloque_id = $1`, [b.bloque_id])
      const jugadores = delBloque.filter((j) => j.estado === 'presente' && !j.condicion)
      if (!jugadores.length) throw { codigo: 400, error: 'faltan_jugadores' }
      const tiempos = await query(
        'select id, numero from tiempos where bloque_id = $1 order by numero', [b.bloque_id])
      const filasCancha = await query(
        `select tj.tiempo_id, tj.jugador_id, tj.puesto, tj.prestado from tiempo_jugadores tj
         join tiempos t on t.id = tj.tiempo_id where t.bloque_id = $1`, [b.bloque_id])
      const enCancha = {}
      for (const f of filasCancha) {
        if (!enCancha[f.tiempo_id]) enCancha[f.tiempo_id] = {}
        enCancha[f.tiempo_id][f.jugador_id] = { puesto: f.puesto, prestado: f.prestado }
      }
      const ids = jugadores.map((j) => j.id)
      // % de asistencia a entrenamientos (ausente por defecto: el total es
      // la cantidad de entrenamientos con asistencia tomada)
      const [totEnt] = await query(
        `select count(*)::int as total from eventos e
         where e.tipo = 'entrenamiento' and e.fecha <= current_date
           and exists (select 1 from asistencias a where a.evento_id = e.id)
           and ${eventoVigente('e')}`)
      const filasAsis = await query(
        `select a.jugador_id, count(*) filter (where a.estado = 'presente')::int as presentes
         from asistencias a join eventos e on e.id = a.evento_id
         where a.jugador_id = any($1) and e.tipo = 'entrenamiento'
           and e.fecha <= current_date and ${eventoVigente('e')}
         group by a.jugador_id`, [ids])
      const asistencia = {}
      for (const f of filasAsis) {
        asistencia[f.jugador_id] = totEnt.total ? Math.round((f.presentes / totEnt.total) * 100) : 0
      }
      // préstamos acumulados en el año del partido, para rotar
      const filasPrest = await query(
        `select tj.jugador_id, count(*)::int as veces from tiempo_jugadores tj
         join tiempos t on t.id = tj.tiempo_id
         join bloques bl on bl.id = t.bloque_id
         join eventos e on e.id = bl.evento_id
         where tj.prestado and tj.jugador_id = any($1)
           and extract(year from e.fecha) = (
             select extract(year from e2.fecha) from eventos e2
             join bloques bl2 on bl2.evento_id = e2.id where bl2.id = $2)
         group by tj.jugador_id`, [ids, b.bloque_id])
      const prestamosAnio = {}
      for (const f of filasPrest) prestamosAnio[f.jugador_id] = f.veces
      const propuesta = sugerirEquipos({
        jugadores, tiempos, enCancha, desde, prestamos, asistencia, prestamosAnio,
      })
      return { tiempos: propuesta, asistencia }
    }
    if (metodo === 'POST' && p[1] === 'tiempo-equipo') {
      // Reemplaza de una vez el equipo completo de un tiempo
      await exigirTiempoAbierto(b.tiempo_id)
      const equipo = Array.isArray(b.equipo) ? b.equipo : []
      for (const e of equipo) {
        if (e.puesto != null && !PUESTOS_VALIDOS.includes(Number(e.puesto))) {
          throw { codigo: 400, error: 'puesto_invalido' }
        }
      }
      await query('delete from tiempo_jugadores where tiempo_id = $1', [b.tiempo_id])
      for (const e of equipo) {
        await query(
          `insert into tiempo_jugadores (tiempo_id, jugador_id, puesto, prestado)
           values ($1,$2,$3,$4)`,
          [b.tiempo_id, e.jugador_id, e.prestado ? null : (e.puesto ?? null), !!e.prestado])
      }
      return { ok: true }
    }
    if (metodo === 'POST' && p[1] === 'tiempo-cerrar') {
      // Cierra (o reabre) un tiempo, con valoración rápida opcional. La
      // reapertura de un tiempo es libre mientras el bloque siga abierto.
      const [t] = await query(
        `select t.id, bl.cerrado_en as bc from tiempos t
         join bloques bl on bl.id = t.bloque_id where t.id = $1`, [b.tiempo_id])
      if (!t) throw { codigo: 404, error: 'no_existe' }
      if (t.bc) throw { codigo: 409, error: 'bloque_cerrado' }
      const v = b.valoracion == null ? null : Number(b.valoracion)
      if (v !== null && !(v >= 1 && v <= 5)) throw { codigo: 400, error: 'valoracion_invalida' }
      if (b.cerrado) {
        // No se cierra un tiempo con puestos vacantes: la formación de 13
        // tiene que estar completa
        const [{ cubiertos }] = await query(
          `select count(distinct puesto)::int as cubiertos from tiempo_jugadores
           where tiempo_id = $1 and not prestado and puesto is not null`, [b.tiempo_id])
        if (cubiertos < PUESTOS_VALIDOS.length) {
          throw { codigo: 409, error: 'puestos_vacantes' }
        }
        await query(
          `update tiempos set cerrado_en = now(), valoracion = coalesce($2, valoracion)
           where id = $1`, [b.tiempo_id, v])
      } else {
        await query('update tiempos set cerrado_en = null where id = $1', [b.tiempo_id])
      }
      const filas = await query(
        `select id, bloque_id, numero, cerrado_en::text as cerrado_en, valoracion
         from tiempos where id = $1`, [b.tiempo_id])
      return filas[0]
    }
    if (metodo === 'POST' && p[1] === 'bloque-cerrar') {
      // Cierra el bloque (cualquiera del staff) o lo reabre (solo la cabeza
      // de división), dejando rastro de quién y cuándo.
      if (b.cerrado) {
        await query(
          `update bloques set cerrado_en = now(), cerrado_por = $2
           where id = $1 and cerrado_en is null`, [b.bloque_id, yo.email])
      } else {
        if (yo.rol !== 'Cabeza de división') throw { codigo: 403, error: 'solo_cabeza' }
        await query(
          'update bloques set cerrado_en = null, cerrado_por = null where id = $1',
          [b.bloque_id])
      }
      const filas = await query(
        `select ${COLS_BLOQUE} from bloques where id = $1`, [b.bloque_id])
      if (!filas.length) throw { codigo: 404, error: 'no_existe' }
      return filas[0]
    }
    if (metodo === 'POST' && p[1] === 'tiempo') {
      await exigirBloqueAbierto(b.bloque_id)
      const filas = await query(
        `insert into tiempos (bloque_id, numero)
         select $1, coalesce(max(numero), 0) + 1 from tiempos where bloque_id = $1
         returning id, bloque_id, numero`, [b.bloque_id])
      return filas[0]
    }
    if (metodo === 'POST' && p[1] === 'cancha') {
      await exigirTiempoAbierto(b.tiempo_id)
      if (b.dentro) {
        const puesto = b.puesto == null ? null : Number(b.puesto)
        if (puesto !== null && !PUESTOS_VALIDOS.includes(puesto)) {
          throw { codigo: 400, error: 'puesto_invalido' }
        }
        const prestado = !!b.prestado
        if (puesto !== null) {
          // Libera el puesto si lo ocupaba otro (el cliente reubica al otro
          // en la llamada siguiente cuando se trata de un intercambio)
          await query(
            `update tiempo_jugadores set puesto = null
             where tiempo_id = $1 and puesto = $2 and jugador_id <> $3`,
            [b.tiempo_id, puesto, b.jugador_id])
        }
        await query(
          `insert into tiempo_jugadores (tiempo_id, jugador_id, puesto, prestado)
           values ($1,$2,$3,$4)
           on conflict (tiempo_id, jugador_id) do update set puesto = $3, prestado = $4`,
          [b.tiempo_id, b.jugador_id, prestado ? null : puesto, prestado])
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
  const puestos = Array.isArray(b.puestos)
    ? [...new Set(b.puestos.filter((k) => TIPO_PUESTO[k]))]
    : []
  // Con puestos cargados, la posición genérica se deriva; sin puestos vale
  // la que venga escrita (jugadores viejos e importación por lista)
  const posicion = puestos.length ? posicionDePuestos(puestos) : normalizarPosicion(b.posicion)
  // El principal tiene que ser uno de los puestos cargados. Con uno solo se
  // deriva de ahí: no hace falta elegirlo.
  const principal = puestos.length === 1 ? puestos[0]
    : (puestos.includes(b.puesto_principal) ? b.puesto_principal : null)
  return [
    b.nombre.trim(), b.apellido.trim(), b.fecha_nacimiento || null, b.dni || null,
    posicion, JSON.stringify(puestos), principal, JSON.stringify(aptitudes), b.estado || 'activo', b.tutor_nombre || null,
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
