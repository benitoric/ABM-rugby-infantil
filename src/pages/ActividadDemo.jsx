import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { nombreStaff } from '../helpers.js'

// Actividad de los invitados en la versión de prueba (#/staff/actividad). La
// ve solo el dueño: cuándo entró cada uno, qué secciones abrió y qué cargó,
// sin el contenido (server/actividad-demo.js).

const cuando = (m) => {
  if (!m) return '—'
  const d = new Date(m)
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Tucuman', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
const ICONO = { ingreso: '🔑', visita: '📱', seccion: '👀', accion: '✏️' }

function Invitado({ r }) {
  const [abierto, setAbierto] = useState(false)
  const nunca = !r.ultimo
  return (
    <div className="tarjeta">
      <div className="fila entre" style={{ alignItems: 'flex-start' }}>
        <div className="crece">
          <div style={{ fontWeight: 700 }}>{nombreStaff(r)}</div>
          <div className="mini">{r.email} · {r.rol || 'sin rol'}{!r.activo && ' · suspendido'}</div>
        </div>
        {nunca
          ? <span className="chip">{r.ingreso ? 'Sin actividad registrada' : 'Todavía no entró'}</span>
          : <span className="chip ok">Últ. vez {cuando(r.ultimo)}</span>}
      </div>

      {!nunca && (
        <>
          <div className="actividad-numeros">
            <div><b>{r.visitas}</b><span>visitas</span></div>
            <div><b>{r.dias}</b><span>{r.dias === 1 ? 'día' : 'días'}</span></div>
            <div><b>{r.acciones.reduce((s, a) => s + a.n, 0)}</b><span>cargas</span></div>
          </div>
          <div className="mini">Primera actividad: {cuando(r.primero)}</div>

          {r.secciones.length > 0 && (
            <div className="actividad-bloque">
              <div className="actividad-titulo">Secciones que abrió</div>
              <div className="actividad-chips">
                {r.secciones.map((s) => <span key={s.clave} className="chip">{s.nombre} · {s.n}</span>)}
              </div>
            </div>
          )}
          <div className="actividad-bloque">
            <div className="actividad-titulo">Qué cargó o modificó</div>
            {r.acciones.length
              ? <ul className="actividad-lista">{r.acciones.map((a) => <li key={a.texto}>{a.texto} <span className="mini">× {a.n}</span></li>)}</ul>
              : <div className="mini">Nada todavía: solo miró.</div>}
          </div>

          <button className="btn sec chico" onClick={() => setAbierto(!abierto)}>
            {abierto ? 'Ocultar el detalle' : 'Ver el detalle con fecha y hora'}
          </button>
          {abierto && (
            <ul className="actividad-lista actividad-detalle">
              {r.recientes.map((e, i) => (
                <li key={i}><span className="mini">{cuando(e.momento)}</span> {ICONO[e.tipo]} {e.detalle}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export default function ActividadDemo({ onVolver }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const cargar = () => {
    setError(null)
    api('demo/actividad').then(setDatos).catch((e) => setError(e.message || 'No se pudo cargar'))
  }
  useEffect(cargar, [])

  const lista = datos?.invitados || []
  const activos = lista.filter((r) => r.ultimo)
  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <button className="btn sec chico" onClick={cargar}>Actualizar</button>
      </div>
      <h2>👀 Actividad de los invitados</h2>
      <p className="mini" style={{ marginBottom: 12 }}>
        Solo de esta versión de prueba y solo la ves vos. Cuenta ingresos, secciones abiertas y
        qué tipo de cosas cargaron, nunca el contenido. Abrir la app de nuevo antes de 20
        minutos cuenta como la misma visita.
      </p>
      {error && <div className="tarjeta">⚠️ {error}</div>}
      {!datos && !error && <div className="vacio">Cargando…</div>}
      {datos && (
        <>
          <div className="mini" style={{ marginBottom: 8 }}>
            {lista.length} {lista.length === 1 ? 'invitado' : 'invitados'} · {activos.length} con actividad
          </div>
          {lista.length === 0 && <div className="tarjeta">Todavía no sumaste invitados en Staff.</div>}
          {lista.map((r) => <Invitado key={r.email} r={r} />)}
        </>
      )}
    </div>
  )
}
