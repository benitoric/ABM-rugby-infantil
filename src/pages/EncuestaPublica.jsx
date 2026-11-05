import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { bloquesDe, LARGO_TEXTO_LIBRE, opcionesDe, respuestaValida } from '../encuesta.js'

// La encuesta tal como la ve el chico: la abre con su link personal
// (#/encuesta/<token>), sin login. Va de a un bloque por pantalla, con botones
// grandes para tocar en el celular. Lo que va contestando queda guardado en
// el teléfono hasta que lo manda, por si se cierra la página a la mitad.
//
// Con `vistaPrevia` ({ titulo, preguntas }) muestra la misma encuesta sin
// link ni envío: es lo que usa la cabeza de división para revisarla.

const claveBorrador = (token) => `rugby_m12_encuesta_${token}`

function leerBorrador(token) {
  try { return JSON.parse(localStorage.getItem(claveBorrador(token)) || 'null') || {} } catch { return {} }
}
function guardarBorrador(token, datos) {
  try { localStorage.setItem(claveBorrador(token), JSON.stringify(datos)) } catch { /* modo privado */ }
}
function borrarBorrador(token) {
  try { localStorage.removeItem(claveBorrador(token)) } catch { /* modo privado */ }
}

function Pregunta({ p, valor, onChange, marcarFalta }) {
  const opciones = opcionesDe(p)
  const falta = marcarFalta && p.obligatoria && !respuestaValida(p, valor)
  return (
    <div className={`enc-pregunta${falta ? ' falta' : ''}`}>
      <div className="enc-texto">{p.texto}</div>
      {p.tipo === 'abierta' ? (
        <>
          <textarea
            rows={3}
            maxLength={LARGO_TEXTO_LIBRE}
            value={valor || ''}
            placeholder="Escribí lo que quieras (no es obligatorio)"
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="mini" style={{ textAlign: 'right' }}>{(valor || '').length}/{LARGO_TEXTO_LIBRE}</div>
        </>
      ) : (
        <div className={`enc-opciones tipo-${p.tipo}`}>
          {opciones.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className={`enc-opcion${valor === o.value ? ' elegida' : ''}`}
              onClick={() => onChange(o.value)}
            >
              {o.cara && <span className="enc-cara">{o.cara}</span>}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
      {falta && <div className="enc-falta">Falta contestar esta.</div>}
    </div>
  )
}

export default function EncuestaPublica({ token, vistaPrevia = null, onCerrar, onPDF }) {
  const [estado, setEstado] = useState(vistaPrevia ? 'inicio' : 'cargando')
  const [encuesta, setEncuesta] = useState(vistaPrevia)
  const [respuestas, setRespuestas] = useState(() => (vistaPrevia ? {} : leerBorrador(token).respuestas || {}))
  const [hablar, setHablar] = useState(() => (vistaPrevia ? false : !!leerBorrador(token).hablar))
  const [paso, setPaso] = useState(0)
  const [marcarFalta, setMarcarFalta] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (vistaPrevia) return
    api(`encuesta-publica/${token}`)
      .then((d) => {
        setEncuesta(d)
        setEstado(d.estado === 'abierta' ? 'inicio' : d.estado)
      })
      .catch(() => setEstado('invalido'))
  }, [token, vistaPrevia])

  useEffect(() => {
    if (!vistaPrevia && estado === 'contestando') guardarBorrador(token, { respuestas, hablar })
  }, [respuestas, hablar, estado, token, vistaPrevia])

  useEffect(() => { window.scrollTo(0, 0) }, [paso, estado])

  const bloques = useMemo(() => bloquesDe(encuesta?.preguntas || []), [encuesta])
  const bloque = bloques[paso]
  const ultimo = paso === bloques.length - 1

  function responder(clave, valor) {
    setRespuestas((r) => ({ ...r, [clave]: valor }))
  }

  function completo(b) {
    return b.preguntas.every((p) => !p.obligatoria || respuestaValida(p, respuestas[p.clave]))
  }

  function siguiente() {
    if (!completo(bloque)) { setMarcarFalta(true); return }
    setMarcarFalta(false)
    setPaso(paso + 1)
  }

  async function enviar() {
    if (!completo(bloque)) { setMarcarFalta(true); return }
    if (vistaPrevia) { setEstado('gracias'); return }
    setError('')
    setEstado('enviando')
    try {
      await api(`encuesta-publica/${token}`, { method: 'POST', body: { respuestas, hablar } })
      borrarBorrador(token)
      setEstado('gracias')
    } catch (e) {
      if (e.error === 'ya_respondida') { borrarBorrador(token); setEstado('respondida'); return }
      if (e.error === 'encuesta_cerrada') { setEstado('cerrada'); return }
      setEstado('contestando')
      setError(e.error === 'faltan_respuestas'
        ? 'Faltan algunas respuestas. Volvé atrás y fijate las que están marcadas.'
        : 'No se pudo mandar. Revisá que tengas internet y probá de nuevo: lo que contestaste no se pierde.')
    }
  }

  const encabezado = (
    <header className="enc-header">
      <div className="enc-club">🏉 Rugby M12 · Tucumán Lawn Tennis</div>
      {encuesta?.titulo && <div className="enc-titulo">{encuesta.titulo}</div>}
      {vistaPrevia && (
        <div className="enc-vista-previa">
          <span className="crece">Vista previa: así la ven los chicos. No se guarda nada.</span>
          {onPDF && <button type="button" onClick={onPDF}>📄 Compartir PDF</button>}
          {onCerrar && <button type="button" onClick={onCerrar}>Cerrar</button>}
        </div>
      )}
    </header>
  )

  let cuerpo = null
  if (estado === 'cargando') cuerpo = <div className="vacio">Cargando…</div>
  else if (estado === 'invalido') {
    cuerpo = (
      <div className="tarjeta enc-mensaje">
        <div className="enc-grande">🔗</div>
        <h2>Este link no funciona</h2>
        <p>Puede que esté mal copiado o que te hayan mandado uno nuevo. Pedile el link a la cabeza de división.</p>
      </div>
    )
  } else if (estado === 'respondida') {
    cuerpo = (
      <div className="tarjeta enc-mensaje">
        <div className="enc-grande">✅</div>
        <h2>Esta encuesta ya está contestada</h2>
        <p>Cada link sirve una sola vez. ¡Gracias por participar!</p>
      </div>
    )
  } else if (estado === 'cerrada') {
    cuerpo = (
      <div className="tarjeta enc-mensaje">
        <div className="enc-grande">🔒</div>
        <h2>La encuesta ya cerró</h2>
        <p>Ya no se pueden mandar respuestas. ¡Gracias igual!</p>
      </div>
    )
  } else if (estado === 'gracias') {
    cuerpo = (
      <div className="tarjeta enc-mensaje">
        <div className="enc-grande">🙌</div>
        <h2>¡Gracias!</h2>
        <p>{vistaPrevia ? 'Acá termina la encuesta para los chicos.' : 'Tu respuesta llegó. Ya podés cerrar esta página.'}</p>
        {hablar && !vistaPrevia && (
          <p>Le avisamos a la cabeza de división que querés hablar con alguien del club.</p>
        )}
        {vistaPrevia && onCerrar && <button className="btn" onClick={onCerrar}>Volver</button>}
      </div>
    )
  } else if (estado === 'inicio') {
    cuerpo = (
      <div className="tarjeta enc-mensaje">
        <div className="enc-grande">👋</div>
        <h2>¡Hola!</h2>
        <p>Queremos saber cómo la pasaste este año en el rugby, para que el que viene sea mejor.</p>
        <ul className="enc-reglas">
          <li><b>Es anónima.</b> Nadie va a saber qué contestaste, tampoco los entrenadores.</li>
          <li><b>Contestala vos solo.</b> Si estás con el celular de tu mamá o tu papá, pediles que te dejen solo un rato.</li>
          <li><b>No es un examen.</b> No hay respuestas buenas ni malas: contestá lo que te pasa de verdad.</li>
          <li><b>Tarda unos 10 minutos.</b> Son {bloques.length} partes cortas.</li>
        </ul>
        <button className="btn enc-boton" onClick={() => setEstado('contestando')}>Empezar</button>
      </div>
    )
  } else if (bloque) {
    cuerpo = (
      <>
        <div className="enc-progreso">
          <div className="enc-progreso-texto">Parte {paso + 1} de {bloques.length} · {bloque.nombre}</div>
          <div className="barra"><div className="barra-relleno" style={{ width: `${((paso + 1) / bloques.length) * 100}%` }} /></div>
        </div>
        {bloque.preguntas.map((p) => (
          <Pregunta
            key={p.clave}
            p={p}
            valor={respuestas[p.clave]}
            onChange={(v) => responder(p.clave, v)}
            marcarFalta={marcarFalta}
          />
        ))}
        {ultimo && (
          <label className="enc-pregunta enc-hablar">
            <input type="checkbox" checked={hablar} onChange={(e) => setHablar(e.target.checked)} />
            <span>
              <b>Quiero que alguien del club hable conmigo.</b>
              <span className="mini" style={{ display: 'block', marginTop: 4 }}>
                Si lo marcás, le llega tu nombre a la cabeza de división, aparte de
                tus respuestas. Lo que contestaste sigue siendo anónimo.
              </span>
            </span>
          </label>
        )}
        {error && <div className="error" style={{ margin: '0 0 10px' }}>{error}</div>}
        <div className="enc-nav">
          {paso > 0 && (
            <button className="btn sec" onClick={() => { setMarcarFalta(false); setPaso(paso - 1) }}>← Atrás</button>
          )}
          {ultimo ? (
            <button className="btn crece enc-boton" disabled={estado === 'enviando'} onClick={enviar}>
              {estado === 'enviando' ? 'Mandando…' : 'Mandar mis respuestas'}
            </button>
          ) : (
            <button className="btn crece enc-boton" onClick={siguiente}>Siguiente →</button>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="enc-pagina">
      {encabezado}
      <main className="enc-contenido">{cuerpo}</main>
    </div>
  )
}
