// Objetivos del mes que salen en el boletín de cada jugador.
//
// El boletín NO muestra las evaluaciones: no salen notas, ni áreas, ni fechas.
// Lo único que viaja es qué dos cosas le vienen bien practicar, escritas como
// una invitación y en tono general — nunca como un señalamiento. El chico lee
// "para sumar este mes", no "acá estás flojo".
//
// Un texto por variable y banda etaria. La guía de src/evaluacion.js describe
// qué mira el evaluador; esto dice qué practicar, que es otra cosa.

const OBJETIVOS = {
  // --- técnica individual ---
  pase: {
    inicial: 'Jugar mucho a pasarse la pelota con las dos manos, sin que se caiga.',
    infantil: 'Pasar y recibir en movimiento, practicando también para el lado que menos usás.',
    juvenil: 'Pases a distintas distancias y con alguien encima, para los dos lados.',
  },
  carrera: {
    inicial: 'Correr con la pelota bien agarrada, sin mirarla.',
    infantil: 'Correr derecho al espacio libre y cambiar de ritmo cuando se abre.',
    juvenil: 'Elegir mejor la línea de carrera y atacar el hombro del defensor.',
  },
  evasion: {
    inicial: 'Los juegos de manchas son entrenamiento: esquivar todo lo que se pueda.',
    infantil: 'Amagar para un lado y salir para el otro antes de llegar al rival.',
    juvenil: 'Sumar recursos para romper la línea: pisada, amague de pase, cambio de ritmo.',
  },
  tackle: {
    infantil: 'Repasar la técnica del tackle con calma: cabeza al costado y abrazar fuerte.',
    juvenil: 'Tacklear desde distintos ángulos y levantarse rápido para seguir jugando.',
  },
  contacto: {
    infantil: 'Trabajar la pelota en el piso: llegar, apoyarse y protegerla.',
    juvenil: 'Ganar el segundo después del contacto: presentar la pelota rápido y limpio.',
  },
  patada: {
    infantil: 'Probar patadas cortas al espacio, sin apuro.',
    juvenil: 'Practicar la patada con precisión y elegir mejor cuándo conviene patear.',
  },

  // --- comprensión de juego ---
  avance_apoyo: {
    inicial: 'Seguir siempre a quien lleva la pelota, cerquita y atrás.',
    infantil: 'Acompañar la jugada aunque no tengas la pelota: el apoyo llega antes que el pase.',
    juvenil: 'Anticipar dónde va a hacer falta el apoyo y llegar antes.',
  },
  decisiones: {
    infantil: 'Levantar la cabeza antes de decidir: mirar primero, jugar después.',
    juvenil: 'Decidir más rápido con la información que hay: pasar, correr o patear.',
  },
  lectura_espacio: {
    infantil: 'Buscar el espacio libre en vez de correr hacia donde están todos.',
    juvenil: 'Leer cómo está parada la defensa y atacar donde está más floja.',
  },
  defensa: {
    infantil: 'En defensa, subir en línea con los compañeros y no dejar huecos.',
    juvenil: 'Ordenar la defensa: marcar al que te toca y ajustar los espacios.',
  },
  comunicacion_juego: {
    infantil: 'Hablar en la cancha: avisar a los compañeros lo que ves.',
    juvenil: 'Dar información útil y a tiempo, sobre todo en defensa.',
  },

  // --- física ---
  coordinacion: {
    inicial: 'Juegos de saltar, correr y atrapar: todo suma a la coordinación.',
    infantil: 'Ejercicios de coordinación con pelota, que cuesten un poco.',
    juvenil: 'Sumar trabajo de coordinación y control del cuerpo en el calentamiento.',
  },
  velocidad: {
    infantil: 'Piques cortos en los juegos: arrancar fuerte desde parado.',
    juvenil: 'Trabajar la aceleración en los primeros metros.',
  },
  agilidad: {
    infantil: 'Juegos de cambios de dirección rápidos, tipo las manchas.',
    juvenil: 'Cambios de dirección y frenadas a máxima velocidad.',
  },
  resistencia: {
    infantil: 'Moverse durante todo el entrenamiento, sin quedarse parado.',
    juvenil: 'Sostener la intensidad hasta el final del partido.',
  },
  fuerza: {
    juvenil: 'Sumar el trabajo de fuerza que indique el preparador físico.',
  },

  // --- actitudinal ---
  esfuerzo: {
    inicial: 'Intentar de nuevo cuando algo sale mal: así se aprende.',
    infantil: 'Sostener las ganas todo el entrenamiento, también cuando cuesta.',
    juvenil: 'Mantener el nivel de esfuerzo en los momentos difíciles del partido.',
  },
  concentracion: {
    inicial: 'Escuchar la consigna hasta el final antes de salir a jugar.',
    infantil: 'Estar atento en las explicaciones: se gana tiempo en la cancha.',
    juvenil: 'Sostener la concentración durante todo el partido.',
  },
  emociones: {
    inicial: 'Cuando algo sale mal, respirar y seguir jugando.',
    infantil: 'Dejar pasar el error y volver rápido a la jugada siguiente.',
    juvenil: 'Manejar la calentura en los momentos calientes del partido.',
  },
  confianza: {
    infantil: 'Animarse a pedir la pelota más seguido.',
    juvenil: 'Tomar la iniciativa cuando el partido lo pide.',
  },

  // --- social ---
  companerismo: {
    inicial: 'Jugar con todos los compañeros, no siempre con los mismos.',
    infantil: 'Dar una mano al que le está costando.',
    juvenil: 'Sumar a los más chicos del grupo.',
  },
  respeto: {
    inicial: 'Saludar al rival y escuchar al entrenador.',
    infantil: 'Respetar la decisión del árbitro aunque no te guste.',
    juvenil: 'Sostener el respeto al rival y al árbitro también cuando el partido se pone duro.',
  },
  responsabilidad: {
    infantil: 'Llegar a horario y con todo lo que hace falta para entrenar.',
    juvenil: 'Hacerte cargo de tus cosas y de los compromisos con el equipo.',
  },
  liderazgo: {
    juvenil: 'Dar el ejemplo y ayudar a ordenar al equipo en la cancha.',
  },
}

// Cuando está todo bien, no se inventan debilidades: se propone el paso
// siguiente sobre lo que ya hace bien.
const DESAFIOS = {
  tecnica: 'Seguir puliendo lo técnico: lo que ya te sale, más rápido y bajo presión.',
  tactica: 'Ayudar a ordenar al equipo en la cancha: ya leés bien el juego.',
  fisica: 'Sostener el trabajo físico: es lo que te deja jugar al 100% hasta el final.',
  actitudinal: 'Ser de los que tiran del equipo cuando el partido se complica.',
  social: 'Seguir siendo de los que suman al grupo.',
}

export function textoObjetivo(clave, banda) {
  const porBanda = OBJETIVOS[clave]
  if (!porBanda) return null
  // Si la variable no tiene texto para esa banda vale el de la más cercana
  const orden = { inicial: ['inicial', 'infantil', 'juvenil'],
    infantil: ['infantil', 'juvenil', 'inicial'],
    juvenil: ['juvenil', 'infantil', 'inicial'] }[banda] || ['infantil']
  for (const b of orden) if (porBanda[b]) return porBanda[b]
  return null
}

export const textoDesafio = (area) => DESAFIOS[area] || null
