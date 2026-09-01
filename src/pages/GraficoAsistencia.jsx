import { useEffect, useState } from 'react'
import { api } from '../api.js'

// Series del gráfico, en el orden fijo de la paleta. Los colores son los
// mismos que usa el gráfico de evolución de la ficha: validados con el script
// de la guía de visualización (banda de luminosidad, croma, separación bajo
// daltonismo y contraste >= 3:1 contra el blanco de la tarjeta).
const SERIES = [
  { clave: 'total', label: 'Total', color: '#2563eb' },
  { clave: 'entrenamientos', label: 'Entrenamientos', color: '#a16207' },
  { clave: 'partidos', label: 'Partidos', color: '#be185d' },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Lienzo fijo: el SVG se estira al ancho disponible manteniendo proporción
const W = 340
const H = 170
// El margen izquierdo tiene que dar para la etiqueta "100%" del eje
const IZQ = 32
const DER = 34
const ARRIBA = 10
const ABAJO = 24

export default function GraficoAsistencia() {
  const [datos, setDatos] = useState(null)
  const [anio, setAnio] = useState(null)
  const [visibles, setVisibles] = useState(['total'])
  const [sel, setSel] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    setError(false)
    api(`stats/asistencia-mensual${anio ? `?anio=${anio}` : ''}`)
      .then((d) => { if (vigente) setDatos(d) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [anio])

  if (error || !datos) return null
  // Sin ningún evento cargado el gráfico no diría nada
  if (!datos.promedio.eventos) return null

  const { meses } = datos
  const series = SERIES.filter((s) => visibles.includes(s.clave))
  // Meses con algún dato: el eje arranca en el primero y termina en el último,
  // así un año a medio andar no deja media tarjeta vacía.
  const conDatos = meses.filter((m) => m.eventos > 0).map((m) => m.mes)
  const desde = conDatos[0]
  const hasta = conDatos[conDatos.length - 1]
  const tramo = meses.filter((m) => m.mes >= desde && m.mes <= hasta)

  const x = (i) => tramo.length === 1
    ? (IZQ + W - DER) / 2
    : IZQ + (i * (W - IZQ - DER)) / (tramo.length - 1)
  const y = (v) => ARRIBA + ((100 - v) / 100) * (H - ARRIBA - ABAJO)

  // Cada tramo continuo va en su propio path: un mes sin ese tipo de evento
  // corta la línea en vez de inventar un valor.
  function segmentos(clave) {
    const res = []
    let actual = []
    tramo.forEach((m, i) => {
      if (m[clave] == null) { if (actual.length) res.push(actual); actual = [] }
      else actual.push([x(i), y(m[clave])])
    })
    if (actual.length) res.push(actual)
    return res
  }

  function alSenalar(e) {
    if (tramo.length < 2) return
    const caja = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - caja.left) / caja.width) * W
    const paso = (W - IZQ - DER) / (tramo.length - 1)
    const i = Math.round((px - IZQ) / paso)
    setSel(Math.min(tramo.length - 1, Math.max(0, i)))
  }

  function alternar(clave) {
    setVisibles((v) => {
      const nuevo = v.includes(clave) ? v.filter((c) => c !== clave) : [...v, clave]
      // Siempre queda al menos una serie dibujada
      return nuevo.length ? nuevo : v
    })
  }

  const activo = sel == null ? null : tramo[sel]
  const ultimo = tramo.length - 1

  // Etiqueta directa del último valor de cada serie, separadas si coinciden
  const ALTO_ETIQUETA = 11
  const etiquetas = series
    .map((s) => ({ ...s, valor: tramo[ultimo][s.clave] }))
    .filter((e) => e.valor != null)
    .map((e) => ({ ...e, y: y(e.valor) }))
    .sort((a, b) => a.y - b.y)
  etiquetas.forEach((e, i) => {
    if (i > 0) e.y = Math.max(e.y, etiquetas[i - 1].y + ALTO_ETIQUETA)
  })

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <h3>Asistencia promedio del año</h3>
        {datos.anios.length > 1 && (
          <select
            className="grafico-anio"
            value={datos.anio}
            onChange={(e) => { setDatos(null); setSel(null); setAnio(Number(e.target.value)) }}
          >
            {datos.anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      <p className="mini" style={{ margin: '2px 0 8px' }}>
        Promedio del año: <b>{datos.promedio.total}%</b> sobre {datos.promedio.eventos}{' '}
        {datos.promedio.eventos === 1 ? 'evento' : 'eventos'} con asistencia tomada.
        Tocá el gráfico para ver cada mes.
      </p>

      <div className="grafico-caja">
        <svg
          className="grafico"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Asistencia promedio mes a mes de ${datos.anio}`}
          onPointerMove={alSenalar}
          onPointerDown={alSenalar}
          onPointerLeave={() => setSel(null)}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={IZQ} x2={W - DER} y1={y(v)} y2={y(v)} className="grafico-grilla" />
              <text x={IZQ - 5} y={y(v) + 3} className="grafico-eje" textAnchor="end">{v}%</text>
            </g>
          ))}

          {tramo.map((m, i) => (
            // Con muchos meses se etiqueta uno de cada dos para que no se pisen
            (tramo.length <= 7 || i % 2 === 0 || i === ultimo) && (
              <text key={m.mes} x={x(i)} y={H - 8} className="grafico-eje" textAnchor="middle">
                {MESES[m.mes - 1]}
              </text>
            )
          ))}

          {sel != null && (
            <line x1={x(sel)} x2={x(sel)} y1={ARRIBA} y2={H - ABAJO} className="grafico-guia" />
          )}

          {series.map((s) => (
            <g key={s.clave}>
              {segmentos(s.clave).map((seg, k) => (
                <polyline
                  key={k}
                  points={seg.map(([px, py]) => `${px},${py}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {tramo.map((m, i) => m[s.clave] == null ? null : (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(m[s.clave])}
                  r={sel === i ? 5 : 4}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="2"
                />
              ))}
              {etiquetas.filter((e) => e.clave === s.clave).map((e) => (
                <text key={e.clave} x={x(ultimo) + 7} y={e.y + 3} className="grafico-valor">
                  {e.valor}%
                </text>
              ))}
            </g>
          ))}
        </svg>

        {activo && (
          <div className="grafico-tooltip" style={{ left: `${(x(sel) / W) * 100}%` }}>
            <b>{MESES[activo.mes - 1]} {datos.anio}</b>
            {series.map((s) => (
              <div key={s.clave}>
                <span className="grafico-punto" style={{ background: s.color }} />
                {s.label}: {activo[s.clave] == null ? '—' : `${activo[s.clave]}%`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Los chips hacen de leyenda y de control del desglose a la vez */}
      <div className="fila" style={{ gap: 6, marginTop: 8 }}>
        {SERIES.map((s) => {
          const activa = visibles.includes(s.clave)
          return (
            <button
              key={s.clave}
              className={`chip grafico-serie ${activa ? 'activo' : ''}`}
              aria-pressed={activa}
              onClick={() => alternar(s.clave)}
            >
              <span className="grafico-punto" style={{ background: s.color }} />
              {s.label}
              {datos.promedio[s.clave] != null && ` ${datos.promedio[s.clave]}%`}
            </button>
          )
        })}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>Ver los números</summary>
        <table className="grafico-tabla">
          <thead>
            <tr>
              <th>Mes</th>
              {SERIES.map((s) => <th key={s.clave}>{s.label}</th>)}
              <th>Eventos</th>
            </tr>
          </thead>
          <tbody>
            {tramo.map((m) => (
              <tr key={m.mes}>
                <td>{MESES[m.mes - 1]}</td>
                {SERIES.map((s) => (
                  <td key={s.clave}>{m[s.clave] == null ? '—' : `${m[s.clave]}%`}</td>
                ))}
                <td>{m.eventos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
