// Historial de estado de los jugadores (tabla jugadores_historial_estado).
//
// Cada vez que un jugador cambia de estado —alta, baja, lesión, vuelta— queda
// una fila con el momento. Sin esto, la app solo sabe el estado de hoy, y el
// informe de gestión (server/informe.js) no podría decir cuántos activos
// había al principio de un período. Se escribe desde el router después de
// cada escritura que toque `jugadores.estado`; si el estado no cambió, no se
// agrega nada, así una edición cualquiera de la ficha no ensucia la historia.
import { query } from './db.js'

export async function registrarEstado(jugadorId, estado, por = null) {
  if (!jugadorId || !estado) return
  const [ultimo] = await query(
    `select estado from jugadores_historial_estado
     where jugador_id = $1 order by desde desc limit 1`, [jugadorId])
  if (ultimo?.estado === estado) return
  await query(
    `insert into jugadores_historial_estado (jugador_id, estado, cambiado_por)
     values ($1, $2, $3)`, [jugadorId, estado, por])
}

// Después de una escritura que pudo cambiar el estado sin que lo sepamos de
// antemano (la sincronización por lesiones): se lee el estado actual y se
// registra si es distinto del último anotado.
export async function registrarEstadoActual(jugadorId, por = null) {
  const [j] = await query('select estado from jugadores where id = $1', [jugadorId])
  if (j) await registrarEstado(jugadorId, j.estado, por)
}
