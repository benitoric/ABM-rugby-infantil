import { useState } from 'react'
import { fechaCompacta, fechaCorta } from '../helpers.js'
import { promediosResumen, valoresConsolidados, GRUPOS } from '../evaluacion.js'

// Colores de las tres series. Validados con el script de la guía de
// visualización: separación suficiente para daltonismo (deuteranopía,
// protanopía y tritanopía) y contraste >= 3:1 contra el blanco de la tarjeta.
const COLORES = {
  general: '#2563eb',
  juego: '#a16207',
  comportamiento: '#be185d',
}

// Lienzo fijo: el SVG se estira al ancho disponible manteniendo proporción
const W = 340
const H = 190
const IZQ = 22
const DER = 30
const ARRIBA = 10
const ABAJO = 26

export default function GraficoEvolucion({ evaluaciones }) {
  const [sel, setSel] = useState(null)

  // De la más vieja a la más nueva, con los tres promedios ya consolidados
  const puntos = [...evaluaciones]
    .reverse()
    .map((ev) => ({ fecha: ev.fecha, ...promediosResumen(valoresConsolidados(ev)) }))
  const series = GRUPOS.filter((g) => puntos.some((p) => p[g.value] != null))

  if (puntos.length < 2 || !series.length) return null

  const x = (i) => IZQ + (i * (W - IZQ - DER)) / (puntos.length - 1)
  const y = (v) => ARRIBA + ((5 - v) / 4) * (H - ARRIBA - ABAJO)

  // Cada tramo continuo va en su propio path: si a una evaluación le falta un
  // grupo, la línea se corta en vez de inventar el valor que no se cargó.
  function tramos(clave) {
    const res = []
    let actual = []
    puntos.forEach((p, i) => {
      if (p[clave] == null) { if (actual.length) res.push(actual); actual = [] }
      else actual.push([x(i), y(p[clave])])
    })
    if (actual.length) res.push(actual)
    return res
  }

  function alSenalar(e) {
    const caja = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - caja.left) / caja.width) * W
    const paso = (W - IZQ - DER) / (puntos.length - 1)
    const i = Math.round((px - IZQ) / paso)
    setSel(Math.min(puntos.length - 1, Math.max(0, i)))
  }

  const ultimo = puntos.length - 1
  const activo = sel == null ? null : puntos[sel]

  // Etiquetas del último valor de cada serie: si dos quedan a la misma altura
  // se separan, para que no se lean encimadas.
  const ALTO_ETIQUETA = 11
  const etiquetas = series
    .filter((g) => puntos[ultimo][g.value] != null)
    .map((g) => ({ clave: g.value, valor: puntos[ultimo][g.value], y: y(puntos[ultimo][g.value]) }))
    .sort((a, b) => a.y - b.y)
  etiquetas.forEach((e, i) => {
    if (i > 0) e.y = Math.max(e.y, etiquetas[i - 1].y + ALTO_ETIQUETA)
  })

  return (
    <div className="tarjeta">
      <h3>Evolución de los promedios</h3>
      <p className="mini" style={{ margin: '2px 0 8px' }}>
        {puntos.length} evaluaciones, de la más vieja a la más reciente.
        Tocá el gráfico para ver los valores de cada fecha.
      </p>

      <div className="grafico-caja">
        <svg
          className="grafico"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Evolución de los promedios en ${puntos.length} evaluaciones`}
          onPointerMove={alSenalar}
          onPointerDown={alSenalar}
          onPointerLeave={() => setSel(null)}
        >
          {/* Grilla y escala 1 a 5 */}
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={IZQ} x2={W - DER} y1={y(v)} y2={y(v)} className="grafico-grilla" />
              <text x={IZQ - 6} y={y(v) + 3} className="grafico-eje" textAnchor="end">{v}</text>
            </g>
          ))}

          {/* Fechas: solo la primera y la última, para que no se pisen */}
          {[0, ultimo].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              className="grafico-eje"
              textAnchor={i === 0 ? 'start' : 'end'}
            >
              {fechaCompacta(puntos[i].fecha)}
            </text>
          ))}

          {/* Guía vertical de la evaluación señalada */}
          {sel != null && (
            <line x1={x(sel)} x2={x(sel)} y1={ARRIBA} y2={H - ABAJO} className="grafico-guia" />
          )}

          {series.map((g) => (
            <g key={g.value}>
              {tramos(g.value).map((tramo, k) => (
                <polyline
                  key={k}
                  points={tramo.map(([px, py]) => `${px},${py}`).join(' ')}
                  fill="none"
                  stroke={COLORES[g.value]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {puntos.map((p, i) => p[g.value] == null ? null : (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(p[g.value])}
                  r={sel === i ? 5 : 4}
                  fill={COLORES[g.value]}
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
              {/* Etiqueta directa solo en el último valor de cada serie */}
              {etiquetas.filter((e) => e.clave === g.value).map((e) => (
                <text key={e.clave} x={x(ultimo) + 7} y={e.y + 3} className="grafico-valor">
                  {e.valor}
                </text>
              ))}
            </g>
          ))}
        </svg>

        {activo && (
          <div className="grafico-tooltip" style={{ left: `${(x(sel) / W) * 100}%` }}>
            <b>{fechaCorta(activo.fecha)}</b>
            {series.map((g) => (
              <div key={g.value}>
                <span className="grafico-punto" style={{ background: COLORES[g.value] }} />
                {g.label}: {activo[g.value] ?? '—'}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fila" style={{ gap: 12, marginTop: 8 }}>
        {series.map((g) => (
          <span key={g.value} className="mini fila" style={{ gap: 5 }}>
            <span className="grafico-punto" style={{ background: COLORES[g.value] }} />
            {g.label}
          </span>
        ))}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>Ver los números</summary>
        <table className="grafico-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              {series.map((g) => <th key={g.value}>{g.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...puntos].reverse().map((p) => (
              <tr key={p.fecha + (p.general ?? '')}>
                <td>{fechaCorta(p.fecha)}</td>
                {series.map((g) => <td key={g.value}>{p[g.value] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
