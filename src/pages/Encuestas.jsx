import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { fechaCorta } from '../helpers.js'
import { descargarArchivo, verOCompartirArchivo } from '../pdf.js'
import {
  generarCuestionarioPDF, generarReporteEncuestaPDF, nombreCuestionario, nombreReporteEncuesta,
} from '../encuestaPDF.js'
import { irA, reponer } from '../navegacion.js'
import { numeroWhatsApp, Telefono } from '../telefono.jsx'
import {
  analizarEncuesta, claveNueva, conOpciones, PEDIDO_AYUDA_POR_DEFECTO, insertarEnBloque, limpiarPreguntas, reemplazarPregunta, renombrarBloque, MINIMO_RESPUESTAS, opcionesDe, preguntasPorDefecto, puntosBajos,
  TIPOS_POR_VALUE, TIPOS_PREGUNTA,
} from '../encuesta.js'
import EncuestaPublica from './EncuestaPublica.jsx'

// Encuesta anónima a los jugadores, del lado de la cabeza de división y el
// dueño (la API la cierra al resto): crear la encuesta, ajustar las
// preguntas, mandar a cada chico su link por WhatsApp, seguir quién contestó
// y, ya cerrada, ver los resultados. Los pedidos de ayuda los ve solo la
// cabeza de división. Vive en el hash: #/staff/encuestas/<id>/<vista>.

const ESTADOS = {
  borrador: { label: 'Borrador', clase: 'inactivo' },
  abierta: { label: 'Abierta', clase: 'medica-ok' },
  cerrada: { label: 'Cerrada', clase: 'extra' },
}

const enDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const linkDe = (token) => `${location.origin}/#/encuesta/${token}`

// A quién va el link: al celular del chico si lo tiene, si no al del tutor
function destinoDe(l) {
  if (numeroWhatsApp(l.telefono)) return { numero: l.telefono, propio: true }
  if (numeroWhatsApp(l.tutor_telefono)) return { numero: l.tutor_telefono, propio: false }
  return null
}

function mensajeDe(l, titulo) {
  const url = linkDe(l.token)
  const destino = destinoDe(l)
  if (destino?.propio) {
    return `¡Hola ${l.nombre}! Te mandamos la encuesta de fin de año de Rugby M12 del Lawn Tennis (${titulo}). ` +
      `Es anónima: nadie va a saber qué contestaste. Contestala vos solo, tarda unos 10 minutos. ` +
      `El link es solo tuyo y sirve una vez:\n${url}`
  }
  return `¡Hola${l.tutor_nombre ? ` ${l.tutor_nombre}` : ''}! Les mandamos la encuesta de fin de año de Rugby M12 ` +
    `del Lawn Tennis (${titulo}) para ${l.nombre}. Es anónima y la tiene que contestar ${l.nombre} solo, sin ayuda: ` +
    `les pedimos que le presten el celular y lo dejen tranquilo unos 10 minutos. El link es personal y sirve una vez:\n${url}`
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------
function ListaEncuestas({ onAbrir }) {
  const [lista, setLista] = useState(null)
  const [creando, setCreando] = useState(false)
  const [titulo, setTitulo] = useState(`Encuesta de fin de año ${new Date().getFullYear()}`)
  const [cierra, setCierra] = useState(enDias(14))
  const [error, setError] = useState('')

  useEffect(() => { api('encuestas').then(setLista).catch(() => setLista([])) }, [])

  async function crear(e) {
    e.preventDefault()
    setError('')
    try {
      const d = await api('encuestas', { method: 'POST', body: { titulo, cierra } })
      onAbrir(d.encuesta.id, 'preguntas')
    } catch {
      setError('No se pudo crear la encuesta.')
    }
  }

  return (
    <>
      <div className="tarjeta">
        <h2>📝 Encuesta a los jugadores</h2>
        <p className="mini" style={{ marginTop: 2 }}>
          Los chicos la contestan desde el celular, el suyo o el del tutor, con un
          link personal que sirve una sola vez. Es anónima: las respuestas se
          guardan sin el nombre y los resultados se ven recién cuando la encuesta
          cierra. Al final se suman al informe de gestión.
        </p>
        {!creando ? (
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setCreando(true)}>+ Nueva encuesta</button>
        ) : (
          <form onSubmit={crear} style={{ marginTop: 10 }}>
            <div className="campo">
              <label>Título</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
            </div>
            <div className="campo">
              <label>Último día para contestar</label>
              <input type="date" value={cierra} onChange={(e) => setCierra(e.target.value)} />
            </div>
            <p className="mini">Arranca con las preguntas de siempre. Después las podés cambiar, sacar o sumar otras.</p>
            {error && <div className="error">{error}</div>}
            <div className="fila" style={{ marginTop: 8 }}>
              <button className="btn crece">Crear</button>
              <button type="button" className="btn sec" onClick={() => setCreando(false)}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
      {lista === null && <div className="vacio">Cargando…</div>}
      {lista?.length === 0 && <div className="vacio">Todavía no hay encuestas.</div>}
      {lista?.map((e) => (
        <button key={e.id} className="tarjeta tarjeta-boton" onClick={() => onAbrir(e.id)}>
          <div className="fila entre">
            <b>{e.titulo}</b>
            <span className={`badge ${ESTADOS[e.estado].clase}`}>{ESTADOS[e.estado].label}</span>
          </div>
          <div className="mini" style={{ marginTop: 4 }}>
            {e.cantidad_preguntas} preguntas
            {e.links ? ` · respondieron ${e.respondieron} de ${e.links}` : ''}
            {e.cierra ? ` · ${e.estado === 'cerrada' ? 'cerró' : 'cierra'} el ${fechaCorta(e.cerrada || e.cierra)}` : ''}
          </div>
        </button>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Editor de preguntas
// ---------------------------------------------------------------------------
// `onListo` guarda la pregunta: devuelve un texto de error si no se pudo, y
// entonces el formulario queda abierto con lo que se escribió
function EditorPregunta({ inicial, bloques, onListo, onCancelar }) {
  const [p, setP] = useState({ ...inicial, opcionesTexto: (inicial.opciones || []).join('\n') })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const conLado = ['frecuencia', 'si_no', 'si_nose_no'].includes(p.tipo)

  async function confirmar(e) {
    e.preventDefault()
    if (guardando) return
    setError('')
    setGuardando(true)
    const { opcionesTexto, ...resto } = p
    const problema = await onListo({
      ...resto,
      texto: p.texto.trim(),
      bloque: p.bloque.trim() || 'Preguntas',
      opciones: conOpciones(p.tipo) ? opcionesTexto.split('\n').map((o) => o.trim()).filter(Boolean) : undefined,
      negativa: conLado && p.negativa,
      segmento: p.tipo === 'opciones' && p.segmento,
    })
    // Si salió bien, el formulario ya se cerró; si no, se muestra el problema
    if (problema) {
      setError(problema)
      setGuardando(false)
    }
  }

  return (
    <form className="enc-editor" onSubmit={confirmar}>
      <div className="campo">
        <label>Pregunta</label>
        <textarea rows={2} required autoFocus value={p.texto} onChange={(e) => set('texto', e.target.value)} />
      </div>
      <div className="grid2">
        <div className="campo">
          <label>Parte</label>
          <input list="enc-bloques" value={p.bloque} onChange={(e) => set('bloque', e.target.value)} />
          <datalist id="enc-bloques">{bloques.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <div className="campo">
          <label>Respuesta</label>
          <select value={p.tipo} onChange={(e) => set('tipo', e.target.value)}>
            {TIPOS_PREGUNTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      {conOpciones(p.tipo) && (
        <div className="campo">
          <label>
            Opciones (una por renglón, de 2 a 8)
            {p.tipo === 'varias' ? ' · el chico puede marcar varias' : ' · el chico elige una'}
          </label>
          <textarea rows={4} value={p.opcionesTexto} onChange={(e) => set('opcionesTexto', e.target.value)} />
        </div>
      )}
      <label className="opcion-seccion">
        <input type="checkbox" checked={!!p.obligatoria} onChange={(e) => set('obligatoria', e.target.checked)} />
        <span>Obligatoria<span className="mini"> · sin contestarla no se puede seguir</span></span>
      </label>
      {conLado && (
        <label className="opcion-seccion">
          <input type="checkbox" checked={!!p.negativa} onChange={(e) => set('negativa', e.target.checked)} />
          <span>Pregunta en negativo<span className="mini"> · lo bueno es contestar "no" o "nunca", como en "me molestaron"</span></span>
        </label>
      )}
      {p.tipo === 'opciones' && (
        <label className="opcion-seccion">
          <input type="checkbox" checked={!!p.segmento} onChange={(e) => set('segmento', e.target.checked)} />
          <span>Separar los resultados por esta pregunta<span className="mini"> · como los años en el club; solo puede haber una</span></span>
        </label>
      )}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      <div className="fila" style={{ marginTop: 8 }}>
        <button className="btn chico crece" disabled={guardando}>{guardando ? 'Guardando…' : 'Listo'}</button>
        <button type="button" className="btn sec chico" disabled={guardando} onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  )
}

// El pedido para hablar del final ("Quiero que alguien del club hable
// conmigo"): se edita o se saca acá. No es una pregunta: va aparte de las
// respuestas anónimas y llega con el nombre. Se puede cambiar mientras la
// encuesta no esté cerrada, aunque ya haya respuestas (no toca ninguna).
function PedidoAyuda({ datos, onGuardado }) {
  const pedido = datos.encuesta.pedido_ayuda
  const editable = datos.encuesta.estado !== 'cerrada'
  const [form, setForm] = useState(null) // { texto, aclaracion } mientras se edita
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar(nuevo) {
    setGuardando(true)
    setError('')
    try {
      onGuardado(await api(`encuestas/${datos.encuesta.id}`, { method: 'PUT', body: { pedido_ayuda: nuevo } }))
      setForm(null)
    } catch (e) {
      setError(e.detalle || 'No se pudo guardar. Revisá la conexión y probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function sacar() {
    if (!confirm('¿Sacar el pedido para hablar? Los chicos no van a tener cómo pedir, desde la encuesta, '
      + 'que alguien del club hable con ellos. Se puede volver a poner.')) return
    guardar({ ...pedido, activo: false })
  }

  return (
    <div className={`enc-pedido${pedido.activo ? '' : ' sacado'}`}>
      <div className="enc-bloque">Al final · Pedido para hablar</div>
      {form ? (
        <form className="enc-editor" onSubmit={(e) => { e.preventDefault(); guardar({ activo: true, ...form }) }}>
          <div className="campo">
            <label>Lo que marca el chico</label>
            <textarea rows={2} required autoFocus maxLength={200} value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })} />
          </div>
          <div className="campo">
            <label>Aclaración (opcional)</label>
            <textarea rows={3} maxLength={400} value={form.aclaracion}
              onChange={(e) => setForm({ ...form, aclaracion: e.target.value })} />
          </div>
          <button type="button" className="enc-desmarcar" onClick={() => setForm({ texto: PEDIDO_AYUDA_POR_DEFECTO.texto, aclaracion: PEDIDO_AYUDA_POR_DEFECTO.aclaracion })}>
            Usar el texto de siempre
          </button>
          <p className="mini" style={{ marginTop: 6 }}>
            Llega siempre a la cabeza de división, con el nombre del chico y aparte de sus respuestas.
          </p>
          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
          <div className="fila" style={{ marginTop: 8 }}>
            <button className="btn chico crece" disabled={guardando}>{guardando ? 'Guardando…' : 'Listo'}</button>
            <button type="button" className="btn sec chico" disabled={guardando} onClick={() => { setForm(null); setError('') }}>Cancelar</button>
          </div>
        </form>
      ) : pedido.activo ? (
        <div className="enc-fila-pregunta">
          <div className="crece">
            <div style={{ fontSize: '0.92rem' }}>☐ {pedido.texto}</div>
            {pedido.aclaracion && <div className="mini">{pedido.aclaracion}</div>}
          </div>
          {editable && (
            <div className="enc-acciones">
              <button className="btn sec chico" title="Editar" onClick={() => setForm({ texto: pedido.texto, aclaracion: pedido.aclaracion })}>✏️</button>
              <button className="btn peligro chico" title="Sacar" disabled={guardando} onClick={sacar}>🗑</button>
            </div>
          )}
        </div>
      ) : (
        <div className="fila entre" style={{ marginTop: 4 }}>
          <span className="mini crece">Esta encuesta no tiene pedido para hablar.</span>
          {editable && (
            <button className="btn sec chico" disabled={guardando} onClick={() => guardar({ ...pedido, activo: true })}>
              + Volver a ponerlo
            </button>
          )}
        </div>
      )}
      {!form && error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  )
}

function Preguntas({ datos, onGuardado, onVistaPrevia }) {
  const editable = datos.editable
  const [preguntas, setPreguntas] = useState(datos.encuesta.preguntas)
  const [editando, setEditando] = useState(null) // índice, o 'nueva'
  // Parte en la que nace la pregunta nueva (la del "+" de cada parte)
  const [bloqueNueva, setBloqueNueva] = useState(null)
  const [renombrando, setRenombrando] = useState(null) // { viejo, nombre }
  const [resaltada, setResaltada] = useState(null) // clave de la recién agregada o movida
  const [cambios, setCambios] = useState(false)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false) // aviso "Guardado" un momento
  const bloques = [...new Set(preguntas.map((p) => p.bloque))]
  const lista = useRef(null)

  useEffect(() => {
    if (!guardado) return
    const t = setTimeout(() => setGuardado(false), 2500)
    return () => clearTimeout(t)
  }, [guardado])

  // La pregunta recién puesta en su lugar se lleva a la vista y se marca un
  // momento, para que se vea dónde quedó
  useEffect(() => {
    if (!resaltada) return
    lista.current?.querySelector(`[data-clave="${resaltada}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setResaltada(null), 2500)
    return () => clearTimeout(t)
  }, [resaltada])

  function cambiar(nuevas) {
    setPreguntas(nuevas)
    setCambios(true)
    setError('')
  }

  function mover(i, d) {
    const j = i + d
    if (j < 0 || j >= preguntas.length) return
    const n = [...preguntas];
    [n[i], n[j]] = [n[j], n[i]]
    cambiar(n)
  }

  // Guarda la lista entera en el servidor y la deja como quedó guardada.
  // Devuelve el problema en palabras si no se pudo (y no toca nada).
  async function persistir(nuevas) {
    let limpias
    try { limpias = limpiarPreguntas(nuevas) } catch (e) { return e.detalle || 'Revisá la pregunta.' }
    try {
      const d = await api(`encuestas/${datos.encuesta.id}`, { method: 'PUT', body: { preguntas: limpias } })
      setPreguntas(d.encuesta.preguntas)
      setCambios(false)
      setError('')
      setGuardado(true)
      onGuardado(d)
      return null
    } catch (e) {
      return e.error === 'preguntas_bloqueadas'
        ? 'Ya llegó al menos una respuesta: las preguntas no se pueden cambiar.'
        : e.detalle || 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
    }
  }

  // "Listo" guarda en el momento. La pregunta nueva va al final de su parte;
  // una editada que cambió de parte, también (src/encuesta.js). Si hay otros
  // cambios sin guardar (orden, preguntas sacadas), se guardan junto con ella.
  async function confirmar(i, p) {
    const clave = i === 'nueva' ? claveNueva(p.texto, preguntas.map((x) => x.clave)) : p.clave
    // Primero la pregunta sola, para que el error hable de ella y no de su
    // número en la lista
    try { limpiarPreguntas([{ ...p, clave }]) } catch (e) {
      return (e.detalle || 'Revisá la pregunta.').replace(/^La pregunta 1 /, 'Esta pregunta ')
    }
    const nuevas = i === 'nueva'
      ? insertarEnBloque(preguntas, { ...p, clave })
      : reemplazarPregunta(preguntas, i, p)
    const problema = await persistir(nuevas)
    if (problema) return problema
    if (i === 'nueva' || preguntas[i].bloque !== p.bloque) setResaltada(clave)
    setEditando(null)
    setBloqueNueva(null)
    return null
  }

  function nuevaEn(bloque) {
    setRenombrando(null)
    setBloqueNueva(bloque)
    setEditando('nueva')
  }

  // El "Listo" del nombre de una parte también guarda en el momento
  async function confirmarNombre(e) {
    e.preventDefault()
    const { viejo, nombre } = renombrando
    if (nombre.trim() === viejo) { setRenombrando(null); return }
    if (bloques.includes(nombre.trim())
        && !confirm(`Ya hay una parte "${nombre.trim()}". ¿Juntar las dos en una sola?`)) return
    let nuevas
    try {
      nuevas = renombrarBloque(preguntas, viejo, nombre)
    } catch (err) {
      setError(err.detalle || 'La parte necesita un nombre.')
      return
    }
    setRenombrando({ ...renombrando, guardando: true })
    const problema = await persistir(nuevas)
    if (problema) {
      setError(problema)
      setRenombrando({ ...renombrando, guardando: false })
      return
    }
    setRenombrando(null)
  }

  async function guardar() {
    setError('')
    setGuardando(true)
    const problema = await persistir(preguntas)
    if (problema) setError(problema)
    setGuardando(false)
  }

  const nueva = {
    clave: '', texto: '', tipo: 'frecuencia',
    bloque: bloqueNueva || bloques[bloques.length - 2] || bloques[0] || 'Preguntas',
    obligatoria: true, negativa: false,
  }
  // El formulario de la nueva se abre al final de su parte (o abajo de todo)
  const ultimaDe = (b) => preguntas.reduce((u, p, i) => (p.bloque === b ? i : u), -1)
  const formNuevaEn = editando === 'nueva' && bloqueNueva ? ultimaDe(bloqueNueva) : -1
  const formNueva = (
    <EditorPregunta
      inicial={nueva}
      bloques={bloques}
      onListo={(x) => confirmar('nueva', x)}
      onCancelar={() => { setEditando(null); setBloqueNueva(null) }}
    />
  )

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <h3>
          Preguntas ({preguntas.length})
          {guardado && <span className="enc-guardado">✓ Guardado</span>}
        </h3>
        <button className="btn sec chico" onClick={() => onVistaPrevia(preguntas)}>👀 Vista previa</button>
      </div>
      {!editable && (
        <div className="aviso" style={{ margin: '8px 0' }}>
          {datos.encuesta.estado === 'cerrada'
            ? 'La encuesta está cerrada: las preguntas quedan como se contestaron.'
            : 'Ya llegó al menos una respuesta: las preguntas no se pueden cambiar.'}
        </div>
      )}
      {editable && (
        <p className="mini" style={{ margin: '2px 0 8px' }}>
          Se pueden cambiar, ordenar, sacar o sumar hasta que llegue la primera
          respuesta. Las de siempre conviene dejarlas iguales de un año al otro:
          así se pueden comparar.
        </p>
      )}
      <div ref={lista}>
      {preguntas.map((p, i) => (
        <div key={p.clave || i}>
        {(i === 0 || preguntas[i - 1].bloque !== p.bloque) && (
          renombrando?.viejo === p.bloque ? (
            <form className="enc-renombrar" onSubmit={confirmarNombre}>
              <input
                autoFocus
                maxLength={60}
                value={renombrando.nombre}
                onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })}
              />
              <button className="btn chico" disabled={renombrando.guardando}>{renombrando.guardando ? 'Guardando…' : 'Listo'}</button>
              <button type="button" className="btn sec chico" disabled={renombrando.guardando} onClick={() => setRenombrando(null)}>Cancelar</button>
            </form>
          ) : (
            <div className="enc-bloque-fila">
              <span className="enc-bloque">{p.bloque}</span>
              {editable && (
                <span className="enc-bloque-acciones">
                  <button type="button" title="Cambiar el nombre de la parte" onClick={() => { setEditando(null); setRenombrando({ viejo: p.bloque, nombre: p.bloque }) }}>
                    ✏️ Nombre
                  </button>
                  <button type="button" title="Agregar una pregunta al final de esta parte" onClick={() => nuevaEn(p.bloque)}>
                    + Pregunta
                  </button>
                </span>
              )}
            </div>
          )
        )}
        <div data-clave={p.clave} className={`enc-fila-pregunta${resaltada === p.clave ? ' resaltada' : ''}`}>
          {editando === i ? (
            <EditorPregunta inicial={p} bloques={bloques} onListo={(x) => confirmar(i, x)} onCancelar={() => setEditando(null)} />
          ) : (
            <>
              <div className="crece">
                <div style={{ fontSize: '0.92rem' }}><b>{i + 1}.</b> {p.texto}</div>
                <div className="mini">
                  {TIPOS_POR_VALUE[p.tipo]?.label}
                  {conOpciones(p.tipo) ? `: ${(p.opciones || []).join(' · ')}` : ''}
                  {p.negativa ? ' · en negativo' : ''}
                  {!p.obligatoria ? ' · opcional' : ''}
                  {p.segmento ? ' · separa los resultados' : ''}
                </div>
              </div>
              {editable && (
                <div className="enc-acciones">
                  <button className="btn sec chico" title="Subir" onClick={() => mover(i, -1)}>↑</button>
                  <button className="btn sec chico" title="Bajar" onClick={() => mover(i, 1)}>↓</button>
                  <button className="btn sec chico" title="Editar" onClick={() => setEditando(i)}>✏️</button>
                  <button
                    className="btn peligro chico"
                    title="Sacar"
                    onClick={() => confirm(`¿Sacar la pregunta "${p.texto}"?`) && cambiar(preguntas.filter((_, k) => k !== i))}
                  >
                    🗑
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {editable && formNuevaEn === i && formNueva}
        </div>
      ))}
      </div>
      {editable && editando === 'nueva' && formNuevaEn === -1 && formNueva}
      <PedidoAyuda datos={datos} onGuardado={onGuardado} />
      {editable && (
        <>
          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
          <div className="fila" style={{ marginTop: 10 }}>
            <button className="btn sec" onClick={() => nuevaEn(null)}>+ Pregunta nueva</button>
            <button
              className="btn sec"
              onClick={() => confirm('¿Volver a las preguntas de siempre? Se pierden los cambios.') && cambiar(preguntasPorDefecto())}
            >
              Volver a las de siempre
            </button>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={!cambios || guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : cambios ? 'Guardar los cambios' : 'Todo guardado'}
          </button>
          <p className="mini" style={{ marginTop: 6 }}>
            Al tocar "Listo", la pregunta o el nombre de la parte se guardan solos. El
            botón de arriba guarda el orden, las preguntas que sacaste y la vuelta a las
            de siempre.
          </p>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'sin_enviar', label: 'Sin enviar' },
  { value: 'pendientes', label: 'Sin responder' },
  { value: 'respondieron', label: 'Respondieron' },
]

function Links({ datos, onCambio, yo }) {
  const { encuesta, links } = datos
  const [filtro, setFiltro] = useState('sin_enviar')
  // Aviso al celular por cada respuesta (cada uno lo prende para sí mismo)
  const meAvisa = (encuesta.avisar_a || []).includes(yo?.email)
  const [cambiandoAviso, setCambiandoAviso] = useState(false)

  async function alternarAviso() {
    setCambiandoAviso(true)
    try {
      await api(`encuestas/${encuesta.id}/avisarme`, { method: 'PUT', body: { activo: !meAvisa } })
      onCambio()
    } catch {
      alert('No se pudo cambiar el aviso. Probá de nuevo.')
    } finally {
      setCambiandoAviso(false)
    }
  }
  const [copiado, setCopiado] = useState(null)
  const respondieron = links.filter((l) => l.usado).length
  const enviados = links.filter((l) => l.enviado).length
  const sinTelefono = links.filter((l) => !l.usado && !destinoDe(l)).length

  const visibles = links.filter((l) => (
    filtro === 'todos' ? true
      : filtro === 'sin_enviar' ? !l.enviado && !l.usado
        : filtro === 'pendientes' ? !l.usado
          : l.usado))

  async function marcar(l, enviado) {
    await api(`encuestas/${encuesta.id}/links/${l.jugador_id}`, { method: 'PUT', body: { enviado } })
    onCambio()
  }

  function whatsapp(l) {
    const destino = destinoDe(l)
    // La ventana se abre en el toque mismo (si no, el celular la bloquea) y
    // después se marca como enviado
    window.open(`https://wa.me/${numeroWhatsApp(destino.numero)}?text=${encodeURIComponent(mensajeDe(l, encuesta.titulo))}`, '_blank')
    marcar(l, true)
  }

  async function copiar(l) {
    try {
      await navigator.clipboard.writeText(linkDe(l.token))
      setCopiado(l.jugador_id)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      prompt('Copiá el link:', linkDe(l.token))
    }
  }

  async function linkNuevo(l) {
    if (!confirm(`¿Darle un link nuevo a ${l.nombre}? El que ya le mandaste deja de funcionar.`)) return
    await api(`encuestas/${encuesta.id}/links/${l.jugador_id}/nuevo`, { method: 'POST' })
    onCambio()
  }

  if (encuesta.estado === 'borrador') {
    return (
      <div className="tarjeta">
        <h3>Links</h3>
        <p className="suave">Cuando abras la encuesta, la app arma un link para cada chico y te deja mandarlo por WhatsApp.</p>
      </div>
    )
  }

  return (
    <div className="tarjeta">
      <h3>Links de cada chico</h3>
      {encuesta.estado === 'abierta' && (
        <label className="opcion-seccion enc-aviso-respuestas">
          <input type="checkbox" checked={meAvisa} disabled={cambiandoAviso} onChange={alternarAviso} />
          <span>
            <b>🔔 Avisarme al celular cada vez que llega una respuesta</b>
            <span className="mini" style={{ display: 'block' }}>
              El aviso dice cuántas van, nunca quién ni qué contestó. Llega a los celulares
              donde activaste los avisos (Staff → Avisos en este celular).
            </span>
          </span>
        </label>
      )}
      <div className="stat-grid" style={{ margin: '8px 0' }}>
        <div className="stat"><div className="valor">{respondieron}/{links.length}</div><div className="etiqueta">Respondieron</div></div>
        <div className="stat"><div className="valor">{enviados}</div><div className="etiqueta">Links enviados</div></div>
        <div className="stat"><div className="valor">{links.length ? Math.round((100 * respondieron) / links.length) : 0}%</div><div className="etiqueta">Participación</div></div>
      </div>
      {encuesta.estado === 'abierta' && (
        <p className="mini" style={{ margin: '0 0 8px' }}>
          El botón de WhatsApp abre el chat con el mensaje ya escrito: va al celular
          del chico si lo tiene cargado, y si no al del tutor. Se ve quién contestó,
          nunca qué contestó.
        </p>
      )}
      {sinTelefono > 0 && encuesta.estado === 'abierta' && (
        <div className="aviso" style={{ marginBottom: 8 }}>
          {sinTelefono} {sinTelefono === 1 ? 'chico no tiene' : 'chicos no tienen'} ningún celular válido cargado.
          Cargalo en su ficha o en el padrón, o copiales el link y mandalo a mano.
        </div>
      )}
      <div className="chips" style={{ marginBottom: 8 }}>
        {FILTROS.map((f) => (
          <button key={f.value} type="button" className={`chip${filtro === f.value ? ' activo' : ''}`} onClick={() => setFiltro(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      {!visibles.length && <div className="vacio" style={{ padding: 12 }}>Nadie en esta lista.</div>}
      {visibles.map((l) => {
        const destino = destinoDe(l)
        return (
          <div key={l.jugador_id} className="enc-link">
            <div className="fila entre" style={{ flexWrap: 'nowrap' }}>
              <b className="crece">{l.apellido}, {l.nombre}</b>
              {l.usado
                ? <span className="badge medica-ok">Respondió</span>
                : l.enviado ? <span className="badge activo">Enviado</span>
                  : <span className="badge inactivo">Sin enviar</span>}
            </div>
            {!l.usado && encuesta.estado === 'abierta' && (
              <>
                <div className="mini">
                  {destino
                    ? <>{destino.propio ? 'Celular del chico' : `Celular del tutor${l.tutor_nombre ? ` (${l.tutor_nombre})` : ''}`} · <Telefono numero={destino.numero} /></>
                    : 'Sin celular cargado'}
                </div>
                <div className="fila" style={{ marginTop: 6 }}>
                  <button className="btn chico crece" disabled={!destino} onClick={() => whatsapp(l)}>
                    📲 {l.enviado ? 'Mandar de nuevo' : 'Mandar por WhatsApp'}
                  </button>
                  <button className="btn sec chico" onClick={() => copiar(l)}>
                    {copiado === l.jugador_id ? '¡Copiado!' : 'Copiar link'}
                  </button>
                  <button className="btn sec chico" title="Darle un link nuevo" onClick={() => linkNuevo(l)}>↻</button>
                </div>
                {l.enviado && (
                  <button className="enc-desmarcar" onClick={() => marcar(l, false)}>No le llegó: marcar como sin enviar</button>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resultados (también los usa el informe en pantalla)
// ---------------------------------------------------------------------------
function Barra({ etiqueta, valor, proporcion, color }) {
  return (
    <div className="barra-fila">
      <div className="fila entre" style={{ flexWrap: 'nowrap', gap: 8 }}>
        <span className="crece" style={{ fontSize: '0.85rem' }}>{etiqueta}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{valor}</span>
      </div>
      <div className="barra">
        <div className="barra-relleno" style={{ width: `${Math.max(proporcion * 100, proporcion > 0 ? 1.5 : 0)}%`, background: color }} />
      </div>
    </div>
  )
}

const colorFavorable = (v) => (v == null ? 'var(--primario)' : v >= 75 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--bad)')
const textoVariacion = (v) => (v == null ? '' : v === 0 ? ' · igual que la anterior' : ` · ${v > 0 ? '+' : '−'}${Math.abs(v)} vs. la anterior`)

// El reporte con análisis de una encuesta cerrada: en pantalla, la lectura y
// las alertas; el PDF completo se comparte o se baja desde acá
function ReporteEncuesta({ datos, yo }) {
  const [aviso, setAviso] = useState('')
  const r = datos.resultados
  const respondieron = datos.links.filter((l) => l.usado).length
  const extra = {
    links: datos.links.length, respondieron,
    pedidos: datos.pedidos_total, pedidos_pendientes: datos.pedidos_pendientes,
  }
  const a = analizarEncuesta(r, extra)

  function armarPDF() {
    return generarReporteEncuestaPDF({
      encuesta: datos.encuesta, resultados: r, links: datos.links.length, respondieron,
      pedidos: datos.pedidos_total, pedidosPendientes: datos.pedidos_pendientes,
      generadoPor: yo?.nombre || yo?.email,
    }).blob()
  }

  async function compartir() {
    setAviso('')
    const res = await verOCompartirArchivo(armarPDF(), nombreReporteEncuesta(datos.encuesta.titulo),
      `Reporte de la encuesta · ${datos.encuesta.titulo}`)
    if (res === 'descargado') setAviso('Este dispositivo no puede compartir archivos: el PDF se descargó y lo podés adjuntar a mano.')
  }

  return (
    <div className="tarjeta">
      <h3>Reporte con análisis</h3>
      {a ? (
        <>
          <p className="mini" style={{ margin: '2px 0 8px' }}>
            La lectura sale sola de los resultados. El PDF suma cada pregunta con sus
            respuestas, lo que escribieron y sugerencias para conversar en el staff. No
            lleva ningún nombre.
          </p>
          {a.lectura.map((f, i) => <p key={i} className="enc-lectura">{f}</p>)}
          {a.alertas.length > 0 && (
            <div className="aviso" style={{ marginTop: 8 }}>
              <b>Alertas de cuidado</b>
              <ul className="enc-alertas">{a.alertas.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {a.sugerencias.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--primario)' }}>
                Sugerencias para el staff ({a.sugerencias.length})
              </summary>
              {a.sugerencias.map((s, i) => (
                <div key={i} className="enc-sugerencia">
                  <div className="mini"><b>{s.pregunta}</b> · {s.favorable}% favorable</div>
                  <div style={{ fontSize: '0.88rem' }}>{s.sugerencia}</div>
                </div>
              ))}
            </details>
          )}
        </>
      ) : (
        <p className="mini" style={{ margin: '2px 0 8px' }}>
          Con menos de {MINIMO_RESPUESTAS} respuestas el reporte sale sin resultados, solo con la participación.
        </p>
      )}
      {aviso && <div className="aviso" style={{ marginTop: 8 }}>{aviso}</div>}
      <div className="fila" style={{ marginTop: 10 }}>
        <button className="btn crece" onClick={compartir}>📤 Compartir reporte</button>
        <button className="btn sec" onClick={() => descargarArchivo(armarPDF(), nombreReporteEncuesta(datos.encuesta.titulo))}>
          Descargar
        </button>
      </div>
    </div>
  )
}

export function ResultadosEncuesta({ r, links }) {
  if (!r) return null
  if (!r.suficientes) {
    return (
      <div className="tarjeta">
        <h3>Resultados</h3>
        <p className="suave">
          Llegaron {r.respuestas} {r.respuestas === 1 ? 'respuesta' : 'respuestas'}. Con menos de {MINIMO_RESPUESTAS} no
          se muestran: en un grupo tan chico se podría adivinar quién dijo qué.
        </p>
      </div>
    )
  }
  const bajos = puntosBajos(r)
  return (
    <>
      <div className="tarjeta">
        <h3>Resultados</h3>
        {r.anterior && <p className="mini" style={{ marginTop: 2 }}>Comparados con "{r.anterior.titulo}".</p>}
        <div className="stat-grid" style={{ marginTop: 8 }}>
          <div className="stat">
            <div className="valor">{r.respuestas}</div>
            <div className="etiqueta">Respuestas{links ? ` de ${links}` : ''}</div>
          </div>
          <div className="stat">
            <div className="valor">{r.indice ?? '—'}</div>
            <div className="etiqueta">Índice general</div>
            {r.indice_anterior != null && <div className="mini">antes {r.indice_anterior}</div>}
          </div>
          {r.nota && (
            <div className="stat">
              <div className="valor">{r.nota.promedio?.toFixed(1).replace('.', ',') ?? '—'}</div>
              <div className="etiqueta">Nota al año</div>
              {r.nota.anterior != null && <div className="mini">antes {r.nota.anterior.toFixed(1).replace('.', ',')}</div>}
            </div>
          )}
        </div>
        <p className="mini" style={{ marginTop: 8 }}>
          El índice es el promedio del porcentaje de respuestas favorables de las
          preguntas cerradas: siempre o casi siempre, sí, o no en las preguntas en negativo.
        </p>
      </div>

      {bajos.length > 0 && (
        <div className="tarjeta">
          <h3>Para mirar primero</h3>
          <p className="mini" style={{ margin: '2px 0 8px' }}>Las preguntas con menos respuestas favorables.</p>
          {bajos.map((b) => (
            <Barra key={b.clave} etiqueta={b.texto} valor={`${b.favorable}%`} proporcion={b.favorable / 100} color={colorFavorable(b.favorable)} />
          ))}
        </div>
      )}

      <div className="tarjeta">
        <h3>Por parte</h3>
        {r.bloques.map((b) => (
          <Barra key={b.nombre} etiqueta={b.nombre} valor={`${b.indice}`} proporcion={b.indice / 100} color={colorFavorable(b.indice)} />
        ))}
        {r.segmentos.length > 0 && (
          <>
            <h4 style={{ marginTop: 12 }}>{r.segmento}</h4>
            {r.segmentos.map((s) => (
              <div key={s.label} className="mini" style={{ marginTop: 4 }}>
                <b>{s.label}</b>: {s.suficientes
                  ? `índice ${s.indice ?? '—'}${s.nota != null ? ` · nota ${s.nota.toFixed(1).replace('.', ',')}` : ''} · ${s.respuestas} respuestas`
                  : `${s.respuestas} ${s.respuestas === 1 ? 'respuesta' : 'respuestas'}, muy pocas para mostrar`}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="tarjeta">
        <h3>Pregunta por pregunta</h3>
        {r.preguntas.filter((p) => p.tipo !== 'abierta' && !p.segmento).map((p) => (
          <div key={p.clave} className="enc-resultado">
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{p.texto}</div>
            <div className="mini">
              {p.favorable != null ? `${p.favorable}% favorable` : ''}
              {p.tipo === 'nota' && p.promedio != null ? ` · promedio ${p.promedio.toFixed(1).replace('.', ',')}` : ''}
              {p.tipo === 'estrellas' && p.promedio != null ? ` · promedio ${p.promedio.toFixed(1).replace('.', ',')} de 5` : ''}
              {textoVariacion(p.variacion)}
              {` · ${p.n} respuestas`}
            </div>
            {p.tipo === 'varias' ? (
              <div style={{ marginTop: 8 }}>
                <div className="mini" style={{ marginBottom: 4 }}>Cada chico pudo marcar varias: los porcentajes pueden sumar más de 100.</div>
                {[...p.opciones].sort((a, b) => b.cantidad - a.cantidad).map((o) => (
                  <Barra key={o.value} etiqueta={o.label} valor={`${o.cantidad} · ${o.pct ?? 0}%`} proporcion={(o.pct || 0) / 100} color="var(--primario)" />
                ))}
              </div>
            ) : (
            <div
              className={`enc-distribucion${p.tipo === 'nota' ? ' nota' : ''}`}
              style={p.tipo === 'nota' ? undefined : { gridTemplateColumns: `repeat(${p.opciones.length}, 1fr)` }}
            >
              {p.opciones.map((o) => (
                <div key={String(o.value)} className="enc-dist-item">
                  <div className="enc-dist-barra">
                    <div style={{ height: `${o.pct || 0}%`, background: o.favorable === true ? 'var(--ok)' : o.favorable === false ? 'var(--bad)' : 'var(--primario)' }} />
                  </div>
                  <div className="enc-dist-label">{o.cara || o.label}</div>
                  <div className="enc-dist-valor">{o.cantidad}</div>
                </div>
              ))}
            </div>
            )}
          </div>
        ))}
      </div>

      {r.preguntas.filter((p) => p.tipo === 'abierta').map((p) => (
        <div key={p.clave} className="tarjeta">
          <h3>{p.texto}</h3>
          {!p.textos.length && <p className="mini">Nadie escribió nada.</p>}
          {p.textos.map((t, i) => <p key={i} className="enc-texto-libre">“{t}”</p>)}
        </div>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pedidos de ayuda (solo la cabeza de división)
// ---------------------------------------------------------------------------
function Pedidos({ datos, onCambio }) {
  async function marcar(p, atendido) {
    await api(`encuestas/pedidos/${p.id}`, { method: 'PUT', body: { atendido } })
    onCambio()
  }
  return (
    <div className="tarjeta">
      <h3>Pedidos para hablar</h3>
      <p className="mini" style={{ margin: '2px 0 8px' }}>
        Chicos que marcaron "quiero que alguien del club hable conmigo" al final de la
        encuesta. El pedido llega aparte: no dice nada de lo que contestaron.
      </p>
      {!datos.pedidos.length && <div className="vacio" style={{ padding: 12 }}>Ningún pedido.</div>}
      {datos.pedidos.map((p) => (
        <div key={p.id} className="enc-link">
          <div className="fila entre" style={{ flexWrap: 'nowrap' }}>
            <b className="crece">{p.apellido}, {p.nombre}</b>
            {p.atendido ? <span className="badge medica-ok">Atendido</span> : <span className="badge lesionado">Pendiente</span>}
          </div>
          <div className="mini">
            Pedido el {fechaCorta(p.fecha)}
            {p.telefono && <> · Chico: <Telefono numero={p.telefono} /></>}
            {p.tutor_telefono && <> · Tutor{p.tutor_nombre ? ` (${p.tutor_nombre})` : ''}: <Telefono numero={p.tutor_telefono} /></>}
          </div>
          <button className="btn sec chico" style={{ marginTop: 6 }} onClick={() => marcar(p, !p.atendido)}>
            {p.atendido ? 'Volver a pendiente' : 'Marcar como atendido'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detalle de una encuesta
// ---------------------------------------------------------------------------
function DetalleEncuesta({ id, vista, yo }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const [editandoDatos, setEditandoDatos] = useState(false)
  const [form, setForm] = useState({ titulo: '', cierra: '' })

  async function cargar() {
    try { setDatos(await api(`encuestas/${id}`)) } catch (e) { setError(e) }
  }
  useEffect(() => { cargar() }, [id])

  const vistas = useMemo(() => {
    if (!datos) return []
    const v = [{ id: 'preguntas', label: 'Preguntas' }, { id: 'links', label: 'Links' }]
    if (datos.encuesta.estado === 'cerrada') v.push({ id: 'resultados', label: 'Resultados' })
    if (datos.pedidos) v.push({ id: 'pedidos', label: `Pedidos${datos.pedidos_pendientes ? ` (${datos.pedidos_pendientes})` : ''}` })
    return v
  }, [datos])

  if (error) return <div className="vacio">No se pudo abrir la encuesta.</div>
  if (!datos) return <div className="vacio">Cargando…</div>
  // El cuestionario en PDF. Desde la vista previa lleva las preguntas tal
  // como están ahí, aunque todavía no se hayan guardado; desde el encabezado,
  // las guardadas.
  const compartirCuestionario = (preguntas) => verOCompartirArchivo(
    generarCuestionarioPDF({
      titulo: datos.encuesta.titulo, preguntas, cierra: datos.encuesta.cierra,
      generadoPor: yo?.nombre || yo?.email, pedidoAyuda: datos.encuesta.pedido_ayuda,
    }).blob(),
    nombreCuestionario(datos.encuesta.titulo),
    `Encuesta a los jugadores · ${datos.encuesta.titulo}`)

  if (vistaPrevia) {
    return (
      <EncuestaPublica
        vistaPrevia={{ titulo: datos.encuesta.titulo, preguntas: vistaPrevia, pedido_ayuda: datos.encuesta.pedido_ayuda }}
        onCerrar={() => setVistaPrevia(null)}
        onPDF={() => compartirCuestionario(vistaPrevia)}
      />
    )
  }

  const { encuesta } = datos
  const porDefecto = encuesta.estado === 'borrador' ? 'preguntas' : encuesta.estado === 'abierta' ? 'links' : 'resultados'
  const actual = vistas.some((v) => v.id === vista) ? vista : porDefecto

  async function accion(ruta, pregunta) {
    if (pregunta && !confirm(pregunta)) return
    try {
      setDatos(await api(`encuestas/${id}/${ruta}`, { method: 'POST' }))
      if (ruta === 'abrir' || ruta === 'cerrar') cambiarVista(ruta === 'abrir' ? 'links' : 'resultados')
    } catch {
      alert('No se pudo. Probá de nuevo.')
    }
  }

  async function borrar() {
    if (!confirm('¿Borrar esta encuesta? No tiene respuestas, así que no se pierde nada contestado.')) return
    await api(`encuestas/${id}`, { method: 'DELETE' })
    irA('staff', 'encuestas')
  }

  async function guardarDatos(e) {
    e.preventDefault()
    try {
      setDatos(await api(`encuestas/${id}`, { method: 'PUT', body: { titulo: form.titulo, cierra: form.cierra || null } }))
      setEditandoDatos(false)
    } catch {
      alert('No se pudieron guardar los datos.')
    }
  }

  return (
    <>
      <div className="tarjeta">
        {editandoDatos ? (
          <form onSubmit={guardarDatos}>
            <div className="campo">
              <label>Título</label>
              <input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="campo">
              <label>Último día para contestar</label>
              <input type="date" value={form.cierra} onChange={(e) => setForm({ ...form, cierra: e.target.value })} />
            </div>
            <div className="fila">
              <button className="btn chico crece">Guardar</button>
              <button type="button" className="btn sec chico" onClick={() => setEditandoDatos(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            <div className="fila entre">
              <h2 className="crece">{encuesta.titulo}</h2>
              <span className={`badge ${ESTADOS[encuesta.estado].clase}`}>{ESTADOS[encuesta.estado].label}</span>
            </div>
            <div className="mini" style={{ marginTop: 4 }}>
              {encuesta.estado === 'cerrada'
                ? `Cerró el ${fechaCorta(encuesta.cerrada)}`
                : encuesta.cierra ? `Se puede contestar hasta el ${fechaCorta(encuesta.cierra)} inclusive` : 'Sin fecha de cierre'}
              {datos.links.length ? ` · respondieron ${datos.links.filter((l) => l.usado).length} de ${datos.links.length}` : ''}
            </div>
            {!datos.hay_cabeza && datos.encuesta.pedido_ayuda?.activo && (
              <div className="aviso" style={{ marginTop: 8 }}>
                No hay nadie activo con el rol Cabeza de división: si un chico pide hablar
                con alguien del club, el pedido no le llega a nadie.
              </div>
            )}
            {!datos.pedidos && datos.pedidos_pendientes > 0 && (
              <div className="aviso" style={{ marginTop: 8 }}>
                Hay {datos.pedidos_pendientes} {datos.pedidos_pendientes === 1 ? 'pedido' : 'pedidos'} de chicos para
                hablar con alguien del club. Los ve la cabeza de división.
              </div>
            )}
            <div className="fila" style={{ marginTop: 10 }}>
              {encuesta.estado !== 'cerrada' && (
                <button className="btn sec chico" onClick={() => { setForm({ titulo: encuesta.titulo, cierra: encuesta.cierra || '' }); setEditandoDatos(true) }}>
                  Editar datos
                </button>
              )}
              {encuesta.estado === 'borrador' && (
                <button className="btn chico" onClick={() => accion('abrir', 'Al abrirla se arma un link para cada chico. Las preguntas se pueden seguir cambiando hasta que llegue la primera respuesta. ¿Abrir la encuesta?')}>
                  Abrir y armar los links
                </button>
              )}
              {encuesta.estado === 'abierta' && (
                <button className="btn sec chico" onClick={() => accion('cerrar', 'Al cerrarla los links dejan de funcionar y se ven los resultados. No se puede volver a abrir. ¿Cerrar la encuesta?')}>
                  Cerrar ahora
                </button>
              )}
              {datos.respuestas === 0 && <button className="btn peligro chico" onClick={borrar}>Borrar</button>}
            </div>
            {/* La encuesta tal como la ven los chicos, en cualquier estado y
                desde cualquier solapa: también abierta, mientras se mandan los
                links, y cerrada */}
            <div className="fila" style={{ marginTop: 8 }}>
              <button className="btn sec chico crece" onClick={() => setVistaPrevia(encuesta.preguntas)}>👀 Vista previa</button>
              <button className="btn sec chico crece" onClick={() => compartirCuestionario(encuesta.preguntas)}>📄 Compartir en PDF</button>
            </div>
          </>
        )}
      </div>

      <div className="chips" style={{ margin: '0 0 10px' }}>
        {vistas.map((v) => (
          <button key={v.id} type="button" className={`chip${actual === v.id ? ' activo' : ''}`} onClick={() => cambiarVista(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {actual === 'preguntas' && <Preguntas key={encuesta.id} datos={datos} onGuardado={setDatos} onVistaPrevia={setVistaPrevia} />}
      {actual === 'links' && <Links datos={datos} onCambio={cargar} yo={yo} />}
      {actual === 'resultados' && (
        <>
          <ReporteEncuesta datos={datos} yo={yo} />
          <ResultadosEncuesta r={datos.resultados} links={datos.links.length} />
        </>
      )}
      {actual === 'pedidos' && datos.pedidos && <Pedidos datos={datos} onCambio={cargar} />}
    </>
  )

  // Cambiar de solapa reemplaza el hash (no suma historial). replaceState no
  // dispara hashchange, así que se avisa a mano para que Staff relea la vista.
  function cambiarVista(nueva) {
    reponer('staff', 'encuestas', id, nueva)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}

export default function Encuestas({ yo, id, vista, onVolver }) {
  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={id ? () => irA('staff', 'encuestas') : onVolver}>← Volver</button>
        <span className="mini">Encuesta a los jugadores</span>
      </div>
      {id
        ? <DetalleEncuesta id={id} vista={vista} yo={yo} />
        : <ListaEncuestas onAbrir={(nuevo, v) => irA('staff', 'encuestas', nuevo, ...(v ? [v] : []))} />}
    </div>
  )
}
