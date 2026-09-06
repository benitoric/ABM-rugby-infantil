// Planificación técnica del entrenamiento: qué se trabaja ese día.
//
// Es la contracara de la planilla del PF (src/trabajoFisico.js): allá va la
// primera media hora de físico, acá la hora de técnica. El registro es del
// entrenamiento, no de cada jugador.
//
// Los aspectos fijos salen de la planilla del cuerpo técnico, en su orden. El
// staff puede sumar otros: esos se guardan en la tabla aspectos_tecnicos y
// quedan disponibles para los entrenamientos siguientes.

export const GRUPOS_TECNICOS = [
  {
    value: 'colectiva',
    label: 'Técnica colectiva',
    aspectos: [
      { value: 'org_ataque', label: 'Organización de ataque' },
      { value: 'org_defensa', label: 'Organización de defensa' },
      { value: 'posicionamiento_fijas', label: 'Posicionamiento formaciones fijas' },
      { value: 'scrum', label: 'Scrum' },
      { value: 'line', label: 'Line' },
      { value: 'puestos_roles', label: 'Desarrollo de puestos y roles' },
    ],
  },
  {
    value: 'individual',
    label: 'Técnica individual',
    aspectos: [
      { value: 'tackle', label: 'Tackle' },
      { value: 'duelo', label: 'Duelo' },
      { value: 'ruck', label: 'Ruck' },
      { value: 'pase', label: 'Pase' },
      { value: 'patada', label: 'Patada' },
      { value: 'evasion', label: 'Evasión' },
      { value: 'pase_contacto', label: 'Pase en el contacto' },
      { value: 'apoyo', label: 'Apoyo' },
    ],
  },
]

// Mapa plano clave → { ...aspecto, grupo, grupoLabel }
export const ASPECTOS_FIJOS = {}
for (const g of GRUPOS_TECNICOS) {
  for (const a of g.aspectos) {
    ASPECTOS_FIJOS[a.value] = { ...a, grupo: g.value, grupoLabel: g.label }
  }
}

export const CLAVES_FIJAS = Object.keys(ASPECTOS_FIJOS)
export const CLAVES_GRUPO = GRUPOS_TECNICOS.map((g) => g.value)

// La hora de técnica del entrenamiento: es el tiempo que se reparte entre los
// aspectos marcados cuando no se cargan minutos a mano.
export const MINUTOS_TECNICA = 60

// Tope defensivo: un entrenamiento entero dura 90 minutos
export const MAX_MINUTOS = 180

// Clave de un aspecto propio a partir de su nombre: sin acentos, en minúscula
// y con guiones bajos. El prefijo evita que choque con el catálogo fijo si
// alguien vuelve a cargar uno que ya existe con otro nombre.
export function claveAspecto(label) {
  const base = (label || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base ? `x_${base}` : ''
}

// Reparto de la hora de técnica. Los aspectos con minutos cargados a mano
// mandan; el resto se lleva en partes iguales lo que sobra. Devuelve, por
// clave, los minutos que le tocan y si son propios o repartidos.
export function repartirMinutos(aspectos) {
  const claves = Object.keys(aspectos || {})
  const conMinutos = claves.filter((k) => aspectos[k]?.minutos > 0)
  const sinMinutos = claves.filter((k) => !(aspectos[k]?.minutos > 0))
  const usados = conMinutos.reduce((n, k) => n + Number(aspectos[k].minutos), 0)
  const resto = Math.max(MINUTOS_TECNICA - usados, 0)
  const cada = sinMinutos.length ? Math.round(resto / sinMinutos.length) : 0
  const res = {}
  for (const k of claves) {
    const propios = aspectos[k]?.minutos > 0
    res[k] = { minutos: propios ? Number(aspectos[k].minutos) : cada, propios }
  }
  return res
}

export function minutosTotales(aspectos) {
  return Object.values(repartirMinutos(aspectos)).reduce((n, a) => n + a.minutos, 0)
}

// Un entrenamiento queda "sin planificación" cuando no se marcó ningún
// aspecto. Es la regla que aplican por igual la pantalla y el servidor.
export function sinPlanificacion(aspectos) {
  return Object.keys(aspectos || {}).length === 0
}

// Normaliza lo que viene del formulario contra el catálogo (fijos + propios):
// se queda con los aspectos marcados y sus minutos, si los tienen.
export function limpiarAspectos(crudo, clavesValidas) {
  const res = {}
  for (const [k, v] of Object.entries(crudo || {})) {
    if (!clavesValidas.includes(k)) continue
    const n = Number(v?.minutos)
    res[k] = { minutos: Number.isInteger(n) && n > 0 && n <= MAX_MINUTOS ? n : null }
  }
  return res
}
