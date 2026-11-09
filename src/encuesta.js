// Encuesta anónima a los jugadores: catálogo de preguntas, validación y
// resumen de resultados. Lo comparten la pantalla pública que contestan los
// chicos (src/pages/EncuestaPublica.jsx), la de administración
// (src/pages/Encuestas.jsx), el servidor (server/encuestas.js) y el informe de
// gestión: así una respuesta se valida y se cuenta igual en todos lados. No
// toca el DOM.
//
// Cada encuesta guarda su propia lista de preguntas (se pueden cambiar,
// agregar y sacar antes de que llegue la primera respuesta). Las preguntas se
// comparan de un año al otro por su `clave`, que no cambia aunque se corrija
// el texto: por eso las de siempre tienen claves fijas.

// Tipos de respuesta. Las escalas cerradas tienen un lado "favorable" que se
// usa para el porcentaje de cada pregunta; `negativa` lo da vuelta (en "me
// molestaron", lo favorable es el "no").
export const TIPOS_PREGUNTA = [
  { value: 'frecuencia', label: 'Siempre · Casi siempre · A veces · Nunca' },
  { value: 'si_nose_no', label: 'Sí · No sé · No' },
  { value: 'si_no', label: 'Sí · No' },
  { value: 'nota', label: 'Nota del 1 al 10' },
  { value: 'opciones', label: 'Opciones a elegir' },
  { value: 'abierta', label: 'Respuesta libre (texto)' },
]

export const TIPOS_POR_VALUE = Object.fromEntries(TIPOS_PREGUNTA.map((t) => [t.value, t]))

// Las respuestas posibles de cada escala, con la carita que ve el chico.
// `favorable` marca el lado bueno de la escala (antes de aplicar `negativa`).
const ESCALAS = {
  frecuencia: [
    { value: 4, label: 'Siempre', cara: '😀', favorable: true },
    { value: 3, label: 'Casi siempre', cara: '🙂', favorable: true },
    { value: 2, label: 'A veces', cara: '😐', favorable: false },
    { value: 1, label: 'Nunca', cara: '🙁', favorable: false },
  ],
  si_nose_no: [
    { value: 'si', label: 'Sí', cara: '👍', favorable: true },
    { value: 'nose', label: 'No sé', cara: '🤔', favorable: false },
    { value: 'no', label: 'No', cara: '👎', favorable: false },
  ],
  si_no: [
    { value: 'si', label: 'Sí', cara: '👍', favorable: true },
    { value: 'no', label: 'No', cara: '👎', favorable: false },
  ],
}

// Las respuestas posibles de una pregunta cerrada, en el orden en que se
// muestran. Las de "opciones" usan el índice como valor, así corregir el texto
// de una opción no rompe lo ya contestado.
export function opcionesDe(p) {
  if (ESCALAS[p.tipo]) {
    return ESCALAS[p.tipo].map((o) => ({
      ...o,
      // En una pregunta negativa, lo favorable es el otro lado de la escala
      favorable: p.tipo === 'si_nose_no' && p.negativa
        ? o.value === 'no'
        : p.negativa ? !o.favorable : o.favorable,
    }))
  }
  if (p.tipo === 'nota') {
    return Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1), favorable: i + 1 >= 7 }))
  }
  if (p.tipo === 'opciones') {
    return (p.opciones || []).map((label, i) => ({ value: i, label, favorable: null }))
  }
  return []
}

// Tipos que entran en el índice general: los que tienen un lado favorable
const TIPOS_CON_INDICE = ['frecuencia', 'si_nose_no', 'si_no']

// Con menos respuestas que esto no se muestra nada: en un plantel chico, tres
// respuestas alcanzan para adivinar quién dijo qué. Vale también para los
// cortes por segmento.
export const MINIMO_RESPUESTAS = 5

export const LARGO_TEXTO_LIBRE = 600

// ---------------------------------------------------------------------------
// Las preguntas de siempre (la propuesta original). Claves fijas: son las que
// permiten comparar un año con el otro.
// ---------------------------------------------------------------------------
const POR_DEFECTO = [
  {
    clave: 'antiguedad', bloque: 'Sobre vos', tipo: 'opciones', segmento: true,
    texto: '¿Cuántos años hace que jugás en el club?',
    opciones: ['Este es mi primer año', '2 o 3 años', '4 años o más'],
  },
  { clave: 'divierte_entrenamientos', bloque: 'Disfrute y ganas de seguir', tipo: 'frecuencia', texto: 'Me divierto en los entrenamientos.' },
  { clave: 'divierte_partidos', bloque: 'Disfrute y ganas de seguir', tipo: 'frecuencia', texto: 'Me divierto en los partidos y encuentros.' },
  { clave: 'ganas', bloque: 'Disfrute y ganas de seguir', tipo: 'frecuencia', texto: 'Tengo ganas de que llegue el día de rugby.' },
  { clave: 'seguir', bloque: 'Disfrute y ganas de seguir', tipo: 'si_nose_no', texto: 'El año que viene quiero seguir jugando en el club.' },
  { clave: 'aprendi', bloque: 'Aprender', tipo: 'frecuencia', texto: 'Este año aprendí cosas nuevas de rugby.' },
  { clave: 'explican', bloque: 'Aprender', tipo: 'frecuencia', texto: 'Los entrenadores me explican qué tengo que mejorar.' },
  { clave: 'sin_gritos', bloque: 'Aprender', tipo: 'frecuencia', texto: 'Cuando me equivoco, me corrigen sin gritarme.' },
  { clave: 'trato_igual', bloque: 'Trato y justicia', tipo: 'frecuencia', texto: 'Los entrenadores me tratan igual que a mis compañeros.' },
  { clave: 'juego_suficiente', bloque: 'Trato y justicia', tipo: 'frecuencia', texto: 'En los partidos juego lo suficiente.' },
  { clave: 'se_dan_cuenta', bloque: 'Trato y justicia', tipo: 'frecuencia', texto: 'Los entrenadores se dan cuenta de cómo estoy.' },
  { clave: 'adulto_confianza', bloque: 'Trato y justicia', tipo: 'si_no', texto: 'Hay al menos un adulto del club con quien puedo hablar si me pasa algo.' },
  { clave: 'parte_equipo', bloque: 'Grupo', tipo: 'frecuencia', texto: 'Me siento parte del equipo.' },
  { clave: 'companeros', bloque: 'Grupo', tipo: 'frecuencia', texto: 'Mis compañeros me tratan bien.' },
  { clave: 'molestaron', bloque: 'Grupo', tipo: 'si_no', negativa: true, texto: 'Este año alguien del equipo se burló de mí o me molestó seguido.' },
  { clave: 'seguro_contacto', bloque: 'Cuerpo y seguridad', tipo: 'frecuencia', texto: 'Me siento seguro en el contacto y el tackle.' },
  { clave: 'cuidan_golpe', bloque: 'Cuerpo y seguridad', tipo: 'frecuencia', texto: 'Cuando me golpeo, los adultos me cuidan.' },
  { clave: 'aviso_tiempo', bloque: 'Organización', tipo: 'frecuencia', texto: 'Sé con tiempo cuándo y dónde entrenamos o jugamos.' },
  { clave: 'nota_anio', bloque: 'Organización', tipo: 'nota', texto: 'Del 1 al 10, ¿cuánto te gustó este año de rugby?' },
  { clave: 'mas_gusto', bloque: 'Para cerrar', tipo: 'abierta', texto: 'Lo que más me gustó del año fue…' },
  { clave: 'cambiaria', bloque: 'Para cerrar', tipo: 'abierta', texto: 'Lo que cambiaría es…' },
  { clave: 'mensaje', bloque: 'Para cerrar', tipo: 'abierta', texto: 'Algo que les quiero decir a los entrenadores…' },
]

// Copia fresca, con los valores por defecto completos
export function preguntasPorDefecto() {
  return POR_DEFECTO.map(normalizar)
}

function normalizar(p) {
  return {
    clave: p.clave,
    bloque: p.bloque || 'Preguntas',
    texto: p.texto,
    tipo: p.tipo,
    negativa: !!p.negativa,
    obligatoria: p.obligatoria ?? p.tipo !== 'abierta',
    segmento: p.tipo === 'opciones' && !!p.segmento,
    ...(p.tipo === 'opciones' ? { opciones: [...(p.opciones || [])] } : {}),
  }
}

// Clave para una pregunta nueva: el texto sin tildes ni signos, con un sufijo
// para que no choque con otra (ni con una de siempre, que no llevan "x_")
export function claveNueva(texto, existentes = []) {
  const base = String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'pregunta'
  let clave = `x_${base}`
  let n = 2
  while (existentes.includes(clave)) clave = `x_${base}_${n++}`
  return clave
}

const error = (detalle) => ({ codigo: 400, error: 'preguntas_invalidas', detalle })

// Normaliza y valida la lista que viene del editor. Tira un error con el
// detalle (para mostrarlo tal cual) si algo no cierra.
export function limpiarPreguntas(crudo) {
  if (!Array.isArray(crudo) || !crudo.length) throw error('La encuesta necesita al menos una pregunta.')
  if (crudo.length > 60) throw error('Son demasiadas preguntas: el máximo es 60.')
  const claves = new Set()
  const res = crudo.map((p, i) => {
    const n = i + 1
    const clave = String(p?.clave || '')
    if (!/^[a-z0-9_]{1,40}$/.test(clave)) throw error(`La pregunta ${n} no tiene una clave válida.`)
    if (claves.has(clave)) throw error(`La pregunta ${n} repite la clave "${clave}".`)
    claves.add(clave)
    const texto = String(p?.texto || '').trim()
    if (!texto) throw error(`La pregunta ${n} no tiene texto.`)
    if (texto.length > 300) throw error(`La pregunta ${n} es demasiado larga.`)
    if (!TIPOS_POR_VALUE[p?.tipo]) throw error(`La pregunta ${n} no tiene un tipo de respuesta válido.`)
    const bloque = String(p?.bloque || '').trim().slice(0, 60) || 'Preguntas'
    const limpia = normalizar({ ...p, clave, texto, bloque })
    if (p.tipo === 'opciones') {
      const opciones = (Array.isArray(p.opciones) ? p.opciones : [])
        .map((o) => String(o || '').trim().slice(0, 80)).filter(Boolean)
      if (opciones.length < 2) throw error(`La pregunta ${n} necesita al menos dos opciones.`)
      if (opciones.length > 8) throw error(`La pregunta ${n} tiene demasiadas opciones (máximo 8).`)
      limpia.opciones = opciones
    }
    return limpia
  })
  // Un solo segmento: es el que separa los resultados (años en el club)
  let segmentos = 0
  for (const p of res) if (p.segmento && ++segmentos > 1) p.segmento = false
  // Las preguntas de una misma parte quedan juntas (ver agruparPorBloque)
  return agruparPorBloque(res)
}

// Las preguntas agrupadas por bloque, en el orden en que aparece cada bloque.
// Es como se pasa de pantalla en la encuesta de los chicos.
export function bloquesDe(preguntas) {
  const bloques = []
  for (const p of preguntas) {
    let b = bloques.find((x) => x.nombre === p.bloque)
    if (!b) bloques.push(b = { nombre: p.bloque, preguntas: [] })
    b.preguntas.push(p)
  }
  return bloques
}

// ¿Esta respuesta vale para esta pregunta? (undefined/'' = sin contestar)
export function respuestaValida(p, v) {
  if (v === undefined || v === null || v === '') return false
  if (p.tipo === 'abierta') return typeof v === 'string' && v.trim().length > 0
  return opcionesDe(p).some((o) => o.value === v)
}

// Normaliza lo que manda el chico: se queda solo con respuestas válidas a
// preguntas de la encuesta, corta los textos libres y exige las obligatorias.
export function validarRespuestas(preguntas, crudo) {
  const res = {}
  const faltan = []
  for (const p of preguntas) {
    let v = crudo?.[p.clave]
    if (p.tipo === 'abierta' && typeof v === 'string') v = v.trim().slice(0, LARGO_TEXTO_LIBRE)
    if (respuestaValida(p, v)) res[p.clave] = v
    else if (p.obligatoria) faltan.push(p.clave)
  }
  if (faltan.length) throw { codigo: 400, error: 'faltan_respuestas', detalle: faltan.join(',') }
  return res
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
const pct = (parte, total) => (total ? Math.round((100 * parte) / total) : null)
const promedio = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null)
const redondear = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)

// Una pregunta resumida sobre un conjunto de respuestas
function resumirPregunta(p, respuestas) {
  const valores = respuestas.map((r) => r[p.clave]).filter((v) => respuestaValida(p, v))
  const base = {
    clave: p.clave, texto: p.texto, bloque: p.bloque, tipo: p.tipo,
    negativa: p.negativa, segmento: p.segmento, n: valores.length,
  }
  if (p.tipo === 'abierta') {
    // Ordenadas alfabéticamente: el orden de llegada no tiene que poder
    // leerse en ningún lado
    return { ...base, textos: [...valores].sort((a, b) => a.localeCompare(b, 'es')) }
  }
  const opciones = opcionesDe(p).map((o) => {
    const cantidad = valores.filter((v) => v === o.value).length
    return { value: o.value, label: o.label, cara: o.cara, favorable: o.favorable, cantidad, pct: pct(cantidad, valores.length) }
  })
  const res = { ...base, opciones }
  if (TIPOS_CON_INDICE.includes(p.tipo)) {
    res.favorable = pct(opciones.filter((o) => o.favorable).reduce((n, o) => n + o.cantidad, 0), valores.length)
  }
  if (p.tipo === 'nota') {
    res.promedio = redondear(promedio(valores), 1)
    res.favorable = pct(valores.filter((v) => v >= 7).length, valores.length)
  }
  if (p.tipo === 'frecuencia') res.promedio = redondear(promedio(valores), 2)
  return res
}

// Índice: el promedio del porcentaje favorable de las preguntas cerradas
// con lado bueno. Un número de 0 a 100 para comparar bloques y años.
function indiceDe(resumenes) {
  const v = resumenes.filter((r) => TIPOS_CON_INDICE.includes(r.tipo) && r.favorable != null).map((r) => r.favorable)
  return v.length ? Math.round(promedio(v)) : null
}

// El resumen completo de una encuesta: por pregunta, por bloque, el índice
// general y los cortes por segmento. Con menos de MINIMO_RESPUESTAS no
// devuelve resultados, solo la cantidad. `anterior` (otra encuesta ya
// resumida) agrega la variación por clave.
export function resumirEncuesta(preguntas, respuestas, anterior = null) {
  const n = respuestas.length
  if (n < MINIMO_RESPUESTAS) return { respuestas: n, suficientes: false }
  const porPregunta = preguntas.map((p) => resumirPregunta(p, respuestas))
  const previa = anterior?.suficientes
    ? Object.fromEntries(anterior.preguntas.map((r) => [r.clave, r]))
    : {}
  for (const r of porPregunta) {
    const a = previa[r.clave]
    if (a && a.tipo === r.tipo && r.favorable != null && a.favorable != null) {
      r.favorable_anterior = a.favorable
      r.variacion = r.favorable - a.favorable
    }
  }
  const bloques = bloquesDe(preguntas)
    .map((b) => ({
      nombre: b.nombre,
      indice: indiceDe(porPregunta.filter((r) => r.bloque === b.nombre)),
    }))
    .filter((b) => b.indice != null)
  const nota = porPregunta.find((r) => r.tipo === 'nota')

  // Cortes por segmento (años en el club): solo los grupos con suficientes
  // respuestas, y solo el índice y la nota, para no abrir de más
  const seg = preguntas.find((p) => p.segmento)
  const segmentos = seg
    ? opcionesDe(seg).map((o) => {
      const grupo = respuestas.filter((r) => r[seg.clave] === o.value)
      if (grupo.length < MINIMO_RESPUESTAS) return { label: o.label, respuestas: grupo.length, suficientes: false }
      const res = preguntas.map((p) => resumirPregunta(p, grupo))
      return {
        label: o.label, respuestas: grupo.length, suficientes: true,
        indice: indiceDe(res),
        nota: nota ? res.find((r) => r.clave === nota.clave)?.promedio ?? null : null,
      }
    })
    : []

  const indice = indiceDe(porPregunta)
  return {
    respuestas: n,
    suficientes: true,
    indice,
    indice_anterior: anterior?.suficientes ? anterior.indice : null,
    nota: nota ? { texto: nota.texto, promedio: nota.promedio, anterior: previa[nota.clave]?.promedio ?? null } : null,
    bloques,
    preguntas: porPregunta,
    segmento: seg ? seg.texto : null,
    segmentos,
  }
}

// Las preguntas con menos respuestas favorables: lo primero para mirar
export function puntosBajos(resumen, cuantos = 5) {
  if (!resumen?.suficientes) return []
  return resumen.preguntas
    .filter((r) => r.favorable != null && r.tipo !== 'nota')
    .sort((a, b) => a.favorable - b.favorable)
    .slice(0, cuantos)
}

// ---------------------------------------------------------------------------
// Análisis automático de una encuesta cerrada
//
// Reglas simples y explicables sobre el resumen (resumirEncuesta), para que
// el reporte no sea solo números: la lectura general, lo más fuerte y lo más
// flojo, las alertas de cuidado, lo que cambió contra la encuesta anterior y
// sugerencias para conversar en el staff. Las alertas y sugerencias miran las
// preguntas de siempre por su clave; las preguntas nuevas entran en el resto
// del análisis pero no tienen una sugerencia propia.
// ---------------------------------------------------------------------------

// Umbrales del porcentaje favorable
export const FAVORABLE_BUENO = 75
export const FAVORABLE_FLOJO = 60
// Una variación contra la encuesta anterior que vale la pena nombrar
const VARIACION_NOTABLE = 10

// Sugerencias para cuando una de las preguntas de siempre sale floja. Son
// puntos de partida para la charla del staff, no recetas.
const SUGERENCIAS = {
  divierte_entrenamientos: 'Revisar la dinámica de los entrenamientos: más juego con pelota, menos tiempo esperando en fila y consignas cortas.',
  divierte_partidos: 'Mirar cómo se viven los días de partido: la espera entre tiempos, la rotación y el clima en el banco.',
  ganas: 'Buscar qué apaga las ganas de venir: horarios, el grupo o la propuesta. Vale preguntarlo en una charla corta con ellos.',
  aprendi: 'Revisar la planificación técnica: objetivos claros por mes y una devolución individual a cada chico de qué mejoró.',
  explican: 'Acordar que cada corrección diga qué hacer y no solo qué estuvo mal, y reservar un momento del entrenamiento para devoluciones.',
  sin_gritos: 'Acordar en el staff una forma común de corregir: en voz normal, cerca del chico y diciendo qué hacer.',
  trato_igual: 'Repartir la atención: que cada entrenador tenga un grupo chico de jugadores a cargo para seguirlos de cerca.',
  juego_suficiente: 'Contarles a los chicos cómo se reparten los tiempos y verificar la equidad real en el informe de gestión.',
  se_dan_cuenta: 'Sumar un saludo y una pregunta corta a cada chico al llegar: es la forma más simple de notar cómo está.',
  adulto_confianza: 'Presentar a los chicos un adulto de referencia claro y recordarles seguido que pueden hablar con él.',
  parte_equipo: 'Trabajar la integración del grupo: actividades que mezclen y atención a los que quedan aislados.',
  companeros: 'Prestar atención al trato entre ellos en los momentos sin adultos cerca: vestuario, viajes, tercer tiempo.',
  molestaron: 'Hablar de las burlas con el grupo y estar atentos a quién queda afuera. Si hace falta, sumar al referente de protección del club.',
  seguro_contacto: 'Reforzar las progresiones de contacto por niveles, sin apurar a los que todavía no están seguros.',
  cuidan_golpe: 'Tener un protocolo visible ante golpes: quién atiende, cuándo se avisa a la familia y cuándo vuelve a jugar.',
  aviso_tiempo: 'Avisar el cronograma con más anticipación y por un solo canal fijo.',
}

const cantidadDe = (r, ...valores) => (r?.opciones || [])
  .filter((o) => valores.includes(o.value)).reduce((n, o) => n + o.cantidad, 0)

function nivelDelIndice(indice) {
  if (indice == null) return null
  if (indice >= 75) return 'muy bueno'
  if (indice >= 60) return 'bueno, con aspectos para mejorar'
  if (indice >= 45) return 'intermedio: hay varios aspectos para trabajar'
  return 'preocupante: conviene revisarlo con el staff'
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// `extra`: { links, respondieron, pedidos, pedidos_pendientes } de la encuesta
export function analizarEncuesta(r, extra = {}) {
  if (!r?.suficientes) return null
  const porClave = Object.fromEntries(r.preguntas.map((p) => [p.clave, p]))
  const cerradas = r.preguntas.filter((p) => p.favorable != null && p.tipo !== 'nota' && !p.segmento)
  const lectura = []
  const alertas = []

  // Participación
  const participacion = extra.links ? Math.round((100 * (extra.respondieron ?? r.respuestas)) / extra.links) : null
  if (participacion != null) {
    lectura.push(participacion >= 70
      ? `Contestó el ${participacion}% del plantel: los resultados representan bien al grupo.`
      : `Contestó el ${participacion}% del plantel: los resultados hay que leerlos con cuidado, porque falta la mirada de muchos chicos.`)
  }

  // Índice y nota
  const nivel = nivelDelIndice(r.indice)
  if (nivel) {
    let frase = `El índice general es ${r.indice} sobre 100: ${nivel}.`
    if (r.indice_anterior != null) {
      const d = r.indice - r.indice_anterior
      frase += d === 0 ? ' Igual que en la encuesta anterior.'
        : ` ${d > 0 ? 'Subió' : 'Bajó'} ${Math.abs(d)} ${Math.abs(d) === 1 ? 'punto' : 'puntos'} contra la encuesta anterior.`
    }
    lectura.push(frase)
  }
  if (r.nota?.promedio != null) {
    const n = r.nota.promedio
    let frase = `Le ponen al año un ${String(n.toFixed(1)).replace('.', ',')} de nota promedio.`
    if (r.nota.anterior != null) frase += ` La vez anterior fue ${String(r.nota.anterior.toFixed(1)).replace('.', ',')}.`
    lectura.push(frase)
  }

  // Partes: la mejor y la más floja
  if (r.bloques.length > 1) {
    const orden = [...r.bloques].sort((a, b) => b.indice - a.indice)
    const mejor = orden[0]
    const peor = orden[orden.length - 1]
    if (mejor.indice !== peor.indice) {
      lectura.push(`Lo mejor valorado es "${mejor.nombre}" (${mejor.indice}) y lo más flojo, "${peor.nombre}" (${peor.indice}).`)
    }
  }

  // Segmentos: si un grupo queda claramente por debajo
  const segs = r.segmentos.filter((s) => s.suficientes && s.indice != null)
  if (segs.length > 1) {
    const orden = [...segs].sort((a, b) => a.indice - b.indice)
    const bajo = orden[0]
    const alto = orden[orden.length - 1]
    if (alto.indice - bajo.indice >= VARIACION_NOTABLE) {
      lectura.push(`Por años en el club, "${bajo.label}" queda ${alto.indice - bajo.indice} puntos por debajo de "${alto.label}".`)
    }
  }

  // Alertas de cuidado: cantidades, porque un solo chico ya importa
  const seguir = porClave.seguir
  if (seguir?.tipo === 'si_nose_no') {
    const dudan = cantidadDe(seguir, 'no', 'nose')
    if (dudan) {
      alertas.push(`${plural(dudan, 'chico no está seguro', 'chicos no están seguros')} de seguir el año que viene ` +
        `(${cantidadDe(seguir, 'no')} dice que no y ${cantidadDe(seguir, 'nose')} que no sabe). Es el principal riesgo de abandono.`)
    }
  }
  // Cada alerta en singular y en plural: "1 chico siente que no tiene",
  // "4 chicos sienten que no tienen"
  const alerta = (n, uno, varios) => { if (n) alertas.push(n === 1 ? `1 chico ${uno}` : `${n} chicos ${varios}`) }
  const molestaron = porClave.molestaron
  if (molestaron?.tipo === 'si_no') {
    alerta(cantidadDe(molestaron, molestaron.negativa ? 'si' : 'no'),
      'dice que este año alguien del equipo se burló de él o lo molestó seguido.',
      'dicen que este año alguien del equipo se burló de ellos o los molestó seguido.')
  }
  const adulto = porClave.adulto_confianza
  if (adulto?.tipo === 'si_no') {
    alerta(cantidadDe(adulto, 'no'),
      'siente que no tiene un adulto del club con quien hablar si le pasa algo.',
      'sienten que no tienen un adulto del club con quien hablar si les pasa algo.')
  }
  const gritos = porClave.sin_gritos
  if (gritos?.tipo === 'frecuencia') {
    alerta(cantidadDe(gritos, 1),
      'contesta "nunca" a que lo corrigen sin gritarle.',
      'contestan "nunca" a que los corrigen sin gritarles.')
  }
  const contacto = porClave.seguro_contacto
  if (contacto?.tipo === 'frecuencia') {
    alerta(cantidadDe(contacto, 1),
      'dice que nunca se siente seguro en el contacto y el tackle.',
      'dicen que nunca se sienten seguros en el contacto y el tackle.')
  }
  if (extra.pedidos) {
    alertas.push(`${plural(extra.pedidos, 'chico pidió', 'chicos pidieron')} que alguien del club hable con ${extra.pedidos === 1 ? 'él' : 'ellos'}` +
      `${extra.pedidos_pendientes ? `: ${extra.pedidos_pendientes} sin atender todavía` : ', y ya se atendieron'}.`)
  }

  // Fortalezas y aspectos a mejorar
  const orden = [...cerradas].sort((a, b) => b.favorable - a.favorable)
  const fortalezas = orden.filter((p) => p.favorable >= FAVORABLE_BUENO).slice(0, 4)
  const aMejorar = orden.filter((p) => p.favorable < FAVORABLE_FLOJO).reverse().slice(0, 4)

  // Cambios contra la encuesta anterior
  const cambios = r.preguntas
    .filter((p) => p.tipo !== 'nota' && p.variacion != null && Math.abs(p.variacion) >= VARIACION_NOTABLE)
    .sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))
  const mejoras = cambios.filter((p) => p.variacion > 0).slice(0, 4)
  const caidas = cambios.filter((p) => p.variacion < 0).slice(0, 4)

  // Sugerencias: las de las preguntas flojas, y la de seguir si muchos dudan
  const sugerencias = []
  for (const p of [...cerradas].sort((a, b) => a.favorable - b.favorable)) {
    if (p.favorable >= FAVORABLE_FLOJO || !SUGERENCIAS[p.clave]) continue
    sugerencias.push({ pregunta: p.texto, favorable: p.favorable, sugerencia: SUGERENCIAS[p.clave] })
  }
  if (seguir?.tipo === 'si_nose_no' && seguir.n && cantidadDe(seguir, 'no', 'nose') / seguir.n >= 0.2) {
    sugerencias.push({
      pregunta: seguir.texto, favorable: seguir.favorable,
      sugerencia: 'Antes de la reinscripción, contactar a las familias para conocer los motivos y qué los haría quedarse.',
    })
  }

  return { participacion, lectura, alertas, fortalezas, aMejorar, mejoras, caidas, sugerencias }
}

// Cómo nombrar una pregunta en las listas del análisis. En las preguntas en
// negativo lo favorable es el "no": dicho así se entiende que "me molestaron"
// esté entre lo más fuerte.
export const textoEnLista = (p) => (p.negativa ? `Dicen que no: ${p.texto}` : p.texto)

// ---------------------------------------------------------------------------
// Orden de las preguntas por parte (para el editor)
//
// En la encuesta, cada parte es una pantalla, y el editor muestra las
// preguntas en el orden en que están guardadas. Para que una parte no quede
// partida en dos tramos, sus preguntas van siempre juntas.
// ---------------------------------------------------------------------------

// Junta las preguntas de cada parte, respetando el orden en que aparece cada
// parte y el de las preguntas dentro de ella
export function agruparPorBloque(preguntas) {
  return bloquesDe(preguntas).flatMap((b) => b.preguntas)
}

// Pone la pregunta al final de su parte. Si la parte todavía no existe, queda
// al final de la encuesta, como parte nueva.
export function insertarEnBloque(preguntas, pregunta) {
  let ultima = -1
  preguntas.forEach((p, i) => { if (p.bloque === pregunta.bloque) ultima = i })
  if (ultima === -1) return [...preguntas, pregunta]
  return [...preguntas.slice(0, ultima + 1), pregunta, ...preguntas.slice(ultima + 1)]
}

// Reemplaza la pregunta del lugar `indice`. Si cambió de parte, la lleva al
// final de la nueva; si no, queda donde estaba.
export function reemplazarPregunta(preguntas, indice, pregunta) {
  if (preguntas[indice]?.bloque === pregunta.bloque) {
    return preguntas.map((p, i) => (i === indice ? pregunta : p))
  }
  return insertarEnBloque(preguntas.filter((_, i) => i !== indice), pregunta)
}

// Cambia el nombre de una parte en todas sus preguntas. Si el nombre nuevo
// ya era el de otra parte, las dos se juntan en la que aparece primero.
export function renombrarBloque(preguntas, viejo, nuevo) {
  const nombre = String(nuevo || '').trim().slice(0, 60)
  if (!nombre) throw { codigo: 400, error: 'nombre_vacio', detalle: 'La parte necesita un nombre.' }
  return agruparPorBloque(preguntas.map((p) => (p.bloque === viejo ? { ...p, bloque: nombre } : p)))
}
