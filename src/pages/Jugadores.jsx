import { useEffect, useState } from 'react'
import { api } from '../api.js'
import {
  estadoJugador, etiquetaPuestos, fechaCompacta, fechaCorta, nombreCompleto,
  tipoJugador, APTITUDES, ESTADOS, PUESTOS,
} from '../helpers.js'
import { promedioGeneral, valoresConsolidados } from '../evaluacion.js'
import { base64ABlob } from '../archivos.js'
import Ficha from './Ficha.jsx'

const VACIO = {
  nombre: '', apellido: '', fecha_nacimiento: '', dni: '', posicion: '', puestos: [],
  aptitudes: [], estado: 'activo', tutor_nombre: '', tutor_telefono: '',
  ficha_medica_vigente: false, ficha_medica_vence: '', observaciones: '',
}

export default function Jugadores() {
  const [jugadores, setJugadores] = useState([])
  const [filtro, setFiltro] = useState('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)
  const [fichaDe, setFichaDe] = useState(null)
  const [importando, setImportando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [orden, setOrden] = useState({ campo: 'nombre', asc: true })
  const [foto, setFoto] = useState(null)
  const [asign, setAsign] = useState(null)
  // Lesionados durante un partido sin la lesión cargada todavía en su ficha
  const [lesionesPendientes, setLesionesPendientes] = useState([])
  const [autoEvaluar, setAutoEvaluar] = useState(false)
  const [revisar, setRevisar] = useState(null)
  const [repartiendo, setRepartiendo] = useState(false)

  // Ampliación de la foto del DNI: se baja el archivo completo recién al tocarla
  async function abrirFoto(j) {
    setFoto({ jugador: j, url: null })
    try {
      const r = await api(`documentos/${j.documento_id}`)
      setFoto({ jugador: j, url: URL.createObjectURL(base64ABlob(r.datos, r.mime)) })
    } catch {
      setFoto(null)
    }
  }
  function cerrarFoto() {
    setFoto((f) => { if (f?.url) URL.revokeObjectURL(f.url); return null })
  }
  useEffect(() => {
    if (!foto) return
    const salir = (e) => { if (e.key === 'Escape') cerrarFoto() }
    document.addEventListener('keydown', salir)
    return () => document.removeEventListener('keydown', salir)
  }, [foto])

  async function cargar() {
    const [lista, asignaciones, lesiones] = await Promise.all([
      api('jugadores'), api('asignaciones'), api('stats/lesiones-pendientes'),
    ])
    setJugadores(lista)
    setAsign(asignaciones)
    setLesionesPendientes(lesiones)
    setCargando(false)
  }
  useEffect(() => { cargar().catch(() => setCargando(false)) }, [])

  async function repartir() {
    if (!confirm(
      `¿Repartir al azar los ${asign.sin_repartir} jugadores que necesitan evaluación ` +
      'entre los entrenadores?\n\nCada uno evalúa a su grupo y después su pareja ' +
      'cruzada revisa ese trabajo, a ciegas. Quedan afuera los managers y los ' +
      'preparadores físicos que no entrenan.'
    )) return
    setRepartiendo(true)
    try {
      const r = await api('asignaciones/repartir', { method: 'POST' })
      alert(`Listo: ${r.asignados} jugadores repartidos entre ${r.evaluadores} entrenadores.` +
        (r.cruzado ? '' : '\n\nHay un solo entrenador cargado, así que esta vuelta no hay revisión cruzada.'))
      await cargar()
    } catch (e) {
      alert(e?.error === 'sin_evaluadores'
        ? 'No hay entrenadores cargados en Staff con un rol que evalúe (cabeza de división, entrenador o PF/entrenador).'
        : 'No se pudo repartir. Probá de nuevo.')
    }
    setRepartiendo(false)
  }

  async function cancelarReparto() {
    if (!confirm('¿Cancelar el reparto y borrar todas las asignaciones pendientes?')) return
    await api('asignaciones', { method: 'DELETE' })
    cargar()
  }

  // Nota final del jugador: promedia las dos miradas cuando hubo revisión
  function promedioFinal(j) {
    return promedioGeneral(valoresConsolidados({
      valores: j.ultima_evaluacion_valores,
      valores_revisor: j.ultima_evaluacion_revisor,
    }))
  }

  function evaluarA(jugadorId) {
    setRevisar(null)
    setAutoEvaluar(true)
    setFichaDe(jugadorId)
  }

  function revisarA(a) {
    setAutoEvaluar(false)
    setRevisar({
      evaluacion_id: a.evaluacion_id,
      quien: [a.evaluo_nombre, a.evaluo_apellido].filter(Boolean).join(' ') || a.evaluo,
    })
    setFichaDe(a.jugador_id)
  }

  const visibles = jugadores.filter((j) => {
    if (filtro !== 'todos' && estadoJugador(j) !== filtro) return false
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return `${j.nombre} ${j.apellido} ${j.dni || ''}`.toLowerCase().includes(q)
  })

  const RANGO_ESTADO = { activo: 0, inhabilitado: 1, lesionado: 2, inactivo: 3 }
  const ordenados = [...visibles].sort((a, b) => {
    let cmp = 0
    if (orden.campo === 'puesto') cmp = (etiquetaPuestos(a) || 'zz').localeCompare(etiquetaPuestos(b) || 'zz')
    else if (orden.campo === 'aptitudes') cmp = (a.aptitudes || []).length - (b.aptitudes || []).length
    else if (orden.campo === 'estado') cmp = RANGO_ESTADO[estadoJugador(a)] - RANGO_ESTADO[estadoJugador(b)]
    else if (orden.campo === 'evaluacion') cmp = (a.ultima_evaluacion || '').localeCompare(b.ultima_evaluacion || '')
    const desempate = nombreCompleto(a).localeCompare(nombreCompleto(b), 'es')
    return (orden.asc ? 1 : -1) * (cmp || desempate)
  })

  function encabezado(campo, texto) {
    const activo = orden.campo === campo
    return (
      <button
        className={`orden-btn ${activo ? 'activo' : ''}`}
        onClick={() => setOrden({ campo, asc: activo ? !orden.asc : true })}
      >
        {texto}{activo ? (orden.asc ? ' ▲' : ' ▼') : ''}
      </button>
    )
  }

  if (fichaDe) {
    return (
      <Ficha
        jugadorId={fichaDe}
        evaluarAlAbrir={autoEvaluar}
        revisar={revisar}
        onVolver={() => { setFichaDe(null); setAutoEvaluar(false); setRevisar(null); cargar() }}
      />
    )
  }

  const activos = jugadores.filter((j) => j.estado !== 'inactivo')
  const mesActual = new Date().getMonth() + 1
  const cumples = activos
    .filter((j) => j.fecha_nacimiento && Number(j.fecha_nacimiento.split('-')[1]) === mesActual)
    .sort((a, b) => Number(a.fecha_nacimiento.split('-')[2]) - Number(b.fecha_nacimiento.split('-')[2]))
  return (
    <div className="contenido">
      <div className="fila entre">
        <h2>Jugadores ({visibles.length})</h2>
        <div className="fila">
          <button className="btn sec" onClick={() => setImportando(true)}>Importar lista</button>
          <button className="btn" onClick={() => setEditando({ ...VACIO })}>+ Nuevo</button>
        </div>
      </div>

      {lesionesPendientes.length > 0 && (
        <div className="tarjeta aviso-lesion">
          <h3>
            🚑 {lesionesPendientes.length === 1
              ? 'Un jugador se lesionó en un partido'
              : `${lesionesPendientes.length} jugadores se lesionaron en partidos`}
          </h3>
          <p className="mini" style={{ margin: '4px 0 8px' }}>
            Tocá cada nombre para cargar la lesión en su ficha y hacerle el
            seguimiento. El recordatorio desaparece cuando la lesión queda
            registrada (o si lo desmarcás en el día de partido).
          </p>
          {lesionesPendientes.map((l) => (
            <button
              key={`${l.jugador_id}-${l.evento_id}`}
              className="asignado-item"
              onClick={() => setFichaDe(l.jugador_id)}
            >
              <span className="crece">{l.apellido}, {l.nombre}</span>
              <span className="mini">
                {fechaCompacta(l.fecha)}{l.rival ? ` vs ${l.rival}` : ''} →
              </span>
            </button>
          ))}
        </div>
      )}

      {asign?.mias?.length > 0 && (
        <div className="tarjeta aviso-evaluar">
          <h3>📋 Te toca evaluar a {asign.mias.length} {asign.mias.length === 1 ? 'jugador' : 'jugadores'}</h3>
          <p className="mini" style={{ margin: '4px 0 8px' }}>
            Tocá cada nombre para cargar su evaluación. Después tu pareja la revisa.
          </p>
          {asign.mias.map((a) => (
            <button key={a.jugador_id} className="asignado-item" onClick={() => evaluarA(a.jugador_id)}>
              <span className="crece">{a.apellido}, {a.nombre}</span>
              <span className="mini">
                {a.ultima_evaluacion ? `últ. ${fechaCompacta(a.ultima_evaluacion)}` : 'sin evaluar'} →
              </span>
            </button>
          ))}
        </div>
      )}

      {asign?.revisar?.length > 0 && (
        <div className="tarjeta aviso-revisar">
          <h3>🙈 Te toca revisar {asign.revisar.length} {asign.revisar.length === 1 ? 'evaluación' : 'evaluaciones'}</h3>
          <p className="mini" style={{ margin: '4px 0 8px' }}>
            Cargás tu propia mirada sin ver la del primer evaluador. Recién al
            guardar aparecen las dos juntas y se marcan las diferencias.
          </p>
          {asign.revisar.map((a) => (
            <button key={a.jugador_id} className="asignado-item" onClick={() => revisarA(a)}>
              <span className="crece">{a.apellido}, {a.nombre}</span>
              <span className="mini">
                evaluó {[a.evaluo_nombre, a.evaluo_apellido].filter(Boolean).join(' ') || a.evaluo} →
              </span>
            </button>
          ))}
        </div>
      )}

      {(asign?.sin_repartir > 0 || asign?.por_evaluador?.length > 0) && (
        <div className="tarjeta">
          <h3>Reparto de evaluaciones</h3>
          {asign.sin_repartir > 0 ? (
            <>
              <p className="mini" style={{ margin: '4px 0 8px' }}>
                {asign.sin_repartir} {asign.sin_repartir === 1 ? 'jugador necesita' : 'jugadores necesitan'} evaluación
                (sin evaluar o con la última de hace más de 30 días).
              </p>
              <button className="btn sec" style={{ width: '100%' }} disabled={repartiendo} onClick={repartir}>
                {repartiendo ? 'Repartiendo…' : '🎲 Repartir entre los entrenadores'}
              </button>
            </>
          ) : (
            <p className="mini" style={{ marginTop: 4 }}>
              Todos los jugadores están evaluados o ya repartidos. 🙌
            </p>
          )}
          {asign.por_evaluador.length > 0 && (
            <>
              <div className="mini" style={{ marginTop: 10, fontWeight: 700 }}>
                Pendientes por entrenador (evaluar · revisar)
              </div>
              {asign.por_evaluador.map((e) => (
                <div key={e.staff_email} className="fila entre mini" style={{ marginTop: 3 }}>
                  <span>{[e.nombre, e.apellido].filter(Boolean).join(' ') || e.staff_email}</span>
                  <b>{e.evaluar} · {e.revisar}</b>
                </div>
              ))}
              <button className="btn peligro chico" style={{ marginTop: 10 }} onClick={cancelarReparto}>
                Cancelar reparto
              </button>
            </>
          )}
        </div>
      )}

      {cumples.length > 0 && (
        <div className="tarjeta">
          <h3>🎂 Cumpleaños de este mes</h3>
          {cumples.map((j) => (
            <div key={j.id} className="mini" style={{ marginTop: 4 }}>
              {Number(j.fecha_nacimiento.split('-')[2])}/{mesActual} — {nombreCompleto(j)} (cumple {new Date().getFullYear() - Number(j.fecha_nacimiento.split('-')[0])})
            </div>
          ))}
        </div>
      )}

      <input
        className="crece"
        style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: 10 }}
        placeholder="Buscar por nombre, apellido o DNI…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div className="fila">
        {[['activo', 'Activos'], ['inhabilitado', 'Inhabilitados'], ['lesionado', 'Lesionados'], ['inactivo', 'Inactivos'], ['todos', 'Todos']].map(([v, l]) => (
          <button key={v} className={`chip ${filtro === v ? 'activo' : ''}`} onClick={() => setFiltro(v)}>
            {l}
          </button>
        ))}
      </div>

      {filtro === 'inhabilitado' && visibles.length > 0 && (
        <button
          className="btn sec"
          onClick={async () => {
            if (!confirm(
              `¿Marcar ficha médica vigente a los ${visibles.length} jugadores inhabilitados?\n\n` +
              'Pasan a estado Activo. Se limpian los vencimientos viejos: cargá el ' +
              'vencimiento real de cada ficha cuando lo tengas, para que la app ' +
              'vuelva a avisar cuando venzan.'
            )) return
            const r = await api('jugadores/fichas-vigentes', { method: 'POST' })
            alert(`Listo: ${r.actualizados} jugadores pasaron a ficha vigente.`)
            cargar()
          }}
        >
          ✓ Marcar ficha médica vigente a los {visibles.length} inhabilitados
        </button>
      )}

      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && visibles.length === 0 && (
        <div className="vacio">No hay jugadores en esta vista. Agregá el primero con "+ Nuevo".</div>
      )}

      {!cargando && visibles.length > 0 && (
        <div className="fila-jugador tabla-cab">
          {encabezado('nombre', 'Jugador')}
          {encabezado('puesto', 'Puesto')}
          {encabezado('aptitudes', 'Aptitudes')}
          {encabezado('estado', 'Estado')}
          <div className="col-eval">{encabezado('evaluacion', 'Últ. eval.')}</div>
        </div>
      )}

      {ordenados.map((j) => (
        <button key={j.id} className="jugador-item compacto fila-jugador" onClick={() => setFichaDe(j.id)}>
          <div className="fila celda-nombre">
            {j.miniatura ? (
              <img
                className="avatar-foto"
                src={`data:image/jpeg;base64,${j.miniatura}`}
                alt={`DNI de ${nombreCompleto(j)}`}
                title="Tocá para ampliar el DNI"
                onClick={(e) => { e.stopPropagation(); abrirFoto(j) }}
              />
            ) : (
              <div className="avatar">{j.nombre[0]}{j.apellido[0]}</div>
            )}
            <div className="crece" style={{ minWidth: 0 }}>
              <div className="nombre-jugador">{nombreCompleto(j)}</div>
              <div className="eval-fecha-movil">
                {j.ultima_evaluacion ? (
                  <>
                    📋 {fechaCompacta(j.ultima_evaluacion)}
                    {promedioFinal(j) != null && (
                      <b> · {promedioFinal(j)}★</b>
                    )}
                  </>
                ) : 'Sin evaluar'}
              </div>
            </div>
          </div>
          <div>
            {tipoJugador(j) && (
              <span
                className={`badge puesto-${tipoJugador(j).toLowerCase()}`}
                title={etiquetaPuestos(j)}
              >
                {etiquetaPuestos(j).length > 14 ? tipoJugador(j) : (etiquetaPuestos(j) || tipoJugador(j))}
              </span>
            )}
          </div>
          <div className="etiquetas">
            {APTITUDES.filter((a) => (j.aptitudes || []).includes(a.value)).map((a) => (
              <span key={a.value} className="badge aptitud">{a.abrev}</span>
            ))}
          </div>
          <div>
            <span className={`badge ${estadoJugador(j)}`}>{ESTADOS[estadoJugador(j)]}</span>
          </div>
          <div className="col-eval mini">
            {j.ultima_evaluacion ? (
              <>
                <div>{fechaCorta(j.ultima_evaluacion)}</div>
                {promedioFinal(j) != null && (
                  <span className="badge eval-prom">
                    {promedioFinal(j)}★
                  </span>
                )}
              </>
            ) : '—'}
          </div>
        </button>
      ))}

      {editando && (
        <FormJugador
          inicial={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar() }}
        />
      )}

      {foto && (
        <div className="lightbox" onClick={cerrarFoto}>
          <button className="lightbox-cerrar" onClick={cerrarFoto} aria-label="Cerrar">✕</button>
          {foto.url ? (
            <img
              src={foto.url}
              alt={`DNI de ${nombreCompleto(foto.jugador)}`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="lightbox-cargando">Cargando…</div>
          )}
        </div>
      )}

      {importando && (
        <ImportarLista
          onCerrar={() => setImportando(false)}
          onImportado={() => { setImportando(false); cargar() }}
        />
      )}
    </div>
  )
}

function ImportarLista({ onCerrar, onImportado }) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const lineas = texto.split('\n').map(parsearLinea).filter(Boolean)
  const validos = lineas.filter((l) => !l.error)
  const invalidos = lineas.filter((l) => l.error)

  async function importar() {
    if (!validos.length) return
    setGuardando(true)
    setError('')
    try {
      await api('jugadores/lote', { method: 'POST', body: { jugadores: validos } })
      onImportado()
    } catch {
      setError('No se pudo importar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 12 }}>
          <h3>Importar lista de jugadores</h3>
          <button className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <p className="mini" style={{ marginBottom: 8 }}>
          <b>Opción 1 (recomendada):</b>{' '}
          <a href="plantilla-jugadores.xlsx" download>⬇ descargá la plantilla de Excel</a>,
          completala y pegá acá las filas copiadas (sin el encabezado): se cargan
          todos los datos de una (tutor, DNI, ficha médica, etc.).<br />
          <b>Opción 2:</b> escribí un jugador por línea: <b>Apellido, Nombre</b> ·{' '}
          <b>Nombre Apellido</b> · con fecha de nacimiento opcional después de punto
          y coma: <b>Pérez, Juan; 12/05/2014</b>
        </p>
        <div className="campo">
          <textarea
            style={{ minHeight: 140 }}
            placeholder={'Pérez, Juan; 12/05/2014\nGómez, Pedro\nLuis Díaz'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        {validos.length > 0 && (
          <div className="tarjeta" style={{ marginBottom: 10 }}>
            <b className="mini">Se van a crear {validos.length} jugadores:</b>
            {validos.map((l, i) => (
              <div key={i} className="mini">
                • {l.apellido}, {l.nombre}
                {l.fecha_nacimiento ? ` (nac. ${fechaCorta(l.fecha_nacimiento)})` : ''}
                {l.dni ? ` · DNI ${l.dni}` : ''}
                {l.posicion ? ` · ${l.posicion}` : ''}
                {l.tutor_nombre ? ` · tutor: ${l.tutor_nombre}` : ''}
                {l.ficha_medica_vence ? ` · ficha vence ${fechaCorta(l.ficha_medica_vence)}` : ''}
              </div>
            ))}
          </div>
        )}
        {invalidos.length > 0 && (
          <div className="error" style={{ marginBottom: 10 }}>
            Líneas que no se entienden (corregilas o se omiten): {invalidos.map((l) => `"${l.error}"`).join(', ')}
          </div>
        )}
        {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={!validos.length || guardando} onClick={importar}>
          {guardando ? 'Importando…' : `Importar ${validos.length} jugadores`}
        </button>
      </div>
    </div>
  )
}

function parsearFecha(texto) {
  const t = (texto || '').trim()
  if (!t) return null
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dmy) {
    const anio = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${anio}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return undefined // formato no reconocido
}

function parsearLinea(linea) {
  const l = linea.replace(/\r$/, '')
  if (!l.trim()) return null

  // Filas copiadas desde Excel: columnas separadas por tabulaciones,
  // en el orden de la plantilla.
  if (l.includes('\t')) {
    const c = l.split('\t').map((s) => s.trim())
    const [apellido, nombre, fnac, dni, posicion, tutor, telefono, vence, obs] = c
    if (/^apellido$/i.test(apellido)) return null // encabezado pegado: se omite
    if (!apellido || !nombre) return { error: l.slice(0, 50) }
    const fecha = parsearFecha(fnac)
    const fichaVence = parsearFecha(vence)
    if (fecha === undefined || fichaVence === undefined) return { error: l.slice(0, 50) }
    return {
      nombre, apellido,
      fecha_nacimiento: fecha,
      dni: dni || null,
      posicion: posicion || null,
      tutor_nombre: tutor || null,
      tutor_telefono: telefono || null,
      ficha_medica_vence: fichaVence,
      observaciones: obs || null,
    }
  }

  // Formato de texto simple
  const [parte, extra] = l.trim().split(';').map((s) => s.trim())
  let nombre, apellido
  if (parte.includes(',')) {
    ;[apellido, nombre] = parte.split(',').map((s) => s.trim())
  } else {
    const t = parte.split(/\s+/)
    nombre = t[0]
    apellido = t.slice(1).join(' ')
  }
  if (!nombre || !apellido) return { error: l.trim() }
  let fecha = null
  if (extra) {
    fecha = parsearFecha(extra)
    if (!fecha) return { error: l.trim() }
  }
  return { nombre, apellido, fecha_nacimiento: fecha }
}

export function FormJugador({ inicial, onCerrar, onGuardado }) {
  const [f, setF] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const esNuevo = !f.id

  function campo(k) {
    return {
      value: f[k] ?? '',
      onChange: (e) => setF({ ...f, [k]: e.target.value }),
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      if (esNuevo) await api('jugadores', { method: 'POST', body: f })
      else await api(`jugadores/${f.id}`, { method: 'PUT', body: f })
      onGuardado()
    } catch (err) {
      setError('No se pudo guardar. Revisá los datos y probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 12 }}>
          <h3>{esNuevo ? 'Nuevo jugador' : 'Editar jugador'}</h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>

        <div className="grid2">
          <div className="campo">
            <label>Nombre *</label>
            <input required {...campo('nombre')} />
          </div>
          <div className="campo">
            <label>Apellido *</label>
            <input required {...campo('apellido')} />
          </div>
          <div className="campo">
            <label>Fecha de nacimiento</label>
            <input type="date" {...campo('fecha_nacimiento')} />
          </div>
          <div className="campo">
            <label>DNI</label>
            <input inputMode="numeric" {...campo('dni')} />
          </div>
          <div className="campo" style={{ gridColumn: '1 / -1' }}>
            <label>Puestos (marcá todos los que puede jugar)</label>
            {['forward', 'back'].map((tipo) => (
              <div key={tipo} className="fila" style={{ gap: '4px 14px', marginTop: 4 }}>
                <span className="mini" style={{ width: 68 }}>{tipo === 'forward' ? 'Forwards' : 'Backs'}</span>
                {PUESTOS.filter((pu) => pu.tipo === tipo).map((pu) => (
                  <label key={pu.value} className="fila" style={{ gap: 6, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      style={{ width: 17, height: 17 }}
                      checked={(f.puestos || []).includes(pu.value)}
                      onChange={(e) => {
                        const actuales = f.puestos || []
                        setF({
                          ...f,
                          puestos: e.target.checked
                            ? [...actuales, pu.value]
                            : actuales.filter((x) => x !== pu.value),
                        })
                      }}
                    />
                    {pu.label}
                  </label>
                ))}
              </div>
            ))}
            {!(f.puestos || []).length && f.posicion && (
              <p className="mini" style={{ margin: '4px 0 0' }}>
                Sin puestos cargados vale la posición genérica anterior: {f.posicion}.
              </p>
            )}
          </div>
          <div className="campo" style={{ gridColumn: '1 / -1' }}>
            <label>Aptitudes (marcá todas las que correspondan)</label>
            <div className="fila" style={{ gap: '4px 14px' }}>
              {APTITUDES.map((a) => (
                <label key={a.value} className="fila" style={{ gap: 6, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    style={{ width: 17, height: 17 }}
                    checked={(f.aptitudes || []).includes(a.value)}
                    onChange={(e) => {
                      const actuales = f.aptitudes || []
                      setF({
                        ...f,
                        aptitudes: e.target.checked
                          ? [...actuales, a.value]
                          : actuales.filter((x) => x !== a.value),
                      })
                    }}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
          <div className="campo">
            <label>Estado</label>
            <select {...campo('estado')}>
              <option value="activo">Activo</option>
              <option value="lesionado">Lesionado</option>
              <option value="inactivo">Inactivo (baja)</option>
            </select>
          </div>
          <div className="campo">
            <label>Nombre del tutor</label>
            <input {...campo('tutor_nombre')} />
          </div>
          <div className="campo">
            <label>Teléfono del tutor</label>
            <input inputMode="tel" {...campo('tutor_telefono')} />
          </div>
        </div>

        <div className="grid2">
          <div className="campo">
            <label className="fila" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24 }}>
              <input
                type="checkbox"
                style={{ width: 18, height: 18 }}
                checked={!!f.ficha_medica_vigente}
                onChange={(e) => setF({ ...f, ficha_medica_vigente: e.target.checked })}
              />
              Ficha médica vigente
            </label>
          </div>
          <div className="campo">
            <label>Vencimiento ficha médica</label>
            <input type="date" {...campo('ficha_medica_vence')} />
          </div>
        </div>

        <div className="campo">
          <label>Observaciones (salud, alergias, notas)</label>
          <textarea {...campo('observaciones')} />
        </div>

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={guardando} style={{ width: '100%' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
