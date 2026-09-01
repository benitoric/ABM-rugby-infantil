import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaCorta } from '../helpers.js'

// Series del gráfico, en el orden fijo de la paleta. Los colores son los
// mismos que usa el gráfico de evolución de la ficha: validados con el script
// de la guía de visualización (banda de luminosidad, croma, separación bajo
// daltonismo y contraste >= 3:1 contra el blanco de la tarjeta).
const SERIES = [
  { clave: 'total', label: 'Todos', color: '#2563eb', incluye: () => true },
  {
    clave: 'entrenamientos',
    label: 'Entrenamientos',
    color: '#a16207',
    incluye: (e) => e.tipo === 'entrenamiento',
  },
  { clave: 'partidos', label: 'Partidos', color: '#be185d', incluye: (e) => e.tipo === 'partido' },
]

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

// Lienzo fijo: el SVG se estira al ancho disponible manteniendo proporción
const W = 340
const H = 170
// El margen izquierdo tiene que dar para la etiqueta "100%" del eje
const IZQ = 32
const DER = 34
const ARRIBA = 10
const ABAJO = 24
// Con muchos eventos los puntos se amontonan: arriba de este tope se dibuja
// solo la línea y el punto señalado.
const TOPE_PUNTOS = 45
// Separación mínima entre dos etiquetas de mes del eje horizontal
const SEP_MES = 24

function diaYFecha(fecha) {
  const d = new Date(fecha + 'T00:00:00')
  return `${DIAS[d.getDay()]} ${fechaCorta(fecha)}`
}

export default function GraficoAsistencia() {
  const [datos, setDatos] = useState(null)
  const [anio, setAnio] = useState(null)
  const [visibles, setVisibles] = useState(['total'])
  const [sel, setSel] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    setError(false)
    api(`stats/asistencia-eventos${anio ? `?anio=${anio}` : ''}`)
      .then((d) => { if (vigente) setDatos(d) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [anio])

  if (error || !datos) return null
  const eventos = datos.eventos
  // Con menos de dos eventos medibles no hay oscilación que mirar. Los que no
  // tienen porcentaje igual ocupan su lugar en el eje: el orden cronológico
  // se respeta aunque a ese evento no se le pueda calcular la asistencia.
  if (eventos.filter((e) => e.pct != null).length < 2) return null

  const series = SERIES.filter((s) => visibles.includes(s.clave))
  const x = (i) => IZQ + (i * (W - IZQ - DER)) / (eventos.length - 1)
  const y = (v) => ARRIBA + ((100 - v) / 100) * (H - ARRIBA - ABAJO)
  const puntosVisibles = eventos.length <= TOPE_PUNTOS

  // Los eventos de la serie, en su posición del eje (que es la de todos los
  // eventos): así dos entrenamientos seguidos quedan unidos aunque entre
  // medio haya habido un partido. Los que no tienen porcentaje (ningún
  // jugador cargado a esa fecha) quedan afuera: no son un 0%.
  const deLaSerie = (s) => eventos
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => s.incluye(e) && e.pct != null)

  // Un hueco de eventos sin dato corta la línea en vez de cruzarla de lado a
  // lado, que daría a entender una caída que nunca se midió.
  function segmentos(suyos) {
    const res = []
    let actual = []
    let anterior = null
    for (const punto of suyos) {
      const corte = anterior != null
        && eventos.slice(anterior + 1, punto.i).some((e) => e.pct == null)
      if (corte && actual.length) { res.push(actual); actual = [] }
      actual.push(punto)
      anterior = punto.i
    }
    if (actual.length) res.push(actual)
    return res
  }

  // Primer evento de cada mes: marca el eje horizontal sin amontonar
  const etiquetasMes = []
  let ultimoMes = null
  let ultimoX = -Infinity
  eventos.forEach((e, i) => {
    const mes = Number(e.fecha.slice(5, 7))
    if (mes === ultimoMes) return
    ultimoMes = mes
    if (x(i) - ultimoX < SEP_MES) return
    ultimoX = x(i)
    etiquetasMes.push({ mes, x: x(i) })
  })

  function alSenalar(ev) {
    const caja = ev.currentTarget.getBoundingClientRect()
    const px = ((ev.clientX - caja.left) / caja.width) * W
    const paso = (W - IZQ - DER) / (eventos.length - 1)
    const i = Math.round((px - IZQ) / paso)
    setSel(Math.min(eventos.length - 1, Math.max(0, i)))
  }

  function alternar(clave) {
    setVisibles((v) => {
      const nuevo = v.includes(clave) ? v.filter((c) => c !== clave) : [...v, clave]
      // Siempre queda al menos una serie dibujada
      return nuevo.length ? nuevo : v
    })
  }

  const activo = sel == null ? null : eventos[sel]
  const promedio = datos.promedio.total.pct

  // Etiqueta del último valor de cada serie. Dos series que terminan en el
  // mismo evento comparten posición, así que ahí se separan en vertical.
  const ALTO_ETIQUETA = 11
  const etiquetas = series
    .map((s) => {
      const suyos = deLaSerie(s)
      const ultimo = suyos[suyos.length - 1]
      return ultimo && { clave: s.clave, x: x(ultimo.i), y: y(ultimo.e.pct), pct: ultimo.e.pct }
    })
    .filter(Boolean)
  const ANCHO_ETIQUETA = 30
  const puestas = []
  for (const e of [...etiquetas].sort((a, b) => a.y - b.y)) {
    for (const p of puestas) {
      if (Math.abs(p.x - e.x) < ANCHO_ETIQUETA && e.y - p.y < ALTO_ETIQUETA) {
        e.y = p.y + ALTO_ETIQUETA
      }
    }
    puestas.push(e)
  }

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <h3>Asistencia evento por evento</h3>
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
        Un punto por evento, en orden. La línea de puntos es el promedio del
        año: <b>{promedio}%</b> sobre {datos.promedio.total.eventos} eventos.
        Tocá el gráfico para ver cada uno.
      </p>

      <div className="grafico-caja">
        <svg
          className="grafico"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Asistencia de cada evento de ${datos.anio}, en orden`}
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

          {/* Promedio del año: da la referencia contra la que se ve la oscilación */}
          {promedio != null && (
            <line
              x1={IZQ}
              x2={W - DER}
              y1={y(promedio)}
              y2={y(promedio)}
              className="grafico-promedio"
            />
          )}

          {etiquetasMes.map((m) => (
            <text key={m.mes} x={m.x} y={H - 8} className="grafico-eje" textAnchor="middle">
              {MESES[m.mes - 1]}
            </text>
          ))}

          {sel != null && (
            <line x1={x(sel)} x2={x(sel)} y1={ARRIBA} y2={H - ABAJO} className="grafico-guia" />
          )}

          {series.map((s) => {
            const suyos = deLaSerie(s)
            return (
              <g key={s.clave}>
                {segmentos(suyos).map((seg, k) => (
                  <polyline
                    key={k}
                    points={seg.map(({ e, i }) => `${x(i)},${y(e.pct)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {suyos.map(({ e, i }) => (
                  (puntosVisibles || sel === i) && (
                    <circle
                      key={e.id}
                      cx={x(i)}
                      cy={y(e.pct)}
                      r={sel === i ? 5 : 3}
                      fill={s.color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  )
                ))}
                {/* Etiqueta directa del último valor de cada serie */}
                {etiquetas.filter((e) => e.clave === s.clave).map((e) => (
                  <text key={e.clave} x={e.x + 7} y={e.y + 3} className="grafico-valor">
                    {e.pct}%
                  </text>
                ))}
              </g>
            )
          })}
        </svg>

        {activo && (
          <div className="grafico-tooltip" style={{ left: `${(x(sel) / W) * 100}%` }}>
            <b>{diaYFecha(activo.fecha)}</b>
            <div>
              {activo.tipo === 'partido'
                ? `Partido${activo.rival ? ` vs ${activo.rival}` : ''}`
                : `Entrenamiento${activo.modalidad === 'extra' ? ' extra' : ''}`}
            </div>
            <div>
              {activo.pct == null
                ? 'Sin plantel cargado a esa fecha'
                : <><b>{activo.pct}%</b> · {activo.presentes} de {activo.plazas}</>}
            </div>
          </div>
        )}
      </div>

      {/* Los chips hacen de leyenda y de control del desglose a la vez */}
      <div className="fila" style={{ gap: 6, marginTop: 8 }}>
        {SERIES.map((s) => {
          const activa = visibles.includes(s.clave)
          const prom = datos.promedio[s.clave]
          if (!prom.eventos) return null
          return (
            <button
              key={s.clave}
              className={`chip grafico-serie ${activa ? 'activo' : ''}`}
              aria-pressed={activa}
              onClick={() => alternar(s.clave)}
            >
              <span className="grafico-punto" style={{ background: s.color }} />
              {s.label} {prom.pct}%
            </button>
          )
        })}
      </div>

      <details style={{ marginTop: 8 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>Ver los números</summary>
        <table className="grafico-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Presentes</th>
              <th>Asistencia</th>
            </tr>
          </thead>
          <tbody>
            {[...eventos].reverse().map((e) => (
              <tr key={e.id}>
                <td>{diaYFecha(e.fecha)}</td>
                <td>
                  {e.tipo === 'partido'
                    ? `Partido${e.rival ? ` vs ${e.rival}` : ''}`
                    : `Entren.${e.modalidad === 'extra' ? ' extra' : ''}`}
                </td>
                <td>{e.pct == null ? '—' : `${e.presentes} de ${e.plazas}`}</td>
                <td>{e.pct == null ? '—' : `${e.pct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
