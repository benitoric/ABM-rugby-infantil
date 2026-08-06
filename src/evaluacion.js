// Catálogo de la evaluación periódica de jugadores.
//
// Las variables son estables durante toda la vida formativa (4 a 19 años):
// lo que cambia con la edad es la guía de observación y qué variables están
// activas ("desde"). Basado en los modelos de desarrollo a largo plazo de
// World Rugby / IRFU y la metodología de rugby infantil de la UAR.
//
// La escala 1-5 se interpreta SIEMPRE relativa a la edad:
//   1 = recién inicia · 3 = acorde a su edad · 5 = sobresale para su edad

export const BANDAS = [
  { value: 'inicial', label: '4 a 6 años', hasta: 6 },
  { value: 'infantil', label: '7 a 12 años', hasta: 12 },
  { value: 'juvenil', label: '13 a 19 años', hasta: 99 },
]

export function bandaEtaria(edad) {
  // Sin fecha de nacimiento se asume la banda infantil (la división actual)
  if (edad == null) return 'infantil'
  return BANDAS.find((b) => edad <= b.hasta).value
}

export const AREAS_EVAL = [
  {
    value: 'tecnica',
    label: 'Técnica individual',
    variables: [
      {
        value: 'pase', label: 'Pase y recepción', desde: 4,
        guia: {
          inicial: 'Atrapa y suelta la pelota; pasa a un compañero cercano.',
          infantil: 'Pasa y recibe en movimiento, hacia ambos lados; el pase llega bien al receptor.',
          juvenil: 'Elige y ejecuta el pase correcto bajo presión, a ambos lados y a distintas distancias.',
        },
      },
      {
        value: 'carrera', label: 'Carrera con pelota', desde: 4,
        guia: {
          inicial: 'Corre con la pelota sin miedo, agarrada con las dos manos.',
          infantil: 'Corre derecho al espacio, protege la pelota y cambia de ritmo.',
          juvenil: 'Buenas líneas de carrera; elige cuándo acelerar y cómo atacar al defensor.',
        },
      },
      {
        value: 'evasion', label: 'Evasión', desde: 4,
        guia: {
          inicial: 'Esquiva rivales en los juegos de manchas y persecución.',
          infantil: 'Amaga y cambia de dirección para superar al rival.',
          juvenil: 'Pisada, amague de pase y uso del espacio para romper la línea.',
        },
      },
      {
        value: 'tackle', label: 'Tackle', desde: 8,
        guia: {
          infantil: 'Técnica segura: cabeza al costado, abraza a la cintura o menos y acompaña al suelo.',
          juvenil: 'Tackle efectivo desde distintos ángulos, con buen timing y recuperación rápida.',
        },
      },
      {
        value: 'contacto', label: 'Contacto y pelota al suelo', desde: 8,
        guia: {
          infantil: 'Cae bien, protege la pelota y la presenta tras el contacto.',
          juvenil: 'Ruck: llega primero, limpia y disputa la pelota dentro del reglamento.',
        },
      },
      {
        value: 'patada', label: 'Patada', desde: 10,
        guia: {
          infantil: 'Patea con intención y dirección en juegos y ejercicios.',
          juvenil: 'Usa la patada de despeje, táctica o al arco según la situación.',
        },
      },
    ],
  },
  {
    value: 'tactica',
    label: 'Comprensión de juego',
    variables: [
      {
        value: 'avance_apoyo', label: 'Avance y apoyo', desde: 4,
        guia: {
          inicial: 'Sigue la pelota y corre hacia adelante con sus compañeros.',
          infantil: 'Avanza con la pelota y apoya al portador cuando no la tiene.',
          juvenil: 'Da profundidad y ancho; elige cuándo penetrar y cuándo dar continuidad.',
        },
      },
      {
        value: 'decisiones', label: 'Toma de decisiones', desde: 7,
        guia: {
          infantil: 'Elige razonablemente cuándo pasar y cuándo correr.',
          juvenil: 'Decide rápido y bien bajo presión: pasar, correr o patear.',
        },
      },
      {
        value: 'lectura_espacio', label: 'Lectura del espacio', desde: 7,
        guia: {
          infantil: 'Encuentra los espacios libres para atacar.',
          juvenil: 'Lee la defensa, ataca los espacios y se reposiciona sin pelota.',
        },
      },
      {
        value: 'defensa', label: 'Organización defensiva', desde: 8,
        guia: {
          infantil: 'Vuelve a defender y ocupa su lugar en la línea.',
          juvenil: 'Se reorganiza rápido, sube en línea y achica junto con sus compañeros.',
        },
      },
      {
        value: 'comunicacion_juego', label: 'Comunicación en juego', desde: 7,
        guia: {
          infantil: 'Pide la pelota y avisa a sus compañeros.',
          juvenil: 'Comunica de forma constante y útil en ataque y en defensa.',
        },
      },
    ],
  },
  {
    value: 'fisica',
    label: 'Física',
    variables: [
      {
        value: 'coordinacion', label: 'Coordinación y motricidad', desde: 4,
        guia: {
          inicial: 'Corre, salta, rola, frena y gira con control (ABC del movimiento).',
          infantil: 'Buen equilibrio, saltos, giros y manejo de pelota en movimiento.',
          juvenil: 'Ejecuta movimientos complejos con fluidez; agilidad específica del puesto.',
        },
      },
      {
        value: 'velocidad', label: 'Velocidad', desde: 7,
        guia: {
          infantil: 'Es rápido en distancias cortas respecto de su grupo.',
          juvenil: 'Aceleración y velocidad máxima; mantiene la técnica de carrera.',
        },
      },
      {
        value: 'agilidad', label: 'Agilidad', desde: 7,
        guia: {
          infantil: 'Cambia de dirección con rapidez sin perder el control del cuerpo.',
          juvenil: 'Cambia de dirección a alta velocidad, con y sin pelota.',
        },
      },
      {
        value: 'resistencia', label: 'Resistencia', desde: 10,
        guia: {
          infantil: 'Sostiene el ritmo de juego durante todo el partido.',
          juvenil: 'Repite esfuerzos de alta intensidad con pausas cortas.',
        },
      },
      {
        value: 'fuerza', label: 'Fuerza y potencia', desde: 14,
        guia: {
          juvenil: 'Fuerza acorde a su desarrollo madurativo; técnica correcta en el gimnasio.',
        },
      },
    ],
  },
  {
    value: 'actitudinal',
    label: 'Actitudinal',
    variables: [
      {
        value: 'esfuerzo', label: 'Esfuerzo y perseverancia', desde: 4,
        guia: {
          inicial: 'Participa con ganas y no abandona los juegos.',
          infantil: 'Se esfuerza en cada actividad y persevera cuando algo le cuesta.',
          juvenil: 'Entrena al máximo de forma sostenida; trabaja específicamente lo que le cuesta.',
        },
      },
      {
        value: 'concentracion', label: 'Concentración y escucha', desde: 4,
        guia: {
          inicial: 'Escucha las consignas y las intenta.',
          infantil: 'Atiende las consignas y las mantiene durante la actividad.',
          juvenil: 'Se mantiene enfocado todo el entrenamiento o partido; incorpora consignas complejas.',
        },
      },
      {
        value: 'emociones', label: 'Manejo de las emociones', desde: 4,
        guia: {
          inicial: 'Tolera perder y equivocarse sin grandes enojos.',
          infantil: 'Maneja la frustración: sigue jugando después de un error o una derrota.',
          juvenil: 'Autocontrol bajo presión; canaliza los nervios y la frustración.',
        },
      },
      {
        value: 'confianza', label: 'Confianza e iniciativa', desde: 7,
        guia: {
          infantil: 'Se anima a intentar cosas nuevas en el juego.',
          juvenil: 'Toma iniciativa y pide responsabilidades en los momentos importantes.',
        },
      },
    ],
  },
  {
    value: 'social',
    label: 'Social',
    variables: [
      {
        value: 'companerismo', label: 'Compañerismo', desde: 4,
        guia: {
          inicial: 'Comparte, incluye y festeja con sus compañeros.',
          infantil: 'Incluye a todos, alienta y celebra los logros de los demás.',
          juvenil: 'Genera grupo: integra a los nuevos y sostiene a los que les cuesta.',
        },
      },
      {
        value: 'respeto', label: 'Respeto', desde: 4,
        guia: {
          inicial: 'Trata bien a compañeros, rivales y adultos.',
          infantil: 'Respeta rivales, referí y entrenadores dentro y fuera de la cancha.',
          juvenil: 'Es ejemplo de respeto por el juego, los rivales y las autoridades.',
        },
      },
      {
        value: 'responsabilidad', label: 'Responsabilidad', desde: 7,
        guia: {
          infantil: 'Cuida los materiales y cumple lo que se le pide.',
          juvenil: 'Asume sus errores, cumple compromisos y cuida al equipo y al club.',
        },
      },
      {
        value: 'liderazgo', label: 'Liderazgo', desde: 13,
        guia: {
          juvenil: 'Organiza, motiva y guía a sus compañeros con el ejemplo.',
        },
      },
    ],
  },
]

// Mapa plano variable → { ...variable, area, areaLabel }
export const VARIABLES_EVAL = {}
for (const a of AREAS_EVAL) {
  for (const v of a.variables) {
    VARIABLES_EVAL[v.value] = { ...v, area: a.value, areaLabel: a.label }
  }
}

// Áreas con las variables activas para una edad (edad null → banda infantil)
export function areasParaEdad(edad) {
  const edadRef = edad == null ? 12 : edad
  return AREAS_EVAL
    .map((a) => ({ ...a, variables: a.variables.filter((v) => edadRef >= v.desde) }))
    .filter((a) => a.variables.length > 0)
}

// Promedio general (1 decimal) de una evaluación: todas las variables
// cargadas pesan igual. Devuelve null si no hay ninguna.
export function promedioGeneral(valores) {
  const notas = Object.values(valores || {}).filter((n) => n >= 1)
  if (!notas.length) return null
  return Math.round((notas.reduce((x, y) => x + y, 0) / notas.length) * 10) / 10
}

// Promedio (1 decimal) por área de una evaluación guardada
export function promediosPorArea(valores) {
  const res = []
  for (const a of AREAS_EVAL) {
    const notas = a.variables.map((v) => valores?.[v.value]).filter((n) => n >= 1)
    if (notas.length) {
      res.push({ area: a.value, label: a.label, promedio: Math.round((notas.reduce((x, y) => x + y, 0) / notas.length) * 10) / 10 })
    }
  }
  return res
}
