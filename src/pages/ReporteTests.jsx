import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { descargarCSV, fechaCorta, nombreCompleto } from '../helpers.js'
import { compartirArchivo, descargarArchivo } from '../pdf.js'
import { fechaISO, rangoDePeriodo, PERIODOS } from '../estadisticaFisica.js'
import { resumirTest, textoEdad } from '../estadisticaTests.js'
import { fuenteDe } from '../referencias.js'
import { generarReporteTestsPDF, nombreReporteTests } from '../reporteTestsPDF.js'
import { conUnidad, semaforo, TESTS, TESTS_POR_VALUE } from '../tests.js'

// Por qué un test no tiene referencia externa, cuando no la tiene
const SIN_REFERENCIA = {
  resistencia: 'Las normas internacionales de resistencia son del test de 20 m ida y vuelta (course navette). Si el 10×20 m del club sigue ese protocolo, se le puede cargar esa tabla.',
  salto_largo: 'Falta cargar la tabla de centiles por edad del salto en largo sin carrera.',
  velocidad_20m: 'Falta cargar la tabla de centiles por edad del sprint de 20 m.',
  peso: 'Falta cargar la referencia de crecimiento (IMC para la edad).',
  talla: 'Falta cargar la referencia de crecimiento (talla para la edad).',
}

function Fuente({ fuente }) {
  if (!fuente) return null
  return (
    <p className="mini">
      Referencia: <b>{fuente.nombre}</b>
      {fuente.organismo ? ` — ${fuente.organismo}` : ''}{fuente.anio ? `, ${fuente.anio}` : ''}.
      {fuente.poblacion ? ` ${fuente.poblacion}.` : ''}
      {fuente.url && <> <a href={fuente.url} target="_blank" rel="noreferrer">Ver fuente</a>.</>}
    </p>
  )
}

export default function ReporteTests({ yo, onVolver }) {
  const hoy = fechaISO(new Date())
  const [periodo, setPeriodo] = useState('anio')
  const [rango, setRango] = useState(() => rangoDePeriodo('anio'))
  const [test, setTest] = useState('salto_largo')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    api('stats/tests').then(setDatos).catch(setError)
  }, [])

  function elegirPeriodo(valor) {
    setPeriodo(valor)
    const r = rangoDePeriodo(valor)
    if (r) setRango(r)
  }

  const rangoValido = rango?.desde && rango?.hasta && rango.desde <= rango.hasta
  const resumen = datos && rangoValido ? resumirTest(test, datos.mediciones, rango) : null
  const t = TESTS_POR_VALUE[test]
  const fuente = fuenteDe(test)

  function armarPDF() {
    return generarReporteTestsPDF({ resumen, generadoPor: yo?.nombre || yo?.email }).blob()
  }

  async function compartir() {
    setAviso('')
    const r = await compartirArchivo(
      armarPDF(),
      nombreReporteTests(test, rango.desde, rango.hasta),
      `Reporte de ${t.label} M12 · ${fechaCorta(rango.desde)} a ${fechaCorta(rango.hasta)}`)
    if (r === 'descargado') {
      setAviso('Este dispositivo no puede compartir archivos: el PDF se descargó y lo podés adjuntar a mano.')
    }
  }

  function bajarCSV() {
    descargarCSV(`tests-${test}-${rango.desde}-a-${rango.hasta}.csv`, [
      ['Posición', 'Jugador', 'Edad al medir', 'Fecha', t.label, 'Semáforo', 'Anterior', 'Evolución', 'Percentil ref.', ...(test === 'peso' ? ['IMC'] : [])],
      ...resumen.filas.map((f) => [
        f.posicion ?? '', nombreCompleto(f), textoEdad(f.edadMeses), fechaCorta(f.fecha),
        f.valor, semaforo(f.semaforo)?.label || '', f.anterior?.valor ?? '', f.diferencia || '',
        f.referencia ? `P${f.referencia.percentil}` : '', ...(test === 'peso' ? [f.imc ?? ''] : []),
      ]),
    ])
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <span className="mini">Tests físicos</span>
      </div>

      <div className="tarjeta">
        <h2>📈 Reporte de tests</h2>
        <p className="mini" style={{ marginTop: 2 }}>
          Por chico cuenta su última medición del período. La edad es la del día
          en que se lo midió.
        </p>
        <div className="campo" style={{ marginTop: 10 }}>
          <label>Test</label>
          <div className="chips">
            {TESTS.map((x) => (
              <button key={x.value} type="button" className={`chip${test === x.value ? ' activo' : ''}`}
                onClick={() => setTest(x.value)}>{x.abrev}</button>
            ))}
          </div>
        </div>
        <div className="campo">
          <label>Período</label>
          <div className="chips">
            {PERIODOS.map((p) => (
              <button key={p.value} type="button" className={`chip${periodo === p.value ? ' activo' : ''}`}
                onClick={() => elegirPeriodo(p.value)}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="grid2">
          <div className="campo">
            <label>Desde</label>
            <input type="date" max={hoy} value={rango?.desde || ''}
              onChange={(e) => { setPeriodo('manual'); setRango((r) => ({ ...r, desde: e.target.value })) }} />
          </div>
          <div className="campo">
            <label>Hasta</label>
            <input type="date" value={rango?.hasta || ''}
              onChange={(e) => { setPeriodo('manual'); setRango((r) => ({ ...r, hasta: e.target.value })) }} />
          </div>
        </div>
        {!rangoValido && <div className="error">La fecha "desde" tiene que ser anterior a la fecha "hasta".</div>}
      </div>

      {!datos && !error && <div className="vacio">Cargando…</div>}
      {error && <div className="vacio">No se pudo cargar el reporte{error.detalle ? `: ${error.detalle}` : '.'}</div>}

      {resumen && resumen.filas.length === 0 && (
        <div className="vacio">
          Ningún chico tiene {t.label} cargado en este período. Probá con un rango
          más amplio.
        </div>
      )}

      {resumen && resumen.filas.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="valor">{resumen.grupo.n}</div><div className="etiqueta">Chicos medidos</div></div>
            <div className="stat"><div className="valor">{conUnidad(test, resumen.grupo.promedio)}</div><div className="etiqueta">Promedio</div></div>
            <div className="stat"><div className="valor">{conUnidad(test, resumen.grupo.mediana)}</div><div className="etiqueta">Mediana</div></div>
            <div className="stat">
              <div className="valor" style={{ fontSize: '1rem' }}>{conUnidad(test, resumen.grupo.min)} – {conUnidad(test, resumen.grupo.max)}</div>
              <div className="etiqueta">Rango</div>
            </div>
          </div>

          <div className="tarjeta">
            <h3>Por edad</h3>
            <p className="mini" style={{ margin: '2px 0 8px' }}>
              La comparación justa es entre chicos de la misma edad. Con pocos por
              edad, el promedio es orientativo.
            </p>
            <table className="grafico-tabla">
              <thead><tr><th>Edad</th><th>Chicos</th><th>Promedio</th><th>Mediana</th><th>Mín – máx</th></tr></thead>
              <tbody>
                {resumen.porEdad.map((e) => (
                  <tr key={e.edad}>
                    <td>{e.edad} años</td><td>{e.n}</td>
                    <td>{conUnidad(test, e.promedio)}</td><td>{conUnidad(test, e.mediana)}</td>
                    <td>{conUnidad(test, e.min)} – {conUnidad(test, e.max)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resumen.sinEdad > 0 && (
              <p className="mini" style={{ marginTop: 6 }}>
                {resumen.sinEdad} {resumen.sinEdad === 1 ? 'chico' : 'chicos'} sin fecha de nacimiento cargada: quedan fuera de las comparaciones por edad.
              </p>
            )}
          </div>

          <div className="tarjeta">
            <h3>Contra la referencia por edad</h3>
            {resumen.comparacion ? (
              <>
                <Fuente fuente={resumen.comparacion.fuente} />
                <div className="stat-grid" style={{ marginTop: 8 }}>
                  <div className="stat"><div className="valor">P{resumen.comparacion.percentilMediana}</div><div className="etiqueta">Percentil mediano del grupo</div></div>
                  <div className="stat"><div className="valor" style={{ color: 'var(--bad)' }}>{resumen.comparacion.bajoP25}</div><div className="etiqueta">Por debajo del P25</div></div>
                  <div className="stat"><div className="valor">{resumen.comparacion.entreP25yP75}</div><div className="etiqueta">Entre P25 y P75</div></div>
                  <div className="stat"><div className="valor" style={{ color: 'var(--ok)' }}>{resumen.comparacion.sobreP75}</div><div className="etiqueta">Por encima del P75</div></div>
                </div>
                {resumen.medianaReferencia != null && (
                  <p className="mini" style={{ marginTop: 8 }}>
                    A la edad promedio del grupo ({textoEdad(resumen.edadPromedioMeses)}), la mediana de la
                    referencia es <b>{conUnidad(test, resumen.medianaReferencia)}</b>; el promedio del
                    grupo es <b>{conUnidad(test, resumen.grupo.promedio)}</b>.
                  </p>
                )}
                {resumen.comparacion.sinReferencia > 0 && (
                  <p className="mini" style={{ marginTop: 6 }}>
                    {resumen.comparacion.sinReferencia} sin comparar: falta la fecha de nacimiento
                    {test === 'peso' ? ' o una talla tomada hasta 90 días antes o después' : ''}.
                  </p>
                )}
                <p className="mini" style={{ marginTop: 6 }}>
                  La referencia es de varones{test === 'peso' ? ' y compara el IMC, no el peso solo: a esta edad el peso se lee junto con la talla' : ''}.
                </p>
              </>
            ) : (
              <div className="aviso">
                <b>Sin referencia externa cargada para este test.</b> {SIN_REFERENCIA[test]}
                {fuente ? ' (Hay fuente cargada pero ningún chico tiene fecha de nacimiento o talla cercana.)' : ''}
              </div>
            )}
          </div>

          <div className="tarjeta">
            <h3>{t.mejor ? 'Ranking' : 'Listado'}</h3>
            <div className="fila" style={{ gap: 6, margin: '4px 0 8px' }}>
              {['verde', 'amarillo', 'rojo'].map((s) => (
                <span key={s} className={`badge semaforo-${s}`}>{semaforo(s).ico} {resumen.semaforos[s]}</span>
              ))}
              {resumen.semaforos.sin > 0 && <span className="badge inactivo">sin color: {resumen.semaforos.sin}</span>}
              {resumen.evolucion && resumen.evolucion.conAnterior > 0 && (
                <span className="mini">
                  · respecto de su medición anterior: <b style={{ color: 'var(--ok)' }}>{resumen.evolucion.mejoraron} ▲</b>{' '}
                  <b style={{ color: 'var(--bad)' }}>{resumen.evolucion.empeoraron} ▼</b> {resumen.evolucion.iguales} =
                </span>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="grafico-tabla ranking">
                <thead>
                  <tr>
                    {t.mejor && <th>#</th>}
                    <th style={{ textAlign: 'left' }}>Jugador</th>
                    <th>Edad</th>
                    <th>{t.abrev}</th>
                    {test === 'peso' && <th>IMC</th>}
                    <th></th>
                    <th>Evol.</th>
                    <th>Ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas.map((f) => (
                    <tr key={f.jugador_id}>
                      {t.mejor && <td><b>{f.posicion}</b></td>}
                      <td style={{ textAlign: 'left' }}>{nombreCompleto(f)}<div className="mini">{fechaCorta(f.fecha)}</div></td>
                      <td>{textoEdad(f.edadMeses)}</td>
                      <td><b>{conUnidad(test, f.valor)}</b></td>
                      {test === 'peso' && <td>{f.imc ?? '—'}</td>}
                      <td>{semaforo(f.semaforo)?.ico || ''}</td>
                      <td>
                        {f.diferencia
                          ? <span className={`eval-delta ${f.progreso || ''}`}>{f.diferencia}{f.progreso === 'sube' ? ' ▲' : f.progreso === 'baja' ? ' ▼' : ''}</span>
                          : <span className="mini">{f.anterior ? '=' : '—'}</span>}
                      </td>
                      <td>{f.referencia ? `P${f.referencia.percentil}` : <span className="mini">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tarjeta">
            <h3>Reporte</h3>
            {aviso && <div className="aviso" style={{ marginTop: 8 }}>{aviso}</div>}
            <div className="fila" style={{ marginTop: 10 }}>
              <button className="btn crece" onClick={compartir}>📤 Compartir PDF</button>
              <button className="btn sec" onClick={() => descargarArchivo(armarPDF(), nombreReporteTests(test, rango.desde, rango.hasta))}>Descargar</button>
            </div>
            <button className="btn sec" style={{ marginTop: 8 }} onClick={bajarCSV}>Detalle en CSV</button>
          </div>
        </>
      )}
    </div>
  )
}
