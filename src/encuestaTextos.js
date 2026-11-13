// Análisis de las respuestas libres de la encuesta a los jugadores. Sin DOM:
// lo usan la pantalla de resultados, el reporte en PDF y el informe de gestión.
//
// Todo corre adentro de la app, con reglas simples y a la vista: ningún texto
// de los chicos sale a un servicio de afuera. Cada respuesta se normaliza
// (minúsculas, sin tildes ni signos, sin letras estiradas: "muuuy" → "muy")
// y se busca en un diccionario de temas pensado para rugby infantil. El tono
// sale de una lista corta de palabras a favor y en contra, con la negación
// más común ("no me gustó", "no me aburrí"). Además se juntan las palabras que
// se repiten y no entran en ningún tema, para que aparezca lo que el
// diccionario no previó (un viaje, un nombre, un lugar).
//
// Lo que se informa son cantidades y frases que ya se leen completas en el
// listado de respuestas (en orden alfabético): no agrega nada que permita
// saber quién escribió qué.

// Con menos respuestas escritas que esto en una pregunta no se buscan
// tendencias: con dos o tres textos alcanza con leerlos
export const MINIMO_TEXTOS = 4
// Un tema cuenta como tendencia desde esta cantidad de menciones
export const MINIMO_MENCIONES = 2

// Normaliza un texto para buscar palabras: minúsculas, sin tildes (la ñ queda
// como n), solo letras y números, sin letras repetidas de más
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// Una clave del diccionario a expresión regular. Cada palabra vale como
// comienzo ("entrenador" agarra "entrenadores"); con "=" al final, exacta
// ("mal=" no agarra "malo"). Varias palabras van seguidas, en ese orden.
function patron(clave) {
  const palabras = clave.split(' ').map((w) => (w.endsWith('=')
    ? `${w.slice(0, -1)}(?![a-z0-9])`
    : `${w}[a-z0-9]*`))
  return new RegExp(`(?:^| )${palabras.join(' ')}`)
}

// ---------------------------------------------------------------------------
// Temas. `claves` son las palabras que lo delatan; `preguntas`, las preguntas
// cerradas de siempre que miden lo mismo (para cruzar lo que escribieron con
// los números); `sugerencia`, una idea para el staff cuando lo piden cambiar.
// ---------------------------------------------------------------------------
export const TEMAS = [
  {
    id: 'viajes', nombre: 'Los viajes y las giras',
    claves: ['viaj', 'gira', 'micro=', 'micros=', 'colectivo', 'el bus', 'hotel', 'alojad', 'alojamiento', 'dormir en',
      'salta', 'jujuy', 'cordoba', 'mendoza', 'catamarca', 'santiago del', 'rosario', 'buenos aires', 'tucuman vs'],
    sugerencia: 'Contarles con tiempo qué viajes hay en el año y cómo se elige quién va.',
  },
  {
    id: 'partidos', nombre: 'Los partidos y los encuentros',
    claves: ['partido', 'torneo', 'encuentro', 'jugar contra', 'ganar', 'ganamo', 'gane=', 'ganado', 'ganaba', 'perdi', 'perdemo',
      'perder', 'try=', 'tries=', 'trys=', 'campeon', 'la final', 'finales=', 'rival', 'sabado', 'sabados'],
    preguntas: ['divierte_partidos'],
    sugerencia: 'Mirar cómo se viven los días de partido: la espera, la rotación y el clima en el banco.',
  },
  {
    id: 'minutos', nombre: 'Jugar más minutos',
    claves: ['jugar mas', 'jugar poco', 'juego poco', 'jugue poco', 'mas minuto', 'minuto', 'suplente', 'el banco', 'en el banco',
      'banco=', 'titular', 'no jugue', 'no me ponen', 'no me hacen jugar', 'que todos jueguen', 'todos jueguen',
      'rotacion', 'rotar', 'siempre los mismos', 'juegan los mismos', 'juegan siempre', 'siempre juegan', 'mas tiempo de juego', 'que me pongan', 'ponerme'],
    preguntas: ['juego_suficiente'],
    sugerencia: 'Contarles cómo se reparten los tiempos y revisar la equidad real en el informe de gestión.',
  },
  {
    id: 'grupo', nombre: 'Los amigos y el grupo',
    claves: ['amig', 'companer', 'grupo', 'juntos', 'union', 'unido', 'hermand', 'los chicos', 'mis chicos', 'la division',
      'el equipo', 'equipazo', 'nos llevamos'],
    preguntas: ['parte_equipo', 'companeros'],
    sugerencia: 'Trabajar la integración del grupo con actividades que mezclen, y mirar a los que quedan aislados.',
  },
  {
    id: 'entrenadores', nombre: 'Los entrenadores',
    claves: ['entrenador', 'profe', 'profesor', 'coach', 'pf=', 'staff', 'cabeza de division', 'los que entrenan', 'los que nos entrenan'],
    preguntas: ['explican', 'trato_igual', 'se_dan_cuenta'],
    sugerencia: 'Repasar en el staff lo que dicen de los entrenadores, con una devolución individual a cada chico.',
  },
  {
    id: 'entrenamientos', nombre: 'Los entrenamientos',
    claves: ['entrenamiento', 'entrenar', 'entreno', 'entrenos', 'entrenamo', 'practica', 'ejercicio', 'juegos', 'jueguito',
      'calentamiento', 'calentar', 'dinamica', 'los martes', 'los jueves', 'esperar en fila', 'la fila', 'hacer fila'],
    preguntas: ['divierte_entrenamientos'],
    sugerencia: 'Revisar la dinámica de los entrenamientos: más juego con pelota, menos espera en fila, consignas cortas.',
  },
  {
    id: 'aprender', nombre: 'Aprender y mejorar el juego',
    claves: ['aprend', 'ensen', 'mejorar', 'mejore=', 'mejoro=', 'mejoramo', 'mejorando', 'tackl', 'tacle', 'taclear', 'pase=', 'pases=', 'pasar la pelota',
      'scrum', 'line=', 'lineout', 'ruck', 'maul', 'patada', 'patear', 'kick', 'tecnica', 'defens', 'ataque', 'atacar',
      'jugada', 'posicion', 'puesto'],
    preguntas: ['aprendi', 'explican'],
    sugerencia: 'Revisar la planificación técnica: objetivos claros por mes y contarle a cada chico qué mejoró.',
  },
  {
    id: 'fisico', nombre: 'La parte física',
    claves: ['correr', 'corrimos', 'corremos', 'pique', 'sprint', 'flexion', 'lagartija', 'abdominal', 'fisico', 'gimnasio',
      'preparacion fisica', 'cansa', 'cansad', 'cansador', 'resistencia', 'vueltas'],
    sugerencia: 'Mirar la carga física: que la preparación se haga jugando y no como castigo.',
  },
  {
    id: 'gritos', nombre: 'Los gritos y la forma de corregir',
    claves: ['grit', 'reta', 'retan', 'reten', 'reto', 'retaron', 'retar', 'enoj', 'putea', 'insult', 'mala onda', 'malhumor',
      'mal humor', 'castig', 'de penitencia', 'nos hacen correr', 'nos tratan mal', 'me tratan mal'],
    preguntas: ['sin_gritos'],
    sugerencia: 'Acordar en el staff una forma común de corregir: en voz normal, cerca del chico y diciendo qué hacer.',
  },
  {
    id: 'burlas', nombre: 'Burlas y peleas entre compañeros',
    claves: ['burl', 'molest', 'cargan', 'cargaba', 'se rien', 'se reian', 'bardea', 'bardo', 'pelea', 'pelean', 'peleamo', 'pegan',
      'pegaron', 'pega=', 'empuj', 'bullying', 'buling', 'discrimin', 'apodo', 'me dicen', 'me dejan afuera', 'dejan afuera',
      'no me pasan', 'no me la pasan', 'agrand', 'creidos', 'se creen'],
    preguntas: ['molestaron', 'companeros'],
    sugerencia: 'Hablar de las burlas con el grupo y estar atentos a los momentos sin adultos cerca: vestuario, viajes, tercer tiempo.',
  },
  {
    id: 'contacto', nombre: 'El contacto, los golpes y el miedo',
    claves: ['golpe', 'golpea', 'lesion', 'lastim', 'duele', 'dolio', 'dolor', 'miedo', 'asusta', 'asust', 'me rompi', 'esguince',
      'fractur', 'conmoci', 'hospital', 'sangr', 'muy fuerte', 'bruto', 'brutos', 'brusc', 'contacto'],
    preguntas: ['seguro_contacto', 'cuidan_golpe'],
    sugerencia: 'Reforzar las progresiones de contacto por niveles y tener a la vista qué se hace ante un golpe.',
  },
  {
    id: 'organizacion', nombre: 'La organización, los horarios y los avisos',
    claves: ['horario', 'temprano', 'avis', 'organiza', 'desorganiz', 'cronograma', 'whatsapp', 'wpp', 'grupo de padres',
      'ultimo momento', 'puntual', 'suspend', 'cancel', 'esperar mucho', 'esperamos mucho', 'esperando'],
    preguntas: ['aviso_tiempo'],
    sugerencia: 'Avisar el cronograma con más anticipación y por un solo canal fijo.',
  },
  {
    id: 'lugar', nombre: 'La cancha, el clima y las cosas',
    claves: ['cancha', 'pasto', 'barro', 'frio', 'lluvia', 'llov', 'calor', 'vestuario', 'bano', 'banos', 'agua', 'luz=', 'luces',
      'pelotas', 'escudo', 'conos', 'camiset', 'indumentaria', 'ropa', 'short', 'medias', 'botines', 'buzo', 'materiales'],
    sugerencia: 'Revisar lo material: estado de la cancha, agua, vestuario y que alcancen las pelotas y los escudos.',
  },
  {
    id: 'tercer_tiempo', nombre: 'El tercer tiempo y la comida',
    claves: ['tercer tiempo', '3er tiempo', 'comida', 'comer', 'comimos', 'asado', 'pizza', 'chori', 'hamburgues', 'merienda',
      'gaseosa', 'coca', 'factura', 'sanguche', 'sandwich', 'helado', 'cena'],
  },
  {
    id: 'diversion', nombre: 'Divertirse y pasarla bien',
    claves: ['divert', 'divirt', 'diversion', 'la pase bien', 'la pasamos bien', 'pasarla bien', 'pasarlo bien', 'risa', 'reir',
      'nos reimos', 'jodimos', 'joda', 'aburr', 'disfrut'],
    preguntas: ['divierte_entrenamientos', 'divierte_partidos', 'ganas'],
    sugerencia: 'Buscar qué los aburre: más tiempo con pelota y juegos, menos explicaciones largas.',
  },
  {
    id: 'agradecimiento', nombre: 'Agradecimiento y cariño',
    claves: ['gracias', 'agradec', 'los quiero', 'te quiero', 'los amo', 'los re quiero', 'son los mejores', 'son lo mas', 'son unos genios',
      'genios', 'capos', 'idolos', 'cracks', 'sigan asi', 'que sigan', 'nunca cambien', 'no cambien'],
  },
  {
    id: 'seguir', nombre: 'Dudas sobre seguir',
    claves: ['dejar el rugby', 'dejar de venir', 'dejar de jugar', 'no quiero venir', 'no quiero seguir', 'no voy a seguir', 'me quiero ir',
      'irme', 'cambiarme de club', 'otro club', 'otro deporte'],
    preguntas: ['seguir', 'ganas'],
    sugerencia: 'Antes de la reinscripción, hablar con las familias de los que dudan para conocer los motivos.',
  },
].map((t) => ({ ...t, patrones: t.claves.map(patron) }))

const TEMA_POR_ID = Object.fromEntries(TEMAS.map((t) => [t.id, t]))

// Lo que pide leerse con atención aunque sea una sola vez: maltrato, miedo,
// tristeza, ganas de dejar. No se resume: se muestra la frase entera.
const SENSIBLES = [
  'burl', 'me molesta', 'nos molesta', 'molestan a', 'me molestaron', 'pegan', 'pegaron', 'me pega', 'golpean', 'empuj', 'bullying', 'buling', 'discrimin', 'insult', 'putea',
  'miedo', 'asusta', 'triste', 'llor', 'nadie me', 'no me quieren', 'me dejan afuera', 'me tratan mal',
  'nos tratan mal', 'humill', 'abus', 'acos', 'toquete', 'manose', 'incomod', 'odio', 'me quiero ir', 'no quiero venir',
  'no quiero seguir', 'dejar el rugby', 'dejar de venir', 'me grit', 'nos grit',
].map(patron)

// Tono. Palabras a favor y en contra; una negación en las dos palabras de
// antes da vuelta el sentido ("no me gustó", "nada aburrido", "sin gritos").
const A_FAVOR = ['gust', 'encant', 'divert', 'divirt', 'diversion', 'lindo', 'linda', 'lindos', 'genial', 'buen', 'bueno', 'buena',
  'buenisim', 'mejores=', 'copad', 'increibl', 'hermos', 'feliz', 'alegr', 'excelent', 'espectacular', 'capo', 'crack',
  'genio', 'gracias', 'agradec', 'amo=', 'sigan=', 'disfrut', 'facha', 'barbaro', 'perfect', 'piola', 'joya', 'aprendi']
  .map(patron)
const EN_CONTRA = ['aburr', 'feo', 'fea', 'malo', 'mala', 'mal=', 'odio', 'triste', 'grit', 'reta', 'retan', 'enoj', 'burl', 'molest',
  'injust', 'miedo', 'dolor', 'peor', 'pelea', 'cansad', 'horrible', 'pesad', 'insult', 'putea', 'desorganiz',
  'falta', 'faltan', 'falto', 'deberian', 'tendrian', 'ojala']
  .map(patron)
const NEGACIONES = new Set(['no', 'nunca', 'ni', 'nada', 'tampoco', 'sin', 'jamas'])

// Las palabras que no dicen nada solas, para el conteo de lo que se repite
const VACIAS = new Set((
  'a al algo alguien algun alguna algunos ahi asi aca alla antes ante aunque bien bastante cada casi como con contra cosa cosas cual cuando ' +
  'de del desde donde dos el ella ellos en entre era eran es esa ese eso esta estaba estan estar este esto estos estoy fue fuimos fueron ' +
  'gran ha hace hacen hacer hago hay hasta la las le les lo los mas me mi mis mucho mucha muchos muchas muy nada ni no nos nosotros ' +
  'o otra otro otros para pero poco por porque que quien se sea ser si siempre sin sobre solo son su sus tal tambien tan tanto te ' +
  'tener tengo tenemos tiene tienen todo toda todos todas tu un una uno unos unas va van vamos ver vez y ya yo ' +
  'año ano anos años este ese cosa veces dia dias vos ustedes usted re medio mismo misma entonces despues luego ' +
  'gusto gustaron gustan gusta gustaria cambiaria cambiar cambiaron cambio cambie quiero quisiera decir digo dicen ' +
  'entrenadores lo que mas fue'
).split(' '))

// Respuestas que no dicen nada: "nada", "no sé", "-", "ninguna"...
const SIN_CONTENIDO = /^(?:nada|no|nose|no se|ns|nada nada|ninguna|ninguno|ningun|nadie|x|xx|ok|na|nop|no tengo|nada mas|nada por ahora|no se que poner|no se me ocurre nada|no sabria|ya fue|nd|ninguna cosa|nada en especial|nada en particular|nada que decir|nada para decir)$/
// En "lo que cambiaría", además, las que dicen que está todo bien así
const NADA_QUE_CAMBIAR = /^(?:nada|no|ninguna|ningun|ninguna cosa|nada esta todo bien|nada todo bien|todo bien|nada me gusta todo|nada me gusta asi|no cambiaria nada|nada nada|nada es perfecto|esta todo bien|nada esta perfecto|nada asi esta bien|asi esta bien|nada porque esta todo bien|nada todo perfecto|todo perfecto|nada en especial|nada en particular)$/

// Para qué sirve una pregunta libre: lo que más gustó (lo que nombran es a
// favor), lo que cambiarían (en contra) o un mensaje (el tono decide)
export function sentidoDePregunta(p) {
  if (p.clave === 'mas_gusto') return 'a_favor'
  if (p.clave === 'cambiaria') return 'a_cambiar'
  if (p.clave === 'mensaje') return 'mensaje'
  const t = normalizar(p.texto)
  if (/(cambiar|cambiaria|mejorar|mejoraria|no te gust|no me gust|menos te gust|menos me gust|peor|falt|sacaria|agregaria|molest)/.test(t)) return 'a_cambiar'
  if (/(mas te gust|mas me gust|gusto|favorit|lo mejor|mejor momento|disfrut|orgullo)/.test(t)) return 'a_favor'
  return 'mensaje'
}

// El tono de un texto ya normalizado: 'positivo', 'negativo', 'mixto' o
// 'neutro'
export function tonoDe(normal) {
  const palabras = normal.split(' ')
  let favor = 0
  let contra = 0
  palabras.forEach((w, i) => {
    const pedazo = ` ${w}`
    const pos = A_FAVOR.some((re) => re.test(pedazo))
    const neg = EN_CONTRA.some((re) => re.test(pedazo))
    if (!pos && !neg) return
    // La negación de las dos palabras de antes. "Que no griten" es un pedido,
    // no un elogio: con "que" delante, lo malo sigue siendo malo
    const j = NEGACIONES.has(palabras[i - 1]) ? i - 1 : NEGACIONES.has(palabras[i - 2]) ? i - 2 : -1
    const negada = j >= 0
    const pedido = negada && palabras[j - 1] === 'que'
    if (pos) negada ? contra++ : favor++
    if (neg) negada && !pedido ? favor++ : contra++
  })
  if (favor && contra) return favor >= 2 * contra ? 'positivo' : contra >= 2 * favor ? 'negativo' : 'mixto'
  if (favor) return 'positivo'
  if (contra) return 'negativo'
  return 'neutro'
}

// Los temas de un texto ya normalizado (cada uno una vez)
export function temasDe(normal) {
  const con = ` ${normal}`
  return TEMAS.filter((t) => t.patrones.some((re) => re.test(con))).map((t) => t.id)
}

const esSensible = (normal) => SENSIBLES.some((re) => re.test(` ${normal}`))

// Las palabras que cuentan para "lo que se repite": sin las vacías, sin las
// de algún tema (eso ya está contado) y con el plural llevado al singular
function palabrasSueltas(normal) {
  const out = new Set()
  for (const w of normal.split(' ')) {
    if (w.length < 4 || VACIAS.has(w) || /^\d+$/.test(w)) continue
    if (TEMAS.some((t) => t.patrones.some((re) => re.test(` ${w}`)))) continue
    if (A_FAVOR.some((re) => re.test(` ${w}`)) || EN_CONTRA.some((re) => re.test(` ${w}`))) continue
    out.add(w.length > 4 && w.endsWith('es') && !w.endsWith('ces') ? w.slice(0, -2) : w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)
  }
  return out
}

// Un texto corto para citar: la respuesta entera si es breve, si no el
// primer pedazo hasta un corte natural
function cita(texto, largo = 110) {
  const t = String(texto).trim().replace(/\s+/g, ' ')
  if (t.length <= largo) return t
  const corte = t.slice(0, largo)
  const fin = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf(', '), corte.lastIndexOf(' '))
  return `${corte.slice(0, fin > 40 ? fin : largo).replace(/[,.;:]$/, '')}…`
}

const pct = (parte, total) => (total ? Math.round((100 * parte) / total) : 0)

// Una respuesta, del lado bueno o del malo según la pregunta y su tono.
// true = a favor, false = en contra, null = no se puede decir. Lo que nombran
// en "lo que cambiaría" es lo que cambiarían, salvo un agradecimiento ("que
// sigan así")
function ladoDe(sentido, tono, tema, pedido = false) {
  if (sentido === 'a_favor') return tono === 'negativo' ? false : true
  if (sentido === 'a_cambiar') return tema === 'agradecimiento' ? null : false
  if (tono === 'positivo') return true
  if (tono === 'negativo') return false
  // En un mensaje, "que me pongan más" es un pedido: algo a cambiar
  if (pedido && tema !== 'agradecimiento') return false
  return null
}

// Analiza una pregunta libre ya resumida ({ clave, texto, textos })
export function analizarPreguntaLibre(p) {
  const sentido = sentidoDePregunta(p)
  const textos = (p.textos || []).map((t) => String(t).trim()).filter(Boolean)
  const filas = textos.map((t) => {
    const normal = normalizar(t)
    const vacia = !normal || SIN_CONTENIDO.test(normal)
    const nadaQueCambiar = sentido === 'a_cambiar' && NADA_QUE_CAMBIAR.test(normal)
    const tono = vacia || nadaQueCambiar ? 'neutro' : tonoDe(normal)
    return {
      texto: t, normal, tono, vacia: vacia && !nadaQueCambiar, nadaQueCambiar,
      temas: vacia || nadaQueCambiar ? [] : temasDe(normal),
      sensible: !vacia && esSensible(normal),
    }
  })
  const conContenido = filas.filter((f) => !f.vacia && !f.nadaQueCambiar)
  const res = {
    clave: p.clave, texto: p.texto, sentido,
    total: filas.length,
    con_contenido: conContenido.length,
    vacias: filas.filter((f) => f.vacia).length,
    nada_que_cambiar: filas.filter((f) => f.nadaQueCambiar).length,
    tonos: {
      positivo: conContenido.filter((f) => f.tono === 'positivo').length,
      negativo: conContenido.filter((f) => f.tono === 'negativo').length,
      mixto: conContenido.filter((f) => f.tono === 'mixto').length,
      neutro: conContenido.filter((f) => f.tono === 'neutro').length,
    },
    sensibles: filas.filter((f) => f.sensible).map((f) => f.texto),
    suficientes: conContenido.length >= MINIMO_TEXTOS,
    temas: [],
    repetidas: [],
    sin_tema: 0,
  }
  if (!res.suficientes) return res

  // Temas: cuántas respuestas lo nombran, de qué lado y un par de citas (las
  // más cortas, para que se lean de un vistazo; a igual largo, por orden
  // alfabético, como el listado)
  res.temas = TEMAS.map((t) => {
    const lo = conContenido.filter((f) => f.temas.includes(t.id))
    if (!lo.length) return null
    const lados = lo.map((f) => ladoDe(sentido, f.tono, t.id, f.normal.startsWith('que ')))
    return {
      id: t.id, nombre: t.nombre,
      menciones: lo.length,
      pct: pct(lo.length, conContenido.length),
      a_favor: lados.filter((l) => l === true).length,
      en_contra: lados.filter((l) => l === false).length,
      citas: [...lo].sort((a, b) => a.texto.length - b.texto.length || a.texto.localeCompare(b.texto, 'es'))
        .slice(0, 2).map((f) => cita(f.texto)),
    }
  }).filter(Boolean).sort((a, b) => b.menciones - a.menciones || a.nombre.localeCompare(b.nombre, 'es'))
  res.sin_tema = conContenido.filter((f) => !f.temas.length).length

  // Palabras que se repiten fuera de los temas (en al menos dos respuestas)
  const cuenta = new Map()
  for (const f of conContenido) for (const w of palabrasSueltas(f.normal)) cuenta.set(w, (cuenta.get(w) || 0) + 1)
  res.repetidas = [...cuenta].filter(([, n]) => n >= MINIMO_MENCIONES)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, 8)
    .map(([palabra, veces]) => ({ palabra, veces }))
  return res
}

const listaY = (l) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}`)
const enMinuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1)

// El análisis de todas las respuestas libres de una encuesta resumida
// (resumirEncuesta). Devuelve el detalle por pregunta y las tendencias del
// conjunto, ya redactadas. null si no hay preguntas libres o si la encuesta
// no tiene resultados para mostrar.
export function analizarTextosLibres(r) {
  if (!r?.suficientes) return null
  const abiertas = (r.preguntas || []).filter((p) => p.tipo === 'abierta')
  if (!abiertas.length) return null
  const preguntas = abiertas.map(analizarPreguntaLibre)
  const escritas = preguntas.reduce((n, p) => n + p.con_contenido, 0)
  const porClave = Object.fromEntries((r.preguntas || []).map((p) => [p.clave, p]))

  // Cada tema sumado entre todas las preguntas, de cada lado
  const global = new Map()
  for (const p of preguntas) {
    for (const t of p.temas) {
      const g = global.get(t.id) || { id: t.id, nombre: t.nombre, menciones: 0, a_favor: 0, en_contra: 0 }
      g.menciones += t.menciones
      g.a_favor += t.a_favor
      g.en_contra += t.en_contra
      global.set(t.id, g)
    }
  }
  const temas = [...global.values()]
  const divididos = temas.filter((t) => t.a_favor >= MINIMO_MENCIONES && t.en_contra >= MINIMO_MENCIONES
    && Math.min(t.a_favor, t.en_contra) / Math.max(t.a_favor, t.en_contra) >= 0.4)
  const esDividido = (t) => divididos.includes(t)
  const valoran = temas.filter((t) => !esDividido(t) && t.a_favor >= MINIMO_MENCIONES && t.a_favor > t.en_contra)
    .sort((a, b) => b.a_favor - a.a_favor || a.nombre.localeCompare(b.nombre, 'es'))
  const piden = temas.filter((t) => !esDividido(t) && t.en_contra >= MINIMO_MENCIONES && t.en_contra >= t.a_favor)
    .sort((a, b) => b.en_contra - a.en_contra || a.nombre.localeCompare(b.nombre, 'es'))

  // Tendencias redactadas, de lo general a lo particular
  const tendencias = []
  if (valoran.length) {
    tendencias.push(`Lo que más valoran, por cantidad de menciones: ${listaY(valoran.slice(0, 4).map((t) => `${enMinuscula(t.nombre)} (${t.a_favor})`))}.`)
  }
  if (piden.length) {
    tendencias.push(`Lo que más piden cambiar, por cantidad de menciones: ${listaY(piden.slice(0, 4).map((t) => `${enMinuscula(t.nombre)} (${t.en_contra})`))}.`)
  }
  for (const t of divididos.slice(0, 3)) {
    tendencias.push(`${t.nombre} dividen opiniones: ${t.a_favor} ${t.a_favor === 1 ? 'lo nombra' : 'lo nombran'} a favor y ${t.en_contra} en contra.`)
  }
  for (const p of preguntas) {
    if (p.nada_que_cambiar >= MINIMO_MENCIONES) {
      tendencias.push(`${p.nada_que_cambiar} de ${p.total} ${p.nada_que_cambiar === 1 ? 'chico no cambiaría' : 'chicos no cambiarían'} nada ("${p.texto}").`)
    }
    if (p.sentido === 'mensaje' && p.suficientes) {
      const { positivo, negativo, mixto } = p.tonos
      const conTono = positivo + negativo + mixto
      if (conTono) {
        const predomina = positivo >= 2 * (negativo + mixto) ? 'predomina el tono positivo'
          : negativo >= 2 * (positivo + mixto) ? 'predomina el tono negativo'
            : 'el tono está repartido'
        tendencias.push(`En "${p.texto}" ${predomina}: ${positivo} ${positivo === 1 ? 'mensaje positivo' : 'mensajes positivos'}, ` +
          `${negativo} ${negativo === 1 ? 'negativo' : 'negativos'}${mixto ? ` y ${mixto} con las dos cosas` : ''}.`)
      }
    }
  }
  const repetidas = new Map()
  for (const p of preguntas) for (const w of p.repetidas) repetidas.set(w.palabra, (repetidas.get(w.palabra) || 0) + w.veces)
  const otras = [...repetidas].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, 6)
  if (otras.length) {
    tendencias.push(`Otras palabras que se repiten, fuera de esos temas: ${listaY(otras.map(([w, n]) => `"${w}" (${n})`))}.`)
  }

  // Cruce con las preguntas cerradas que miden lo mismo: si lo piden cambiar
  // por escrito y el número también salió flojo, se refuerzan
  const cruces = []
  for (const t of piden.concat(divididos)) {
    const flojas = (TEMA_POR_ID[t.id].preguntas || [])
      .map((c) => porClave[c])
      .filter((q) => q?.favorable != null && q.favorable < 75)
    if (flojas.length) {
      cruces.push(`${t.nombre}: lo piden cambiar por escrito y coincide con ${listaY(flojas.map((q) => `"${q.texto}" (${q.favorable}% favorable)`))}.`)
    }
  }

  // Sugerencias para lo que piden cambiar
  const sugerencias = piden.concat(divididos)
    .filter((t) => TEMA_POR_ID[t.id].sugerencia)
    .slice(0, 5)
    .map((t) => ({ tema: t.nombre, menciones: t.en_contra, sugerencia: TEMA_POR_ID[t.id].sugerencia }))

  const sensibles = [...new Set(preguntas.flatMap((p) => p.sensibles))].sort((a, b) => a.localeCompare(b, 'es'))

  return {
    escritas,
    preguntas,
    valoran,
    piden,
    divididos,
    tendencias,
    cruces,
    sugerencias,
    sensibles,
  }
}

// Una línea para el tono de una pregunta: "12 positivas · 3 negativas"
export function textoTonos(t) {
  const partes = []
  if (t.positivo) partes.push(`${t.positivo} ${t.positivo === 1 ? 'positiva' : 'positivas'}`)
  if (t.negativo) partes.push(`${t.negativo} ${t.negativo === 1 ? 'negativa' : 'negativas'}`)
  if (t.mixto) partes.push(`${t.mixto} con las dos cosas`)
  if (t.neutro) partes.push(`${t.neutro} sin tono claro`)
  return partes.join(' · ')
}
