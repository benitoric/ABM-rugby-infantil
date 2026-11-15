import { useState } from 'react'

// Tarjeta desplegable de la pantalla de inicio: arranca replegada, con el
// título a la vista (que ya dice lo importante: cuántos faltan, cuántos
// cumplen), y se abre de un toque. Lo que se dejó abierto se recuerda mientras
// la app siga abierta —al volver de una ficha no se cierra solo—, y al
// reabrir la app todo vuelve a empezar replegado, que es lo que deja ver
// rápido el listado.
const abiertos = new Map()

export default function Plegable({ id, titulo, clase = '', children }) {
  const [abierto, setAbierto] = useState(() => abiertos.get(id) === true)

  function alternar(e) {
    const valor = e.currentTarget.open
    abiertos.set(id, valor)
    setAbierto(valor)
  }

  return (
    <details className={`tarjeta plegable ${clase}`} open={abierto} onToggle={alternar}>
      <summary>
        <h3>{titulo}</h3>
        <span className="plegable-flecha" aria-hidden="true">▸</span>
      </summary>
      <div className="plegable-cuerpo">{children}</div>
    </details>
  )
}
