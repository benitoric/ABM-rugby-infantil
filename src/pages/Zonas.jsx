import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { nombreCompleto } from '../helpers.js'
import { irA, leerHash, reponer, suscribir } from '../navegacion.js'
import { Telefono } from '../telefono.jsx'
import {
  ANILLOS, KM_LEJOS, KM_MUY_LEJOS, PCT_MUY_LEJOS, anilloDe, clavesDe, distanciaKm, lugarParecido, nombreSugerido,
  textoKm, zonasDePool,
} from '../lugares.js'
import { buscarLugar } from '../geocodificar.js'
import Mapa from './Mapa.jsx'

// "Dónde viven": el barrio o la localidad de cada chico (nunca el domicilio)
// en un mapa, la zona de influencia del club, los pooles para llevarlos y
// traerlos y, para el cuerpo técnico, la asistencia según la distancia.
//
// El barrio se carga como texto libre en la ficha o el padrón. Lo que la app
// todavía no reconoce queda en "Sin ubicar": se ubica una vez en el mapa
// (confirmando lo que propone el buscador o tocando el mapa) y esa forma de
// escribirlo queda aprendida (server/lugares.js).
//
// La comparten las dos pantallas: Jugadores (#/jugadores/zonas/<vista>) y el
// Padrón de los managers (#/padron/zonas/<vista>). Los datos salen del padrón
// (lo administrativo); la asistencia, solo para el alcance completo, sale de
// `jugadores`, que la API les cierra a los managers.

const VISTAS = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'pooles', label: 'Pooles' },
  { id: 'pendientes', label: 'Sin ubicar' },
  { id: 'asistencia', label: 'Asistencia', completo: true }, // a entrenamientos
]

// Lugares a menos de esta distancia entre sí van en la misma zona de pool
const KM_POOL = 2.5

const pct = (n, total) => (total ? Math.round((100 * n) / total) : 0)

function mediana(valores) {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export default function Zonas({ yo, base }) {
  const completo = yo?.alcance === 'completo'
  const vistas = VISTAS.filter((v) => !v.completo || completo)
  const vistaDeHash = () => {
    const [, , v] = leerHash()
    return vistas.some((x) => x.id === v) ? v : 'mapa'
  }
  const [vista, setVista] = useState(vistaDeHash)
  useEffect(() => suscribir(() => {
    const [s, sub] = leerHash()
    if (s === base && sub === 'zonas') setVista(vistaDeHash())
  }), [])

  const [padron, setPadron] = useState(null)
  const [catalogo, setCatalogo] = useState(null)
  const [asistencias, setAsistencias] = useState(null)
  const [error, setError] = useState('')
  // Modal de ubicación: { textos, chicos } para un barrio nuevo, { lugar } para corregir uno
  const [ubicando, setUbicando] = useState(null)

  async function cargar() {
    const [p, c] = await Promise.all([api('padron'), api('lugares')])
    setPadron(p)
    setCatalogo(c)
  }
  useEffect(() => { cargar().catch(() => setError('No se pudieron cargar los datos. Probá de nuevo.')) }, [])
  useEffect(() => {
    if (vista !== 'asistencia' || !completo || asistencias) return
    api('jugadores').then(setAsistencias).catch(() => setAsistencias([]))
  }, [vista])

  function cambiarVista(v) {
    reponer(base, 'zonas', v)
    setVista(v)
  }

  const datos = useMemo(() => {
    if (!padron || !catalogo) return null
    const { club, lugares } = catalogo
    const porId = new Map(lugares.map((l) => [l.id, { ...l, km: distanciaKm(l, club), chicos: [] }]))
    const plantel = padron.filter((j) => j.estado !== 'inactivo')
    const sinBarrio = []
    const pendientes = []
    for (const j of plantel) {
      if (!j.barrio) sinBarrio.push(j)
      else if (!porId.has(j.lugar_id)) pendientes.push(j)
      else porId.get(j.lugar_id).chicos.push(j)
    }
    const conChicos = [...porId.values()]
      .filter((l) => l.chicos.length)
      .sort((a, b) => b.chicos.length - a.chicos.length || a.km - b.km)
    // Los pendientes, agrupados por cómo se escribió el barrio: se ubica una
    // vez por grupo, no por chico
    const grupos = new Map()
    for (const j of pendientes) {
      const [clave] = clavesDe(j.barrio)
      if (!grupos.has(clave)) grupos.set(clave, { clave, textos: [], chicos: [] })
      const g = grupos.get(clave)
      if (!g.textos.includes(j.barrio)) g.textos.push(j.barrio)
      g.chicos.push(j)
    }
    const gruposPendientes = [...grupos.values()]
      .map((g) => ({ ...g, parecido: lugarParecido(g.textos[0], lugares) }))
      .sort((a, b) => b.chicos.length - a.chicos.length)
    const ubicados = conChicos.reduce((s, l) => s + l.chicos.length, 0)
    const kmPorChico = conChicos.flatMap((l) => l.chicos.map(() => l.km))
    return {
      club, lugares, porId, plantel, sinBarrio, pendientes, conChicos, gruposPendientes,
      ubicados, kmMediana: mediana(kmPorChico),
    }
  }, [padron, catalogo])

  const volver = (
    <button className="btn sec chico" onClick={() => irA(base)}>
      ← {base === 'padron' ? 'Padrón' : 'Jugadores'}
    </button>
  )

  if (error) {
    return <div className="contenido">{volver}<div className="error" style={{ marginTop: 10 }}>{error}</div></div>
  }
  if (!datos) return <div className="vacio">Cargando…</div>

  const recargar = () => cargar().catch(() => setError('No se pudieron cargar los datos. Probá de nuevo.'))

  return (
    <div className="contenido">
      {volver}
      <h2 style={{ marginTop: 10 }}>Dónde viven</h2>
      <p className="suave">
        El barrio o la localidad de cada chico, nunca el domicilio. Se carga como
        texto libre en {completo ? 'la ficha o el padrón' : 'el padrón'}; la primera vez
        que aparece un barrio nuevo se ubica en el mapa y de ahí en más se reconoce solo.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="valor">{datos.ubicados}/{datos.plantel.length}</div>
          <div className="etiqueta">Ubicados</div>
        </div>
        <div className="stat">
          <div className="valor" style={datos.pendientes.length ? { color: 'var(--warn)' } : undefined}>
            {datos.pendientes.length}
          </div>
          <div className="etiqueta">Sin ubicar</div>
        </div>
        <div className="stat">
          <div className="valor" style={datos.sinBarrio.length ? { color: 'var(--warn)' } : undefined}>
            {datos.sinBarrio.length}
          </div>
          <div className="etiqueta">Sin barrio</div>
        </div>
        <div className="stat">
          <div className="valor">{datos.kmMediana == null ? '—' : textoKm(datos.kmMediana)}</div>
          <div className="etiqueta">Distancia típica</div>
        </div>
      </div>

      <div className="seg compacto" style={{ margin: '12px 0' }}>
        {vistas.map((v) => (
          <button key={v.id} className={vista === v.id ? 'activo' : ''} onClick={() => cambiarVista(v.id)}>
            {v.label}
            {v.id === 'pendientes' && datos.pendientes.length + datos.sinBarrio.length > 0
              && ` (${datos.pendientes.length + datos.sinBarrio.length})`}
          </button>
        ))}
      </div>

      {vista === 'mapa' && (
        <VistaMapa datos={datos} yo={yo} onCorregir={(lugar) => setUbicando({ lugar })} onCambio={recargar} />
      )}
      {vista === 'pooles' && <VistaPooles datos={datos} />}
      {vista === 'pendientes' && (
        <VistaPendientes
          datos={datos}
          onUbicar={(g) => setUbicando({ textos: g.textos, chicos: g.chicos })}
          onCambio={recargar}
        />
      )}
      {vista === 'asistencia' && completo && <VistaAsistencia datos={datos} jugadores={asistencias} />}

      {ubicando && (
        <UbicarLugar
          {...ubicando}
          club={datos.club}
          lugares={datos.lugares}
          onCerrar={() => setUbicando(null)}
          onListo={() => { setUbicando(null); recargar() }}
        />
      )}
    </div>
  )
}

// ---------- mapa, zona de influencia y distancias ----------

function VistaMapa({ datos, yo, onCorregir, onCambio }) {
  const [sel, setSel] = useState(null)
  const [pinClub, setPinClub] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const { club, conChicos, ubicados } = datos

  const puntos = useMemo(() => conChicos.map((l) => ({
    id: l.id, lat: l.lat, lng: l.lng, n: l.chicos.length,
    titulo: `${l.nombre} · ${l.chicos.length} ${l.chicos.length === 1 ? 'chico' : 'chicos'}`,
    resaltado: l.id === sel,
  })), [conChicos, sel])

  const elegido = conChicos.find((l) => l.id === sel)

  async function guardarClub() {
    setGuardando(true)
    try {
      await api('lugares/club', { method: 'PUT', body: pinClub })
      setPinClub(null)
      onCambio()
    } catch {
      alert('No se pudo guardar la ubicación del club.')
    }
    setGuardando(false)
  }

  async function borrar(l) {
    if (!confirm(`¿Borrar «${l.nombre}»?\n\nSus ${l.chicos.length} chicos vuelven a quedar sin ubicar, con el barrio tal como estaba cargado.`)) return
    try {
      await api(`lugares/${l.id}`, { method: 'DELETE' })
      setSel(null)
      onCambio()
    } catch {
      alert('No se pudo borrar el lugar.')
    }
  }

  const porAnillo = ANILLOS.map(() => 0)
  for (const l of conChicos) porAnillo[anilloDe(l.km)] += l.chicos.length

  return (
    <>
      {pinClub && (
        <div className="tarjeta aviso-faltas">
          Arrastrá el 📍 (o tocá el mapa) hasta la cancha del club y guardá.
          <div className="fila" style={{ marginTop: 8 }}>
            <button className="btn chico" disabled={guardando} onClick={guardarClub}>
              {guardando ? 'Guardando…' : 'Guardar ubicación del club'}
            </button>
            <button className="btn sec chico" onClick={() => setPinClub(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <Mapa
        club={club}
        puntos={puntos}
        onPunto={(id) => setSel(id === sel ? null : id)}
        pin={pinClub}
        onPin={pinClub ? setPinClub : undefined}
      />
      {yo?.admin && !pinClub && (
        <div className="fila entre" style={{ marginTop: 6 }}>
          <span className="mini">
            {club.guardada ? '🏉 = el club.' : '🏉 La ubicación del club es aproximada: ajustala para que las distancias sean precisas.'}
          </span>
          <button className="btn sec chico" onClick={() => setPinClub({ lat: club.lat, lng: club.lng })}>
            Mover el club
          </button>
        </div>
      )}

      {elegido && (
        <div className="tarjeta" style={{ marginTop: 10 }}>
          <div className="fila entre">
            <h3>📍 {elegido.nombre}</h3>
            <button className="btn sec chico" onClick={() => setSel(null)}>Cerrar</button>
          </div>
          <p className="mini">
            A {textoKm(elegido.km)} del club en línea recta · {elegido.chicos.length}{' '}
            {elegido.chicos.length === 1 ? 'chico' : 'chicos'}
          </p>
          <ul className="lista-zona">
            {elegido.chicos.map((j) => (
              <li key={j.id}>{nombreCompleto(j)} <span className="mini">· «{j.barrio}»</span></li>
            ))}
          </ul>
          <div className="fila" style={{ marginTop: 8 }}>
            <button className="btn sec chico" onClick={() => onCorregir(elegido)}>Corregir ubicación o nombre</button>
            {yo?.admin && <button className="btn peligro chico" onClick={() => borrar(elegido)}>Borrar lugar</button>}
          </div>
        </div>
      )}

      <div className="tarjeta" style={{ marginTop: 10 }}>
        <h3>Zona de influencia</h3>
        {!conChicos.length && <p className="mini">Todavía no hay chicos ubicados.</p>}
        {conChicos.map((l) => (
          <button key={l.id} className="barra-zona" onClick={() => setSel(l.id)}>
            <span className="barra-zona-nombre">{l.nombre}</span>
            <span className="barra-zona-fondo">
              <span className="barra-zona-relleno" style={{ width: `${pct(l.chicos.length, ubicados)}%` }} />
            </span>
            <span className="barra-zona-dato">{l.chicos.length} · {pct(l.chicos.length, ubicados)}%</span>
            <span className="barra-zona-km mini">{textoKm(l.km)}</span>
          </button>
        ))}
      </div>

      <div className="tarjeta">
        <h3>Distancia al club</h3>
        <p className="mini" style={{ marginBottom: 6 }}>
          En línea recta desde el centro del barrio: lo que se maneja de verdad es algo más.
        </p>
        {ANILLOS.map((a, i) => (
          <div key={a.etiqueta} className="barra-zona">
            <span className="barra-zona-nombre">{a.etiqueta}</span>
            <span className="barra-zona-fondo">
              <span className="barra-zona-relleno" style={{ width: `${pct(porAnillo[i], ubicados)}%` }} />
            </span>
            <span className="barra-zona-dato">{porAnillo[i]} · {pct(porAnillo[i], ubicados)}%</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- pooles ----------

function VistaPooles({ datos }) {
  const zonas = useMemo(() => zonasDePool(datos.conChicos, KM_POOL)
    .map((lugares) => {
      const chicos = lugares.flatMap((l) => l.chicos.map((j) => ({ ...j, lugar: l })))
        .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'))
      const kms = lugares.map((l) => l.km)
      return {
        lugares: [...lugares].sort((a, b) => b.chicos.length - a.chicos.length),
        chicos, kmMin: Math.min(...kms), kmMax: Math.max(...kms),
      }
    })
    .sort((a, b) => b.chicos.length - a.chicos.length || a.kmMin - b.kmMin), [datos])

  const conPool = zonas.filter((z) => z.chicos.length > 1)
  const solos = zonas.filter((z) => z.chicos.length === 1)

  async function copiar(z) {
    const titulo = `Pool ${z.lugares.map((l) => l.nombre).join(' / ')}`
    const texto = [titulo, ...z.chicos.map((j) =>
      `- ${nombreCompleto(j)} (${j.lugar.nombre})` +
      (j.tutor_nombre || j.tutor_telefono ? ` · ${[j.tutor_nombre, j.tutor_telefono].filter(Boolean).join(' ')}` : ''))].join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      alert('Lista copiada: pegala en el grupo de WhatsApp.')
    } catch {
      prompt('Copiá la lista:', texto)
    }
  }

  const distancia = (z) => (Math.round(z.kmMin) === Math.round(z.kmMax)
    ? `a ${textoKm(z.kmMin)} del club`
    : `a ${textoKm(z.kmMin)}–${textoKm(z.kmMax)} del club`)

  return (
    <>
      <p className="mini" style={{ marginBottom: 8 }}>
        Chicos que viven cerca entre sí, para organizar quién lleva y quién trae. Van
        juntos los barrios a menos de {textoKm(KM_POOL)} uno de otro.
        Tocá el teléfono para abrir el WhatsApp del tutor.
      </p>
      {!conPool.length && <div className="vacio">Todavía no hay chicos ubicados que vivan cerca entre sí.</div>}
      {conPool.map((z) => (
        <div key={z.lugares[0].id} className="tarjeta">
          <div className="fila entre">
            <div>
              <h3>{z.lugares.map((l) => l.nombre).join(' · ')}</h3>
              <div className="mini">{z.chicos.length} chicos · {distancia(z)}</div>
            </div>
            <button className="btn sec chico" onClick={() => copiar(z)}>Copiar lista</button>
          </div>
          <ul className="lista-zona">
            {z.chicos.map((j) => (
              <li key={j.id}>
                <b>{nombreCompleto(j)}</b>
                {z.lugares.length > 1 && <span className="mini"> · {j.lugar.nombre}</span>}
                <div className="mini">
                  {j.tutor_nombre || 'Sin tutor cargado'}
                  {j.tutor_telefono && <> · <Telefono numero={j.tutor_telefono} /></>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {solos.length > 0 && (
        <div className="tarjeta">
          <h3>Sin vecinos en el plantel</h3>
          <p className="mini">Nadie más vive a menos de {textoKm(KM_POOL)}: para ellos, el pool se arma con la zona más cercana de camino al club.</p>
          <ul className="lista-zona">
            {solos.map((z) => {
              const j = z.chicos[0]
              return (
                <li key={j.id}>
                  <b>{nombreCompleto(j)}</b> <span className="mini">· {j.lugar.nombre} · {textoKm(j.lugar.km)}</span>
                  {j.tutor_telefono && <div className="mini">{j.tutor_nombre || 'Tutor'} · <Telefono numero={j.tutor_telefono} /></div>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}

// ---------- barrios sin ubicar y chicos sin barrio ----------

function VistaPendientes({ datos, onUbicar, onCambio }) {
  const { gruposPendientes, sinBarrio, lugares } = datos
  const [ocupado, setOcupado] = useState(null)

  async function esDe(g, lugarId) {
    setOcupado(g.clave)
    try {
      await api(`lugares/${lugarId}/alias`, { method: 'POST', body: { textos: g.textos } })
      onCambio()
    } catch {
      alert('No se pudo guardar. Probá de nuevo.')
    }
    setOcupado(null)
  }

  // Sugerencias para el campo de barrio: los lugares ya ubicados
  const sugeridos = [...new Set(lugares.map((l) => l.nombre))].sort((a, b) => a.localeCompare(b, 'es'))

  return (
    <>
      {!gruposPendientes.length && !sinBarrio.length && (
        <div className="vacio">Todos los chicos del plantel están ubicados. 🎉</div>
      )}
      {gruposPendientes.length > 0 && (
        <>
          <h3>Barrios por ubicar</h3>
          <p className="mini" style={{ marginBottom: 8 }}>
            Se ubica una vez cada barrio, no cada chico: a partir de ahí, cualquiera que lo
            escriba igual (o parecido, sin importar tildes, mayúsculas ni «barrio» o «country») se reconoce solo.
          </p>
        </>
      )}
      {gruposPendientes.map((g) => (
        <div key={g.clave} className="tarjeta">
          <h3>«{g.textos.join('» / «')}»</h3>
          <div className="mini">{g.chicos.map(nombreCompleto).join(', ')}</div>
          <div className="fila" style={{ marginTop: 8 }}>
            {g.parecido && (
              <button className="btn chico" disabled={ocupado === g.clave} onClick={() => esDe(g, g.parecido.id)}>
                Es {g.parecido.nombre}
              </button>
            )}
            <button className={`btn chico${g.parecido ? ' sec' : ''}`} onClick={() => onUbicar(g)}>
              Ubicar en el mapa
            </button>
            {lugares.length > 0 && (
              <select
                value=""
                disabled={ocupado === g.clave}
                onChange={(e) => e.target.value && esDe(g, e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="">Es un lugar ya cargado…</option>
                {[...lugares].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}

      {sinBarrio.length > 0 && (
        <div className="tarjeta">
          <h3>Sin barrio cargado ({sinBarrio.length})</h3>
          <p className="mini" style={{ marginBottom: 6 }}>
            Escribilo como salga: «country Vilago», «B° Norte», «Yerba Buena». Solo el barrio, no la dirección.
          </p>
          <datalist id="barrios-conocidos">
            {sugeridos.map((n) => <option key={n} value={n} />)}
          </datalist>
          {sinBarrio.map((j) => <CargarBarrio key={j.id} jugador={j} onGuardado={onCambio} />)}
        </div>
      )}
    </>
  )
}

function CargarBarrio({ jugador, onGuardado }) {
  const [barrio, setBarrio] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (!barrio.trim()) return
    setGuardando(true)
    try {
      // El padrón guarda todos los datos administrativos juntos: van los que ya tenía
      const { fecha_nacimiento, dni, tutor_nombre, tutor_telefono, ficha_medica_vigente, ficha_medica_vence } = jugador
      await api(`padron/${jugador.id}`, {
        method: 'PUT',
        body: { fecha_nacimiento, dni, tutor_nombre, tutor_telefono, ficha_medica_vigente, ficha_medica_vence, barrio },
      })
      onGuardado()
    } catch {
      alert('No se pudo guardar el barrio.')
      setGuardando(false)
    }
  }

  return (
    <form className="fila cargar-barrio" onSubmit={guardar}>
      <span className="crece" style={{ minWidth: 140 }}>{nombreCompleto(jugador)}</span>
      <input
        list="barrios-conocidos"
        placeholder="Barrio o localidad"
        value={barrio}
        onChange={(e) => setBarrio(e.target.value)}
      />
      <button className="btn chico" disabled={guardando || !barrio.trim()}>{guardando ? '…' : 'Guardar'}</button>
    </form>
  )
}

// ---------- asistencia según la distancia (solo cuerpo técnico) ----------

function VistaAsistencia({ datos, jugadores }) {
  if (!jugadores) return <div className="vacio">Cargando…</div>
  // Solo los entrenamientos: los partidos dependen de la convocatoria y de
  // los bloques que presenta el club, no de que la familia pueda traerlo
  const asis = new Map(jugadores.map((j) => [j.id, j.asistencia]))
  const filas = datos.conChicos.flatMap((l) => l.chicos.map((j) => {
    const a = asis.get(j.id)
    return {
      ...j, lugar: l, km: l.km,
      total: a?.entrenamientos ?? null,
      presentes: a?.entrenamientos_presentes ?? 0,
      de: a?.entrenamientos_total ?? 0,
    }
  }))
  const conDato = filas.filter((f) => f.total != null)
  const promedio = (lista) => (lista.length ? Math.round(lista.reduce((s, f) => s + f.total, 0) / lista.length) : null)
  const lejos = conDato.filter((f) => f.km >= KM_LEJOS)
  // Los de más de 15 km con 70% o más se destacan en su propia tarjeta (y no
  // se repiten en la de "vienen de lejos y no faltan")
  const destacados = conDato
    .filter((f) => f.km > KM_MUY_LEJOS && f.total >= PCT_MUY_LEJOS)
    .sort((a, b) => b.total - a.total || b.km - a.km)
  const esDestacado = new Set(destacados.map((f) => f.id))
  const firmes = lejos.filter((f) => f.total >= 75 && !esDestacado.has(f.id)).sort((a, b) => b.km - a.km)
  const flojos = lejos.filter((f) => f.total < 60).sort((a, b) => a.total - b.total)
  const ordenadas = [...filas].sort((a, b) => b.km - a.km)
  const clase = (t) => (t == null ? '' : t >= 75 ? 'bien' : t >= 50 ? 'regular' : 'flojo')
  const detalle = (f) => `${f.total}% (${f.presentes}/${f.de})`

  return (
    <>
      <p className="mini" style={{ marginBottom: 8 }}>
        <b>Solo asistencia a entrenamientos</b>: los partidos no entran, porque ahí
        manda la convocatoria y no si la familia puede traerlo. Se cuenta igual que
        en el listado de jugadores (sin los suspendidos ni los días de lesión). La
        distancia es contexto: no cambia el porcentaje de nadie ni lo que sale en
        el boletín. «Lejos» es a más de {KM_LEJOS} km del club.
      </p>

      <div className="tarjeta">
        <h3>Asistencia a entrenamientos por distancia</h3>
        <table className="tabla-zona">
          <thead><tr><th>Distancia</th><th>Chicos</th><th>Entrenamientos</th></tr></thead>
          <tbody>
            {ANILLOS.map((a, i) => {
              const grupo = conDato.filter((f) => anilloDe(f.km) === i)
              const p = promedio(grupo)
              return (
                <tr key={a.etiqueta}>
                  <td>{a.etiqueta}</td>
                  <td>{grupo.length}</td>
                  <td><b className={`asis-total ${clase(p)}`}>{p == null ? '—' : `${p}%`}</b></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="tarjeta destacados-lejos">
        <h3>🏆 Desde más de {KM_MUY_LEJOS} km y con {PCT_MUY_LEJOS}% o más</h3>
        <p className="mini">
          Viven a más de {KM_MUY_LEJOS} km del club y vienen a {PCT_MUY_LEJOS}% o más de los
          entrenamientos: el mayor esfuerzo del plantel, para destacar.
        </p>
        {!destacados.length && <p className="mini">Nadie por ahora.</p>}
        <ul className="lista-zona">
          {destacados.map((f) => (
            <li key={f.id}><b>⭐ {nombreCompleto(f)}</b> <span className="mini">· {f.lugar.nombre} · {textoKm(f.km)} · {detalle(f)}</span></li>
          ))}
        </ul>
      </div>

      <div className="tarjeta">
        <h3>💪 Vienen de lejos y no faltan</h3>
        <p className="mini">A más de {KM_LEJOS} km y con 75% o más de asistencia a los entrenamientos: el esfuerzo de la familia merece un reconocimiento.{destacados.length > 0 && ' Sin los destacados de arriba.'}</p>
        {!firmes.length && <p className="mini">Nadie por ahora.</p>}
        <ul className="lista-zona">
          {firmes.map((f) => (
            <li key={f.id}><b>{nombreCompleto(f)}</b> <span className="mini">· {f.lugar.nombre} · {textoKm(f.km)} · {detalle(f)}</span></li>
          ))}
        </ul>
      </div>

      <div className="tarjeta">
        <h3>🚗 Vienen de lejos y faltan</h3>
        <p className="mini">A más de {KM_LEJOS} km y con menos de 60% de asistencia a los entrenamientos: los primeros candidatos a sumarse a un pool.</p>
        {!flojos.length && <p className="mini">Nadie por ahora.</p>}
        <ul className="lista-zona">
          {flojos.map((f) => (
            <li key={f.id}><b>{nombreCompleto(f)}</b> <span className="mini">· {f.lugar.nombre} · {textoKm(f.km)} · {detalle(f)}</span></li>
          ))}
        </ul>
      </div>

      <div className="tarjeta">
        <h3>Todos, del más lejano al más cercano</h3>
        <table className="tabla-zona">
          <thead><tr><th>Jugador</th><th>Barrio</th><th>Dist.</th><th title="Asistencia a entrenamientos">Entren.</th></tr></thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr key={f.id}>
                <td>{esDestacado.has(f.id) && '⭐ '}{nombreCompleto(f)}</td>
                <td>{f.lugar.nombre}</td>
                <td>{textoKm(f.km)}</td>
                <td><b className={`asis-total ${clase(f.total)}`}>{f.total == null ? '—' : `${f.total}%`}</b>
                  {f.total != null && <div className="mini">{f.presentes}/{f.de}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------- ubicar un barrio nuevo o corregir uno ----------

function UbicarLugar({ textos, chicos, lugar, club, lugares, onCerrar, onListo }) {
  const editando = !!lugar
  const [nombre, setNombre] = useState(lugar?.nombre || nombreSugerido(textos?.[0]))
  const [consulta, setConsulta] = useState(lugar?.nombre || textos?.[0] || '')
  const [candidatos, setCandidatos] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [pin, setPin] = useState(lugar ? { lat: lugar.lat, lng: lugar.lng } : null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function buscar(texto = consulta) {
    if (!texto.trim()) return
    setBuscando(true)
    setAviso('')
    try {
      const encontrados = await buscarLugar(texto)
      setCandidatos(encontrados)
      if (encontrados.length && !editando) setPin({ lat: encontrados[0].lat, lng: encontrados[0].lng })
      if (!encontrados.length) {
        setAviso('El buscador de mapas no lo encontró. Marcalo tocando el mapa, o probá con otro texto (por ejemplo, sumando la localidad).')
      }
    } catch {
      setAviso('No se pudo usar el buscador de mapas. Marcalo tocando el mapa.')
    }
    setBuscando(false)
  }
  useEffect(() => { if (!editando) buscar() }, [])

  function elegir(i) {
    const c = candidatos[i]
    setPin({ lat: c.lat, lng: c.lng })
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      const cuerpo = { nombre: nombre.trim(), lat: pin.lat, lng: pin.lng }
      if (editando) await api(`lugares/${lugar.id}`, { method: 'PUT', body: cuerpo })
      else await api('lugares', { method: 'POST', body: { ...cuerpo, textos } })
      onListo()
    } catch (e) {
      setError(e?.error === 'ubicacion_invalida'
        ? 'Ese punto queda fuera del país: revisá el mapa.'
        : 'No se pudo guardar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  // Si el nombre elegido ya es el de un lugar cargado, se suma a ese
  const yaExiste = !editando && lugares.find((l) => clavesDe(l.nombre)[0] === clavesDe(nombre)[0])
  const km = pin ? distanciaKm(pin, club) : null

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 8 }}>
          <h3>{editando ? `Corregir ${lugar.nombre}` : `Ubicar «${textos.join('» / «')}»`}</h3>
          <button className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        {!editando && chicos?.length > 0 && (
          <p className="mini" style={{ marginBottom: 6 }}>{chicos.map(nombreCompleto).join(', ')}</p>
        )}

        <form className="fila" style={{ marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); buscar() }}>
          <input
            className="crece"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar en el mapa…"
            style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 8 }}
          />
          <button className="btn sec chico" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar'}</button>
        </form>

        {candidatos.length > 0 && (
          <div className="candidatos">
            {candidatos.map((c, i) => {
              const activo = pin && Math.abs(pin.lat - c.lat) < 1e-6 && Math.abs(pin.lng - c.lng) < 1e-6
              return (
                <button key={i} className={`candidato${activo ? ' activo' : ''}`} onClick={() => elegir(i)}>
                  <b>{i + 1}. {c.nombre}</b> <span className="mini">{c.detalle}</span>
                </button>
              )
            })}
          </div>
        )}
        {aviso && <p className="mini" style={{ color: 'var(--warn)', margin: '6px 0' }}>{aviso}</p>}

        <Mapa
          club={club}
          pin={pin}
          onPin={setPin}
          candidatos={candidatos}
          onCandidato={elegir}
          alto={300}
        />
        <p className="mini" style={{ margin: '6px 0 10px' }}>
          {pin
            ? `Arrastrá el 📍 o tocá el mapa para corregirlo. Queda a ${textoKm(km)} del club.`
            : 'Tocá el mapa donde queda el barrio.'}
        </p>

        <div className="campo">
          <label>Nombre del lugar</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          {yaExiste && (
            <p className="mini" style={{ marginTop: 4 }}>
              Ya existe «{yaExiste.nombre}»: estos chicos se suman a ese lugar (no se mueve su punto).
            </p>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        <button
          className="btn"
          style={{ width: '100%' }}
          disabled={guardando || !pin || !nombre.trim()}
          onClick={guardar}
        >
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Confirmar ubicación'}
        </button>
      </div>
    </div>
  )
}
