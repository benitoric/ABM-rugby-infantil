// Trabajo físico específico de la primera media hora del entrenamiento.
//
// El PF anota qué variables trabajó ese día, cuántos minutos le dedicó a cada
// una y con qué intensidad. Es la planilla del PF, distinta de los tests
// físicos (src/tests.js): allá se mide al jugador, acá se registra lo que se
// entrenó. Por eso el registro es del entrenamiento, no de cada chico.
//
// Los grupos y las variables salen de la planilla que ya usa el cuerpo
// técnico, respetando su orden.

export const GRUPOS_FISICOS = [
  {
    value: 'capacidades',
    label: 'Capacidades físicas',
    variables: [
      { value: 'carrera', label: 'Carrera' },
      { value: 'velocidad', label: 'Velocidad' },
      { value: 'fuerza', label: 'Fuerza' },
    ],
  },
  {
    value: 'coordinativas',
    label: 'Coordinativas',
    variables: [
      { value: 'equilibrio', label: 'Equilibrio' },
      { value: 'postura', label: 'Postura' },
      { value: 'salto', label: 'Salto' },
    ],
  },
  {
    value: 'aplicacion',
    label: 'Aplicación',
    variables: [
      { value: 'circuito', label: 'Trabajo en circuito' },
      { value: 'fisico_tactico', label: 'Físico táctico' },
    ],
  },
]

// Mapa plano variable → { ...variable, grupo, grupoLabel }
export const VARIABLES_FISICAS = {}
for (const g of GRUPOS_FISICOS) {
  for (const v of g.variables) {
    VARIABLES_FISICAS[v.value] = { ...v, grupo: g.value, grupoLabel: g.label }
  }
}

export const CLAVES_FISICAS = Object.keys(VARIABLES_FISICAS)

// La misma escala sirve para la intensidad de cada variable y para la carga
// general de la sesión: es la que ya usa la planilla en papel.
export const INTENSIDADES = [
  { value: 'baja', label: 'Baja', abrev: 'B' },
  { value: 'media', label: 'Media', abrev: 'M' },
  { value: 'alta', label: 'Alta', abrev: 'A' },
]

export const CLAVES_INTENSIDAD = INTENSIDADES.map((i) => i.value)

export const intensidad = (v) => INTENSIDADES.find((i) => i.value === v) || null

// Duración de referencia del bloque físico: la primera media hora del
// entrenamiento. No es un tope, solo el número contra el que se compara.
export const MINUTOS_BLOQUE = 30

// Tope defensivo: un entrenamiento entero dura 90 minutos
export const MAX_MINUTOS = 180

// Total de minutos anotados en la sesión
export function minutosTotales(variables) {
  return Object.values(variables || {})
    .reduce((n, v) => n + (Number(v?.minutos) || 0), 0)
}

// Variables efectivamente trabajadas, en el orden de la planilla. Una variable
// cuenta como trabajada si tiene minutos o intensidad: el PF puede anotar
// "hicimos fuerza, fuerte" sin cronometrar, o los minutos sin ponerle color.
export function variablesTrabajadas(variables) {
  return CLAVES_FISICAS
    .filter((k) => variables?.[k]?.minutos || variables?.[k]?.intensidad)
    .map((k) => ({ ...VARIABLES_FISICAS[k], ...variables[k] }))
}

// Normaliza lo que viene del formulario: se queda con las variables que
// tienen algo cargado y descarta las vacías. Los valores fuera de rango los
// rechaza el router antes de llegar acá.
export function limpiarVariables(crudo) {
  const res = {}
  for (const k of CLAVES_FISICAS) {
    const v = crudo?.[k]
    if (!v) continue
    const n = Number(v.minutos)
    const minutos = Number.isInteger(n) && n > 0 && n <= MAX_MINUTOS ? n : null
    const inten = CLAVES_INTENSIDAD.includes(v.intensidad) ? v.intensidad : null
    if (minutos || inten) res[k] = { minutos, intensidad: inten }
  }
  return res
}
