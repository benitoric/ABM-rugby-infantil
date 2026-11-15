// Registro de actividad de los invitados en la versión de prueba (demo).
// Sin DOM: lo usan el servidor (server/actividad-demo.js, para describir cada
// escritura) y el frontend (para saber qué sección se abrió).
//
// Nunca guarda contenido: solo qué sección abrió alguien o qué tipo de acción
// hizo ("cargó una evaluación", sin las notas).

// Las secciones que se registran al abrirlas, con su nombre para mostrar
export const SECCIONES_ACTIVIDAD = {
  jugadores: 'Jugadores',
  entrenamientos: 'Entrenamientos',
  partidos: 'Partidos',
  viajes: 'Viajes y encuentros',
  staff: 'Staff',
  padron: 'Padrón',
  avisos: 'Avisos',
  zonas: 'Dónde viven',
  boletines: 'Boletines',
  informe: 'Informe de gestión',
  encuestas: 'Encuesta a los jugadores',
  instructivo: 'Instructivo',
}

// La sección de una posición de la app (los tramos del hash). Las pantallas
// con nombre propio dentro de una pestaña cuentan aparte.
export function seccionDeHash([tab, sub] = []) {
  if (!tab) return null
  if (sub === 'zonas') return 'zonas'
  if (tab === 'jugadores' && (sub === 'boletines' || sub === 'boletin')) return 'boletines'
  if (tab === 'staff' && (sub === 'informe' || sub === 'encuestas')) return sub
  if (tab === 'asistencia') return 'entrenamientos'
  return SECCIONES_ACTIVIDAD[tab] ? tab : null
}

// Qué hizo una escritura, en palabras. `p` son los tramos de la ruta.
export function describirAccion(metodo, p) {
  const [raiz, a, b, c, d] = p
  const borra = metodo === 'DELETE'
  switch (raiz) {
    case 'jugadores':
      if (a === 'lote') return 'Importó una lista de jugadores'
      if (a === 'fichas-vigentes') return 'Actualizó fichas médicas'
      if (metodo === 'POST') return 'Sumó un jugador'
      return borra ? 'Borró un jugador' : 'Editó la ficha de un jugador'
    case 'seguimientos':
      return borra ? 'Borró una nota de seguimiento' : 'Cargó una nota de seguimiento'
    case 'tests':
      if (a === 'cortes') return 'Cambió los criterios del semáforo de tests'
      return borra ? 'Borró un test físico' : metodo === 'PUT' ? 'Corrigió un test físico' : 'Cargó un test físico'
    case 'evaluaciones':
      if (b === 'revision') return 'Revisó una evaluación (revisión cruzada)'
      return borra ? 'Borró una evaluación' : 'Cargó una evaluación'
    case 'asignaciones':
      return a === 'repartir' ? 'Repartió evaluaciones' : 'Cambió el reparto de evaluaciones'
    case 'lesiones':
      return metodo === 'POST' ? 'Cargó una lesión' : borra ? 'Borró una lesión' : 'Actualizó una lesión'
    case 'documentos':
      return borra ? 'Borró un escaneo de DNI' : 'Subió un escaneo de DNI'
    case 'aspectos-tecnicos':
      return 'Sumó un aspecto técnico al catálogo'
    case 'stats':
      return 'Revisó golpes y lesiones pendientes'
    case 'eventos':
      if (b === 'asistencias') return 'Tomó asistencia o marcó la convocatoria'
      if (b === 'plan-tecnico') return 'Cargó el plan técnico de un entrenamiento'
      if (b === 'trabajo-fisico') return 'Cargó la planilla del PF'
      if (b === 'tests') return 'Cargó tests en un entrenamiento'
      if (b === 'asistencias-partido') return 'Tomó asistencia en un partido'
      if (b === 'asistencias-staff') return 'Marcó la asistencia del staff'
      if (metodo === 'POST') return 'Creó un entrenamiento o partido'
      return borra ? 'Borró un entrenamiento o partido' : 'Editó un entrenamiento o partido'
    case 'partido':
      if (['asignar', 'asignar-staff', 'limpiar-bloques', 'sugerir-bloques', 'bloque'].includes(a)) return 'Armó los bloques de un partido'
      if (a === 'capitan') return 'Eligió un capitán'
      if (a === 'staff-presente') return 'Marcó el staff presente en un partido'
      if (a === 'tiempo-cerrar') return 'Cerró un tiempo de un partido'
      if (a === 'bloque-cerrar') return 'Cerró un bloque de un partido'
      return 'Armó los equipos de los tiempos'
    case 'padron':
      return 'Editó datos en el padrón'
    case 'convocatoria':
      return 'Marcó la convocatoria de un partido'
    case 'staff':
      if (metodo === 'POST') return 'Sumó a alguien al staff'
      return borra ? 'Quitó a alguien del staff' : 'Editó a alguien del staff'
    case 'viajes':
      if (!a) return 'Creó un viaje o encuentro'
      if (!b) return borra ? 'Borró un viaje o encuentro' : 'Editó un viaje o encuentro'
      if (d === 'pagado') return 'Marcó una inscripción pagada'
      if (b === 'pagos') return borra ? 'Borró un pago de un viaje' : 'Registró un pago de un viaje'
      if (b === 'grupos') return 'Organizó los alojados de una gira'
      if (b === 'jugadores' && c) return 'Actualizó papeles u observaciones de un viajero'
      if (b === 'jugadores') return 'Cambió quiénes van a un viaje'
      return 'Cambió datos de un viaje'
    case 'encuestas':
      if (!a) return 'Creó una encuesta'
      if (b === 'abrir') return 'Abrió una encuesta para que contesten'
      if (b === 'cerrar') return 'Cerró una encuesta'
      if (b === 'links') return 'Manejó los links de una encuesta'
      if (b === 'avisarme') return 'Cambió los avisos de una encuesta'
      if (b === 'pedidos') return 'Atendió un pedido para hablar'
      return borra ? 'Borró una encuesta' : 'Editó una encuesta'
    case 'lugares':
      if (a === 'club') return 'Movió el club en el mapa'
      return borra ? 'Borró un lugar del mapa' : 'Ubicó barrios en el mapa'
    default:
      return `Hizo un cambio en ${raiz || 'la app'}`
  }
}
