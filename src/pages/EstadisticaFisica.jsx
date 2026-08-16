import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { descargarCSV, fechaCorta } from '../helpers.js'
import { compartirArchivo, descargarArchivo } from '../pdf.js'
import { generarReportePDF, nombreDelReporte } from '../reporteFisico.js'
import {
  fechaISO, lineaDeSesion, rangoDePeriodo, resumir,
  MODALIDADES_FILTRO, PERIODOS, SECCIONES,
} from '../estadisticaFisica.js'
import { intensidad, INTENSIDADES, MINUTOS_BLOQUE } from '../trabajoFisico.js'

const CLASE_INTENSIDAD = { baja: 'ok', media: 'warn', alta: 'bad' }

// Barra horizontal con su etiqueta y su dato, la misma forma que en el PDF
function Barra({ etiqueta, valor, detalle, proporcion, nivel }) {
  return (
    <div className="barra-fila">
      <div className="fila entre" style={{ flexWrap: 'nowrap', gap: 8 }}>
        <span className="crece" style={{ fontSize: '0.88rem', fontWeight: 600 }}>{etiqueta}</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{valor}</span>
      </div>
      <div className="barra">
        <div
          className={`barra-relleno${nivel ? ` nivel-${nivel}` : ''}`}
          style={{ width: `${Math.max(proporcion * 100, proporcion > 0 ? 1.5 : 0)}%` }}
        />
      </div>
      {detalle && <div className="mini">{detalle}</div>}
    </div>
  )
}

export default function EstadisticaFisica({ yo, onVolver }) {
  const hoy = fechaISO(new Date())
  const [periodo, setPeriodo] = useState('trimestre')
  const [rango, setRango] = useState(() => rangoDePeriodo('trimestre'))
  const [modalidad, setModalidad] = useState('')
  const [secciones, setSecciones] = useState(SECCIONES.map((s) => s.value))
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    if (!rango?.desde || !rango?.hasta || rango.desde > rango.hasta) return
    let vigente = true
    setCargando(true)
    setError(null)
    api(`stats/fisico?desde=${rango.desde}&hasta=${rango.hasta}&modalidad=${modalidad}`)
      .then((d) => { if (vigente) { setDatos(d); setCargando(false) } })
      .catch((e) => { if (vigente) { setError(e); setCargando(false) } })
    return () => { vigente = false }
  }, [rango?.desde, rango?.hasta, modalidad])

  function elegirPeriodo(valor) {
    setPeriodo(valor)
    const r = rangoDePeriodo(valor)
    if (r) setRango(r)
  }

  function alternarSeccion(valor) {
    setSecciones((s) => (s.includes(valor) ? s.filter((x) => x !== valor) : [...s, valor]))
  }

  const resumen = datos ? resumir(datos.sesiones) : null
  const rangoValido = rango?.desde && rango?.hasta && rango.desde <= rango.hasta
  const hayDatos = !!resumen?.conPlanilla

  function armarPDF() {
    return generarReportePDF({
      resumen,
      desde: rango.desde,
      hasta: rango.hasta,
      modalidad,
      secciones,
      generadoPor: yo?.nombre || yo?.email,
    }).blob()
  }

  async function compartir() {
    setAviso('')
    const resultado = await compartirArchivo(
      armarPDF(),
      nombreDelReporte(rango.desde, rango.hasta),
      `Trabajo físico M12 · ${fechaCorta(rango.desde)} a ${fechaCorta(rango.hasta)}`)
    if (resultado === 'descargado') {
      setAviso('Este dispositivo no puede compartir archivos: el PDF se descargó y lo podés adjuntar a mano.')
    }
  }

  function descargarDetalleCSV() {
    descargarCSV(`trabajo-fisico-${rango.desde}-a-${rango.hasta}.csv`, [
      ['Fecha', 'Modalidad', 'Carga general', 'Trabajo', 'Observaciones'],
      ...resumen.sesiones.map((s) => [
        fechaCorta(s.fecha),
        s.modalidad === 'rutina' ? 'Rutina' : s.modalidad === 'extra' ? 'Extra' : '',
        intensidad(s.carga)?.label || '',
        lineaDeSesion(s),
        s.observaciones || '',
      ]),
    ])
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <span className="mini">Trabajo físico</span>
      </div>

      <div className="tarjeta">
        <h2>📊 Estadística de trabajo físico</h2>
        <p className="mini" style={{ marginTop: 2 }}>
          Sale de las planillas que cargan los PF en cada entrenamiento.
        </p>

        <div className="campo" style={{ marginTop: 10 }}>
          <label>Período</label>
          <div className="chips">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`chip${periodo === p.value ? ' activo' : ''}`}
                onClick={() => elegirPeriodo(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid2">
          <div className="campo">
            <label>Desde</label>
            <input
              type="date"
              max={hoy}
              value={rango?.desde || ''}
              onChange={(e) => { setPeriodo('manual'); setRango((r) => ({ ...r, desde: e.target.value })) }}
            />
          </div>
          <div className="campo">
            <label>Hasta</label>
            <input
              type="date"
              value={rango?.hasta || ''}
              onChange={(e) => { setPeriodo('manual'); setRango((r) => ({ ...r, hasta: e.target.value })) }}
            />
          </div>
        </div>
        {!rangoValido && (
          <div className="error">La fecha "desde" tiene que ser anterior a la fecha "hasta".</div>
        )}

        <div className="campo">
          <label>Entrenamientos</label>
          <div className="chips">
            {MODALIDADES_FILTRO.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`chip${modalidad === m.value ? ' activo' : ''}`}
                onClick={() => setModalidad(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {cargando && <div className="vacio">Cargando…</div>}
      {error && (
        <div className="vacio">
          No se pudo cargar la estadística{error.detalle ? `: ${error.detalle}` : '.'}
        </div>
      )}

      {resumen && !cargando && !error && (
        <>
          {resumen.entrenamientos === 0 ? (
            <div className="vacio">
              No hubo entrenamientos en este período (o los que hubo están suspendidos).
              Probá con un rango más amplio.
            </div>
          ) : !hayDatos ? (
            <div className="vacio">
              Hubo {resumen.entrenamientos} {resumen.entrenamientos === 1 ? 'entrenamiento' : 'entrenamientos'},
              pero ninguno tiene la planilla del PF cargada. Se carga desde el
              entrenamiento, en la pestaña <b>🏃 Físico</b>.
            </div>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <div className="valor">{resumen.conPlanilla}</div>
                  <div className="etiqueta">Sesiones cargadas</div>
                </div>
                <div className="stat">
                  <div className="valor">{resumen.cobertura}%</div>
                  <div className="etiqueta">De los entrenamientos</div>
                </div>
                <div className="stat">
                  <div className="valor">{resumen.minutosTotales}′</div>
                  <div className="etiqueta">Minutos totales</div>
                </div>
                <div className="stat">
                  <div className="valor">{resumen.promedioPorSesion}′</div>
                  <div className="etiqueta">Promedio por sesión</div>
                </div>
              </div>

              {resumen.sinPlanilla > 0 && (
                <div className="aviso">
                  Quedan <b>{resumen.sinPlanilla}</b> {resumen.sinPlanilla === 1 ? 'entrenamiento' : 'entrenamientos'} sin
                  planilla cargada en este período. Esos días no suman minutos, así
                  que los totales quedan cortos.
                </div>
              )}

              <div className="tarjeta">
                <h3>Reparto por variable</h3>
                <p className="mini" style={{ margin: '2px 0 8px' }}>
                  Sobre {resumen.minutosTotales} minutos, con {MINUTOS_BLOQUE} de
                  referencia por entrenamiento. El color es la intensidad más usada.
                </p>
                {resumen.porVariable.map((v) => (
                  <Barra
                    key={v.value}
                    etiqueta={v.label}
                    valor={`${v.minutos}′ · ${v.pct}%`}
                    detalle={`${v.sesiones} ${v.sesiones === 1 ? 'sesión' : 'sesiones'}${
                      v.intensidad ? ` · intensidad ${intensidad(v.intensidad).label.toLowerCase()}` : ''}`}
                    proporcion={v.minutos / (resumen.porVariable[0].minutos || 1)}
                    nivel={v.intensidad}
                  />
                ))}
              </div>

              <div className="tarjeta">
                <h3>Reparto por grupo</h3>
                {resumen.porGrupo.map((g) => (
                  <Barra
                    key={g.value}
                    etiqueta={g.label}
                    valor={`${g.minutos}′ · ${g.pct}%`}
                    proporcion={resumen.minutosTotales ? g.minutos / resumen.minutosTotales : 0}
                  />
                ))}
              </div>

              <div className="tarjeta">
                <h3>Intensidad y carga</h3>
                <p className="mini" style={{ margin: '2px 0 8px' }}>
                  Minutos trabajados según la intensidad de cada variable.
                </p>
                {INTENSIDADES.map((i) => (
                  <Barra
                    key={i.value}
                    etiqueta={`Intensidad ${i.label.toLowerCase()}`}
                    valor={`${resumen.minutosPorIntensidad[i.value] || 0}′`}
                    proporcion={resumen.minutosTotales
                      ? (resumen.minutosPorIntensidad[i.value] || 0) / resumen.minutosTotales
                      : 0}
                    nivel={i.value}
                  />
                ))}
                {resumen.minutosPorIntensidad.sin > 0 && (
                  <p className="mini">
                    {resumen.minutosPorIntensidad.sin}′ se cargaron sin marcarles intensidad.
                  </p>
                )}
                <div className="fila" style={{ gap: 6, marginTop: 10 }}>
                  <span className="mini">Carga general declarada:</span>
                  {resumen.porCarga.map((c) => (
                    <span key={c.value} className={`badge semaforo-${
                      c.value === 'baja' ? 'verde' : c.value === 'media' ? 'amarillo' : 'rojo'}`}>
                      {c.label}: {c.sesiones}
                    </span>
                  ))}
                  {resumen.sinCarga > 0 && (
                    <span className="badge inactivo">Sin declarar: {resumen.sinCarga}</span>
                  )}
                </div>
              </div>

              <details className="tarjeta">
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--primario)' }}>
                  Detalle de las {resumen.sesiones.length} sesiones
                </summary>
                <div style={{ marginTop: 8 }}>
                  {resumen.sesiones.map((s) => {
                    const carga = intensidad(s.carga)
                    return (
                      <div key={s.evento_id} className="sesion-fila">
                        <div className="fila entre" style={{ flexWrap: 'nowrap', gap: 8 }}>
                          <b style={{ fontSize: '0.85rem' }}>{fechaCorta(s.fecha)}</b>
                          {carga && (
                            <span
                              className="mini"
                              style={{ fontWeight: 700, color: `var(--${CLASE_INTENSIDAD[carga.value]})` }}
                            >
                              Carga {carga.label.toLowerCase()}
                            </span>
                          )}
                        </div>
                        <div className={s.variables ? 'mini' : 'mini'} style={s.variables ? { color: 'var(--texto)' } : undefined}>
                          {lineaDeSesion(s)}
                        </div>
                        {s.observaciones && <div className="mini">📝 {s.observaciones}</div>}
                      </div>
                    )
                  })}
                </div>
              </details>

              <div className="tarjeta">
                <h3>Reporte</h3>
                <p className="mini" style={{ margin: '2px 0 8px' }}>
                  Elegí qué secciones entran en el PDF.
                </p>
                {SECCIONES.map((s) => (
                  <label key={s.value} className="opcion-seccion">
                    <input
                      type="checkbox"
                      checked={secciones.includes(s.value)}
                      onChange={() => alternarSeccion(s.value)}
                    />
                    <span>
                      <b>{s.label}</b>
                      <span className="mini"> · {s.ayuda}</span>
                    </span>
                  </label>
                ))}
                {aviso && <div className="aviso" style={{ marginTop: 8 }}>{aviso}</div>}
                <div className="fila" style={{ marginTop: 10 }}>
                  <button className="btn crece" disabled={!secciones.length} onClick={compartir}>
                    📤 Compartir PDF
                  </button>
                  <button
                    className="btn sec"
                    disabled={!secciones.length}
                    onClick={() => descargarArchivo(armarPDF(), nombreDelReporte(rango.desde, rango.hasta))}
                  >
                    Descargar
                  </button>
                </div>
                <button className="btn sec" style={{ marginTop: 8 }} onClick={descargarDetalleCSV}>
                  Detalle en CSV
                </button>
                {!secciones.length && (
                  <p className="mini" style={{ marginTop: 6 }}>
                    Marcá al menos una sección para generar el reporte.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
