import { useState } from 'react'
import { api } from '../api.js'
import { edad, fechaCorta, nombreCompleto } from '../helpers.js'
import { areasParaEdad, bandaEtaria, promediosPorArea, BANDAS, VARIABLES_EVAL } from '../evaluacion.js'

function Estrellas({ valor, onCambiar }) {
  return (
    <div className="eval-estrellas">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={valor >= n ? 'on' : ''}
          aria-label={`${n} de 5`}
          onClick={() => onCambiar(valor === n ? null : n)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function FormEvaluacion({ jugador, anterior, onCerrar, onGuardado }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [valores, setValores] = useState({})
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const edadJ = edad(jugador.fecha_nacimiento)
  const banda = bandaEtaria(edadJ)
  const areas = areasParaEdad(edadJ)
  const totalVars = areas.reduce((n, a) => n + a.variables.length, 0)
  const cargadas = Object.values(valores).filter(Boolean).length

  async function guardar(e) {
    e.preventDefault()
    if (!cargadas) return
    setGuardando(true)
    setError('')
    try {
      await api('evaluaciones', {
        method: 'POST',
        body: { jugador_id: jugador.id, fecha, valores, comentario: comentario.trim() || null },
      })
      onGuardado()
    } catch {
      setError('No se pudo guardar la evaluación. Probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 4 }}>
          <h3>Evaluar a {nombreCompleto(jugador)}</h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <p className="mini" style={{ marginBottom: 8 }}>
          Guía de {BANDAS.find((b) => b.value === banda).label}
          {edadJ == null && ' (sin fecha de nacimiento: se usa la guía de 7 a 12)'}.
          La escala es siempre relativa a la edad:{' '}
          <b>1</b> recién inicia · <b>3</b> acorde a su edad · <b>5</b> sobresale.
          Las variables sin cargar no se guardan.
        </p>
        <div className="campo" style={{ maxWidth: 180 }}>
          <label>Fecha de la evaluación</label>
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        {areas.map((a) => (
          <div key={a.value}>
            <div className="eval-area-titulo">
              <span>{a.label}</span>
              <span>{a.variables.filter((v) => valores[v.value]).length}/{a.variables.length}</span>
            </div>
            {a.variables.map((v) => (
              <div key={v.value} className="eval-var">
                <div className="fila entre" style={{ flexWrap: 'nowrap' }}>
                  <div className="crece" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                      {v.label}
                      {anterior?.valores?.[v.value] && (
                        <span className="eval-anterior"> ant. {anterior.valores[v.value]}★</span>
                      )}
                    </div>
                  </div>
                  <Estrellas
                    valor={valores[v.value]}
                    onCambiar={(n) => setValores({ ...valores, [v.value]: n })}
                  />
                </div>
                <div className="eval-guia">{v.guia[banda]}</div>
              </div>
            ))}
          </div>
        ))}

        <div className="campo" style={{ marginTop: 12 }}>
          <label>Comentario general (opcional)</label>
          <textarea
            placeholder="Ej.: gran semestre; enfocar el próximo período en el tackle de frente…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>

        {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
        <div className="eval-pie">
          <button className="btn" style={{ width: '100%' }} disabled={!cargadas || guardando}>
            {guardando ? 'Guardando…' : `Guardar evaluación (${cargadas}/${totalVars})`}
          </button>
        </div>
      </form>
    </div>
  )
}

export function TarjetaEvaluacion({ ev, anterior, onBorrar }) {
  const proms = promediosPorArea(ev.valores)
  const cargadas = Object.keys(ev.valores || {}).length

  function delta(v) {
    const ant = anterior?.valores?.[v]
    const act = ev.valores[v]
    if (!ant || !act || ant === act) return null
    return act > ant
      ? <span className="eval-delta sube">▲</span>
      : <span className="eval-delta baja">▼</span>
  }

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <b style={{ fontSize: '0.9rem' }}>📋 {fechaCorta(ev.fecha)}</b>
        <span className="mini">{ev.autor_email || ''}</span>
      </div>
      <div className="fila" style={{ marginTop: 6, gap: 6 }}>
        {proms.map((p) => (
          <span key={p.area} className="badge eval-prom">{p.label}: {p.promedio}★</span>
        ))}
      </div>
      {ev.comentario && <p style={{ fontSize: '0.9rem', marginTop: 6 }}>{ev.comentario}</p>}
      <details style={{ marginTop: 6 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>
          Ver detalle ({cargadas} variables)
        </summary>
        <div style={{ marginTop: 6 }}>
          {Object.entries(VARIABLES_EVAL)
            .filter(([k]) => ev.valores[k])
            .map(([k, v]) => (
              <div key={k} className="fila entre eval-detalle-fila">
                <span>{v.label}</span>
                <span>
                  <span className="estrellas">{'★'.repeat(ev.valores[k])}</span>
                  <span className="eval-estrellas-off">{'★'.repeat(5 - ev.valores[k])}</span>
                  {delta(k)}
                </span>
              </div>
            ))}
        </div>
        <button
          className="btn peligro chico"
          style={{ marginTop: 8 }}
          onClick={(e) => { e.preventDefault(); onBorrar(ev.id) }}
        >
          Borrar evaluación
        </button>
      </details>
    </div>
  )
}
