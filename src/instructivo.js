// Instructivo de uso de la app (se abre desde la franja de la versión de
// prueba, en #/instructivo). Es parte del código: sale en cada deploy junto
// con la app, así que siempre corresponde a la versión que está andando.
//
// MANTENERLO AL DÍA: cada cambio que sume, saque o mueva algo que el usuario
// ve (una pantalla, un botón, una solapa, un permiso) actualiza la sección
// que corresponde. Conciso: qué es, dónde está y cómo se usa.
//
// Formato: secciones con `id`, `titulo`, `ico`, una `intro` opcional y
// `items` (cada uno { t: título, d: texto } o { pasos: [...] }). Sin DOM: lo
// dibuja src/pages/Instructivo.jsx.

export const SECCIONES = [
  {
    id: 'empezar',
    ico: '🚀',
    titulo: 'Para empezar',
    items: [
      { t: 'Ingreso', d: 'Entrás con tu email y contraseña. La primera vez, con el email con el que te invitaron, la app te pide crear la contraseña. No hay registro abierto: solo entra quien el staff sumó.' },
      { t: 'En el celular', d: 'Funciona en el navegador, pero conviene agregarla a la pantalla de inicio (en Chrome: menú ⋮ → "Agregar a la pantalla principal"; en iPhone: Compartir → "Agregar a inicio"). Queda como una app más.' },
      { t: 'Menú', d: 'Abajo están las secciones: Jugadores, Entrenamientos, Partidos, Viajes y encuentros y Staff. La app recuerda dónde estabas aunque la cierres, y "atrás" del celular vuelve a la pantalla anterior.' },
      { t: 'Quién ve qué', d: 'Entrenadores, PF y cabeza de división ven todo lo deportivo. Los managers (que suelen ser padres) ven solo lo administrativo: padrón, convocatoria, viajes y avisos. Algunas cosas (informe, encuesta, exportar evaluaciones, sumar gente al staff) son solo de la cabeza de división.' },
    ],
  },
  {
    id: 'jugadores',
    ico: '👥',
    titulo: 'Jugadores',
    intro: 'El plantel, con el porcentaje de asistencia de cada chico.',
    items: [
      { t: 'Tarjetas de arriba', d: 'Avisos que se abren con un toque: chicos que vienen faltando seguido, golpes y lesiones por revisar, los que están en recuperación, evaluaciones que te tocan, el avance del proceso de evaluación y los cumpleaños de los próximos días. Cerradas, el título ya dice lo importante.' },
      { t: 'Listado y filtros', d: 'Buscá por nombre, apellido o DNI. Filtros: Activos, Inhabilitados (ficha médica vencida o sin cargar), Lesionados, Inactivos (dados de baja) y Todos.' },
      { t: 'Ficha del jugador', d: 'Tocá un chico para ver todo: datos, puestos, asistencia, evaluaciones, notas de seguimiento, lesiones, tests físicos, capitanías y golpes en la cancha. Desde ahí se edita, se evalúa ("+ Evaluar") y se carga una lesión.' },
      { t: 'Evaluaciones', d: 'Una mirada de 1 a 5 por variable (técnica, táctica, física, actitud y lo social), siempre relativa a la edad. La cabeza de división reparte quién evalúa a quién; con revisión cruzada, un segundo entrenador puntúa sin ver la primera nota y la app marca dónde no coinciden.' },
      { t: 'Boletines', d: 'Una hoja A4 por chico y por mes, en PDF: asistencia, comparación con la división, distinciones, tests del mes y dos objetivos para practicar. Nunca muestra notas de evaluación: es para el chico y su familia.' },
      { t: 'Dónde viven', d: 'Mapa con el barrio o la localidad de cada chico (nunca el domicilio), pooles para compartir viajes y, para el staff, la asistencia según la distancia al club. Un barrio nuevo se ubica una sola vez desde "Sin ubicar".' },
      { t: 'Otros botones', d: '"+ Nuevo" suma un chico; "Importar lista" carga varios de una; "⬇ Evaluaciones" baja todas las evaluaciones en una planilla que abre el Excel (solo cabeza de división).' },
    ],
  },
  {
    id: 'entrenamientos',
    ico: '📋',
    titulo: 'Entrenamientos',
    intro: 'Cada entrenamiento con su asistencia y lo que se trabajó.',
    items: [
      { t: 'Inicio', d: 'Dos gráficos plegables: la asistencia evento por evento en el año y "Qué se viene entrenando" (minutos por aspecto técnico, con los que hace más de tres semanas que no se tocan marcados).' },
      { t: 'Cargar uno', d: '"+ Nuevo entrenamiento" (rutina o extra). Los de rutina son lunes y miércoles; un entrenamiento se puede suspender por clima o feriado y no cuenta para nadie.' },
      { pasos: [
        '📋 Asist.: marcá presente o ausente a cada chico (y si se golpeó). El plantel del día queda congelado: los que llegan después no cuentan como faltas hacia atrás.',
        '🏉 Técnica: qué aspectos se trabajaron y cuántos minutos.',
        '🏃 Físico: la planilla del PF de la primera media hora (variables, minutos e intensidad).',
        '⏱ Tests: las mediciones del día (salto, velocidad 20 m, resistencia, peso y talla), con semáforo automático.',
      ] },
      { t: 'Reportes', d: '"📊 Física" resume el trabajo físico de un período; "📈 Tests" muestra la evolución de cada chico y baja todo en Excel; "Resumen CSV" exporta la asistencia.' },
      { t: 'Cómo se cuenta la asistencia', d: 'Un evento le cuenta a un chico solo si ya estaba en el plantel ese día y no estaba lesionado. El que vino cuenta siempre.' },
    ],
  },
  {
    id: 'partidos',
    ico: '🏉',
    titulo: 'Partidos',
    intro: 'Las solapas siguen el orden del proceso, de la semana a la cancha:',
    items: [
      { pasos: [
        '📣 Convocatoria: en la semana se marca quién va y quién no (los managers también pueden marcarlo).',
        'Armar bloques: los convocados se reparten en bloques (normalmente dos, cada uno con su rival, cancha, horario y staff). La app sugiere un reparto parejo de forwards y backs. De acá sale el manifiesto para el micro, un PDF por bloque con los DNI.',
        '✅ Tomar asistencia: el día del partido, quién llegó, quién llegó tarde y quién se golpeó.',
        'Bloque 1, Bloque 2…: el equipo de cada tiempo, con la formación de 13 y los puestos. La app sugiere quién entra para que todos jueguen parecido. Se elige el capitán, se cierra cada tiempo y al final el bloque, con su valoración y una crónica.',
        '🖨 Planilla: la hoja para imprimir o compartir.',
      ] },
      { t: 'Lista de partidos', d: '"☰ Listado de partidos" muestra todos; "+ Nuevo partido" carga uno. La pantalla se actualiza sola mientras otros cargan desde sus celulares.' },
      { t: 'Encuentros', d: 'El partido de un encuentro se arma igual, pero quiénes van se marca desde Viajes y encuentros (es la lista de inscriptos).' },
    ],
  },
  {
    id: 'viajes',
    ico: '🚌',
    titulo: 'Viajes y encuentros',
    items: [
      { t: 'Giras', d: 'Viajes a otras provincias. Solapas: Jugadores (quiénes van), Alojados (cada casa de familia del club anfitrión con sus datos y los chicos que recibe; se imprime en PDF), Managers (papeles de cada chico —autorización, copia y devolución del DNI—, pagos y observaciones para la casa) y Datos (fechas, destino, precio y cuotas).' },
      { t: 'Encuentros', d: 'Un día en otro club contra varios rivales, con inscripción por chico. Solapas: Jugadores, Inscripción (el "pagó" es de un toque) y Datos. Al crearlo nace solo su partido en la sección Partidos.' },
      { t: 'Pagos', d: 'Cada pago se registra aparte (seña, cuotas) y la app suma lo cobrado y lo que falta.' },
    ],
  },
  {
    id: 'staff',
    ico: '🧑‍🏫',
    titulo: 'Staff',
    items: [
      { t: 'Avisos en este celular', d: 'Activalos para recibir notificaciones: cumpleaños, evaluaciones, boletines del mes y respuestas de la encuesta. En iPhone llegan solo si la app está agregada a la pantalla de inicio.' },
      { t: 'Sumar gente', d: 'La cabeza de división agrega a alguien con su email y su rol. Esa persona entra con su email y crea la contraseña. Cambiar el rol o quitar a alguien corta su acceso al instante.' },
      { t: '📊 Informe de gestión', d: 'Todos los números de la división en un período (plantel, asistencia, staff, evaluaciones, lo entrenado, tests, lesiones, partidos, viajes), comparados con el período anterior, en PDF. Solo cabeza de división.' },
      { t: '📝 Encuesta a los jugadores', d: 'Anónima, con un link personal por chico que se manda por WhatsApp y se contesta sin usuario. Las preguntas se pueden editar hasta la primera respuesta. Los resultados, con un análisis automático, se ven recién al cerrarla y con al menos 5 respuestas. Solo cabeza de división.' },
    ],
  },
  {
    id: 'managers',
    ico: '🗂️',
    titulo: 'Si sos manager',
    items: [
      { t: 'Padrón', d: 'Los datos administrativos de los chicos: DNI (y su escaneo), fecha de nacimiento, tutor y teléfono, ficha médica y barrio.' },
      { t: 'Partidos', d: 'Solo la convocatoria: marcar quién va y quién no en la semana.' },
      { t: 'Viajes y encuentros', d: 'Crear encuentros, armar giras, alojamientos, papeles y pagos.' },
      { t: 'Lo que no ves', d: 'Asistencia, evaluaciones, entrenamientos, lesiones, tests ni boletines: es información deportiva del cuerpo técnico.' },
    ],
  },
]

// Solo en la versión de prueba
export const SECCION_DEMO = {
  id: 'prueba',
  ico: '🧪',
  titulo: 'Sobre esta versión de prueba',
  items: [
    { t: 'Datos ficticios', d: 'Todos los chicos, el staff y los números son inventados. Podés cargar, editar y borrar lo que quieras: no afecta a ningún club.' },
    { t: 'Para recorrerla', d: 'Probá abrir la ficha de un chico, un partido ya jugado (sus bloques y tiempos), un boletín del mes pasado, el mapa de "Dónde viven", la gira de fin de año y, si tenés rol de cabeza de división, el informe de gestión y los resultados de la encuesta de mitad de año.' },
    { t: 'Tu rol', d: 'Lo que ves depende del rol con el que te invitaron. Si querés probar otro, pedíselo a quien te invitó.' },
  ],
}
