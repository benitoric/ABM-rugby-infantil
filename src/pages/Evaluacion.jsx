import { useState } from 'react'
import { api } from '../api.js'
import { edad, fechaCorta, nombreCompleto } from '../helpers.js'
import {
  acuerdo, areasParaEdad, bandaEtaria, diferencias, promedioGeneral, promediosPorArea,
  promediosResumen, valoresConsolidados, BANDAS, GRUPOS, UMBRAL_DIFERENCIA, VARIABLES_EVAL,
} from '../evaluacion.js'

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

// `revisionDe` = id de la evaluación que se está revisando. En ese modo no se
// muestra la nota del primer evaluador hasta después de guardar: si se viera
// antes, el revisor tiende a confirmarla y la segunda mirada no aporta nada.
export function FormEvaluacion({ jugador, anterior, revisionDe, quienEvaluo, onCerrar, onGuardado }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [valores, setValores] = useState({})
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [comparacion, setComparacion] = useState(null)
  const esRevision = !!revisionDe

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
      if (esRevision) {
        // Recién ahora se descubre la nota del primero, ya sin poder cambiarla
        const ev = await api(`evaluaciones/${revisionDe}/revision`, {
          method: 'POST',
          body: { valores, comentario_revisor: comentario.trim() || null },
        })
        setComparacion(ev)
        setGuardando(false)
        return
      }
      await api('evaluaciones', {
        method: 'POST',
        body: { jugador_id: jugador.id, fecha, valores, comentario: comentario.trim() || null },
      })
      onGuardado()
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  if (comparacion) {
    return (
      <div className="modal-fondo" onClick={onGuardado}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <Comparacion ev={comparacion} jugador={jugador} />
          <button className="btn" style={{ width: '100%' }} onClick={onGuardado}>Listo</button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 4 }}>
          <h3>{esRevision ? 'Revisar a' : 'Evaluar a'} {nombreCompleto(jugador)}</h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        {esRevision && (
          <div className="aviso" style={{ marginBottom: 8 }}>
            🙈 <b>Segunda mirada, a ciegas.</b> Cargá tu propia evaluación sin ver la
            de {quienEvaluo || 'el primer evaluador'}: si la vieras antes, sería difícil no
            dejarte llevar. Al guardar aparecen las dos juntas y se marcan las diferencias.
          </div>
        )}
        <p className="mini" style={{ marginBottom: 8 }}>
          Guía de {BANDAS.find((b) => b.value === banda).label}
          {edadJ == null && ' (sin fecha de nacimiento: se usa la guía de 7 a 12)'}.
          La escala es siempre relativa a la edad:{' '}
          <b>1</b> recién inicia · <b>3</b> acorde a su edad · <b>5</b> sobresale.
          Las variables sin cargar no se guardan.
        </p>
        {!esRevision && (
          <div className="campo" style={{ maxWidth: 180 }}>
            <label>Fecha de la evaluación</label>
            <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        )}

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
                      {!esRevision && anterior?.valores?.[v.value] && (
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
            {guardando ? 'Guardando…' : `${esRevision ? 'Guardar y comparar' : 'Guardar evaluación'} (${cargadas}/${totalVars})`}
          </button>
        </div>
      </form>
    </div>
  )
}

// Las dos miradas, una al lado de la otra, con lo que hay para conversar
export function Comparacion({ ev, jugador }) {
  const dif = diferencias(ev)
  const coincidencia = acuerdo(ev)
  const comunes = Object.keys(ev.valores || {}).filter((k) => ev.valores_revisor?.[k] >= 1)

  return (
    <>
      <h3 style={{ marginBottom: 6 }}>
        Las dos miradas sobre {jugador ? nombreCompleto(jugador) : 'el jugador'}
      </h3>
      <div className="fila" style={{ gap: 6, marginBottom: 8 }}>
        <span className="badge eval-general">
          Final: {promedioGeneral(valoresConsolidados(ev))}★
        </span>
        {coincidencia != null && (
          <span className={`badge ${coincidencia >= 70 ? 'eval-prom' : 'medica-no'}`}>
            Coinciden en {coincidencia}%
          </span>
        )}
      </div>
      {dif.length > 0 ? (
        <div className="aviso" style={{ marginBottom: 8 }}>
          Hay <b>{dif.length} {dif.length === 1 ? 'variable' : 'variables'}</b> con
          miradas muy distintas. Vale la pena hablarlas con el otro entrenador:
          la nota final quedó en el promedio de las dos.
        </div>
      ) : (
        <p className="mini" style={{ marginBottom: 8 }}>
          Sin diferencias grandes: las dos evaluaciones cuentan lo mismo. 👌
        </p>
      )}
      <div className="fila entre mini" style={{ fontWeight: 700, padding: '0 2px' }}>
        <span>Variable</span>
        <span>1.ª · revisión</span>
      </div>
      {comunes.map((k) => {
        const a = ev.valores[k]
        const b = ev.valores_revisor[k]
        const lejos = Math.abs(a - b) >= UMBRAL_DIFERENCIA
        return (
          <div key={k} className={`fila entre eval-detalle-fila ${lejos ? 'discrepa' : ''}`}>
            <span>{VARIABLES_EVAL[k]?.label || k}</span>
            <span style={{ whiteSpace: 'nowrap' }}>
              <b>{a}</b> · <b>{b}</b>
              {lejos && <span className="eval-delta baja"> ⚠</span>}
            </span>
          </div>
        )
      })}
    </>
  )
}

export function TarjetaEvaluacion({ ev, anterior, puedeBorrar = false, onBorrar }) {
  const consolidados = valoresConsolidados(ev)
  const proms = promediosPorArea(consolidados)
  const general = promedioGeneral(consolidados)
  const resumen = promediosResumen(consolidados)
  const cargadas = Object.keys(ev.valores || {}).length
  const dif = diferencias(ev)

  function delta(v) {
    const ant = valoresConsolidados(anterior)?.[v]
    const act = consolidados[v]
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
      <div className="mini" style={{ marginTop: 2 }}>
        {ev.revisado_en
          ? `Revisada por ${ev.revisor_email}${dif.length ? ` · ${dif.length} ${dif.length === 1 ? 'diferencia' : 'diferencias'} para hablar` : ' · sin diferencias grandes'}`
          : '⏳ Falta la revisión cruzada'}
      </div>
      <div className="fila" style={{ marginTop: 6, gap: 6 }}>
        {general != null && (
          <span className="badge eval-general">
            {ev.revisado_en ? 'Final' : 'General'}: {general}★
          </span>
        )}
        {GRUPOS.filter((g) => g.value !== 'general' && resumen[g.value] != null).map((g) => (
          <span key={g.value} className="badge eval-grupo">{g.label}: {resumen[g.value]}★</span>
        ))}
        {proms.map((p) => (
          <span key={p.area} className="badge eval-prom">{p.label}: {p.promedio}★</span>
        ))}
      </div>
      {ev.comentario && <p style={{ fontSize: '0.9rem', marginTop: 6 }}>{ev.comentario}</p>}
      {ev.comentario_revisor && (
        <p style={{ fontSize: '0.9rem', marginTop: 4 }}>
          <span className="mini">Revisión: </span>{ev.comentario_revisor}
        </p>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>
          Ver detalle ({cargadas} variables)
        </summary>
        <div style={{ marginTop: 6 }}>
          {ev.revisado_en ? (
            <Comparacion ev={ev} />
          ) : (
            Object.entries(VARIABLES_EVAL)
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
              ))
          )}
        </div>
        {puedeBorrar && (
          <button
            className="btn peligro chico"
            style={{ marginTop: 8 }}
            onClick={(e) => { e.preventDefault(); onBorrar(ev.id) }}
          >
            Borrar evaluación
          </button>
        )}
      </details>
    </div>
  )
}
