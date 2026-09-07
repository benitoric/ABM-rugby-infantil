import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaCompacta } from '../helpers.js'
import { DIAS_ATRASO, diasSinTrabajar, haceCuanto } from '../planTecnico.js'

// Un color por grupo del catálogo, en el orden fijo de la paleta. Son los
// mismos dos primeros tonos que usa el gráfico de asistencia, validados con el
// script de la guía de visualización (banda de luminosidad, croma, separación
// bajo daltonismo y contraste >= 3:1 contra el blanco de la tarjeta).
const COLORES = { colectiva: '#2563eb', individual: '#a16207' }
const COLOR_SUELTO = '#6b7280'

// Qué se viene entrenando en el año, aspecto por aspecto: minutos acumulados
// (la barra), cuántas veces se trabajó y cuándo fue la última. Va en el
// encabezado de Entrenamientos para decidir de un vistazo qué falta.
export default function GraficoTecnica() {
  const [datos, setDatos] = useState(null)
  const [anio, setAnio] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    setError(false)
    api(`stats/plan-tecnico${anio ? `?anio=${anio}` : ''}`)
      .then((d) => { if (vigente) setDatos(d) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [anio])

  if (error || !datos) return null
  const trabajados = datos.aspectos.filter((a) => a.veces > 0)
  // Sin ninguna planificación cargada no hay nada que mirar: la tarjeta vacía
  // solo empujaría el listado de entrenamientos hacia abajo.
  if (!trabajados.length) return null

  const maximo = Math.max(...trabajados.map((a) => a.minutos))
  const totalMin = trabajados.reduce((a, b) => a + b.minutos, 0)
  const grupos = datos.grupos.map((g) => ({
    ...g,
    color: COLORES[g.value] || COLOR_SUELTO,
    trabajados: trabajados
      .filter((a) => a.grupo === g.value)
      .sort((a, b) => b.minutos - a.minutos || a.label.localeCompare(b.label)),
    faltan: datos.aspectos.filter((a) => a.grupo === g.value && !a.veces),
  }))

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <h3>Qué se viene entrenando</h3>
        {datos.anios.length > 1 && (
          <select
            className="grafico-anio"
            value={datos.anio}
            onChange={(e) => { setDatos(null); setAnio(Number(e.target.value)) }}
          >
            {datos.anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      <p className="mini" style={{ margin: '2px 0 8px' }}>
        Minutos de técnica acumulados en {datos.anio} sobre{' '}
        <b>{datos.sesiones}</b> {datos.sesiones === 1 ? 'entrenamiento' : 'entrenamientos'}{' '}
        con planificación (<b>{totalMin} min</b> en total). Los que hace más de{' '}
        {DIAS_ATRASO} días que no se tocan van marcados.
      </p>

      {grupos.map((g) => (
        <div key={g.value} className="tecnica-grupo">
          <div className="eval-area-titulo">
            <span>
              <span className="grafico-punto" style={{ background: g.color }} />
              {g.label}
            </span>
            <span>{g.trabajados.length}/{g.trabajados.length + g.faltan.length}</span>
          </div>
          {g.trabajados.map((a) => {
            const dias = diasSinTrabajar(a.ultima)
            const atrasado = dias != null && dias > DIAS_ATRASO
            return (
              <div
                key={a.clave}
                className="tecnica-barra"
                title={`${a.label}: ${a.minutos} min en ${a.veces} ${a.veces === 1 ? 'entrenamiento' : 'entrenamientos'}. Última vez: ${fechaCompacta(a.ultima)} (${haceCuanto(dias)}).`}
              >
                <span className="etiqueta">{a.label}</span>
                <span className={`ultima${atrasado ? ' atrasado' : ''}`}>
                  {atrasado && '⚠ '}{haceCuanto(dias)} · {a.veces}×
                </span>
                <span className="pista">
                  <span
                    className="relleno"
                    style={{ width: `${Math.max(3, (a.minutos / maximo) * 100)}%`, background: g.color }}
                  />
                </span>
                <b className="cifra">{a.minutos}′</b>
              </div>
            )
          })}
          {g.faltan.length > 0 && (
            <p className="mini tecnica-faltan">
              Sin trabajar en {datos.anio}: {g.faltan.map((a) => a.label).join(', ')}.
            </p>
          )}
        </div>
      ))}

      <details style={{ marginTop: 8 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>Ver los números</summary>
        <table className="grafico-tabla">
          <thead>
            <tr>
              <th>Aspecto</th>
              <th>Veces</th>
              <th>Minutos</th>
              <th>Última</th>
            </tr>
          </thead>
          <tbody>
            {[...datos.aspectos]
              .sort((a, b) => b.minutos - a.minutos || a.label.localeCompare(b.label))
              .map((a) => (
                <tr key={a.clave}>
                  <td>{a.label}</td>
                  <td>{a.veces || '—'}</td>
                  <td>{a.veces ? a.minutos : '—'}</td>
                  <td>{a.ultima ? fechaCompacta(a.ultima) : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
