import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaCorta } from '../helpers.js'
import { compartirArchivo, descargarArchivo } from '../pdf.js'
import { generarInformePDF } from '../informePDF.js'
import {
  conComa, conPorcentaje, fechaISO, nombreArchivoInforme, oGuion, PERIODOS_INFORME,
  rangoDePeriodoInforme, SECCIONES_INFORME, variacion,
} from '../informe.js'

// Informe de gestión de la división: se elige el período y qué hojas entran,
// la pantalla muestra el tablero de indicadores para chequear que los
// números tengan sentido, y el PDF completo se comparte o se baja. Los
// números los arma el servidor (server/informe.js); solo lo ve quien
// administra (la ruta devuelve 403 al resto).

function Indicador({ valor, etiqueta, actual, anterior, pp, decimales, neutro, invertido }) {
  const v = variacion(actual, anterior, { pp, decimales })
  const signo = invertido ? -v.signo : v.signo
  const color = neutro || !signo ? 'var(--texto-suave)' : signo > 0 ? 'var(--ok)' : 'var(--bad)'
  return (
    <div className="stat">
      <div className="valor">{valor}</div>
      <div className="etiqueta">{etiqueta}</div>
      <div className="mini" style={{ color, marginTop: 2 }}>{v.texto}</div>
    </div>
  )
}

export default function Informe({ yo, onVolver }) {
  const hoy = fechaISO(new Date())
  const [periodo, setPeriodo] = useState('trimestre')
  const [rango, setRango] = useState(() => rangoDePeriodoInforme('trimestre'))
  const [secciones, setSecciones] = useState(SECCIONES_INFORME.map((s) => s.value))
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState('')

  const rangoValido = rango?.desde && rango?.hasta && rango.desde <= rango.hasta && rango.desde <= hoy

  useEffect(() => {
    if (!rangoValido) return
    let vigente = true
    setCargando(true)
    setError(null)
    api(`informe?desde=${rango.desde}&hasta=${rango.hasta}`)
      .then((d) => { if (vigente) { setDatos(d); setCargando(false) } })
      .catch((e) => { if (vigente) { setError(e); setCargando(false) } })
    return () => { vigente = false }
  }, [rango?.desde, rango?.hasta, rangoValido])

  function elegirPeriodo(valor) {
    setPeriodo(valor)
    const r = rangoDePeriodoInforme(valor)
    if (r) setRango(r)
  }

  function alternarSeccion(valor) {
    setSecciones((s) => (s.includes(valor) ? s.filter((x) => x !== valor) : [...s, valor]))
  }

  function armarPDF() {
    return generarInformePDF({
      datos,
      secciones: SECCIONES_INFORME.map((s) => s.value).filter((s) => secciones.includes(s)),
      generadoPor: yo?.nombre || yo?.email,
    }).blob()
  }

  async function compartir() {
    setAviso('')
    const resultado = await compartirArchivo(
      armarPDF(),
      nombreArchivoInforme(datos.desde, datos.hasta),
      `Informe de gestión M12 · ${fechaCorta(datos.desde)} a ${fechaCorta(datos.hasta)}`)
    if (resultado === 'descargado') {
      setAviso('Este dispositivo no puede compartir archivos: el PDF se descargó y lo podés adjuntar a mano.')
    }
  }

  const a = datos?.indicadores.actual
  const p = datos?.indicadores.anterior

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <span className="mini">Informe de gestión</span>
      </div>

      <div className="tarjeta">
        <h2>📊 Informe de gestión</h2>
        <p className="mini" style={{ marginTop: 2 }}>
          Todos los números de la división en un período, comparados con el
          período anterior de igual largo: plantel, actividad, asistencia de
          chicos y de staff, evaluaciones, lo que se entrenó, tests, lesiones,
          partidos y lo administrativo. Es material interno del cuerpo técnico.
        </p>

        <div className="campo" style={{ marginTop: 10 }}>
          <label>Período</label>
          <div className="chips">
            {PERIODOS_INFORME.map((x) => (
              <button
                key={x.value}
                type="button"
                className={`chip${periodo === x.value ? ' activo' : ''}`}
                onClick={() => elegirPeriodo(x.value)}
              >
                {x.label}
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
          <div className="error">La fecha "desde" tiene que ser anterior a la fecha "hasta" y no puede ser futura.</div>
        )}
      </div>

      {cargando && rangoValido && <div className="vacio">Armando los números…</div>}
      {error && (
        <div className="vacio">
          {error.error === 'solo_cabeza'
            ? 'El informe de gestión es solo para la cabeza de división.'
            : `No se pudo armar el informe${error.detalle ? `: ${error.detalle}` : '.'}`}
        </div>
      )}

      {datos && !cargando && !error && (
        <>
          <div className="tarjeta">
            <h3>Tablero de indicadores</h3>
            <p className="mini" style={{ margin: '2px 0 8px' }}>
              {fechaCorta(datos.desde)} a {fechaCorta(datos.hasta_efectivo)}
              {datos.hasta_efectivo < datos.hasta ? ' (hasta hoy)' : ''} · comparado
              con {fechaCorta(datos.anterior.desde)} a {fechaCorta(datos.anterior.hasta)}.
            </p>
            <div className="stat-grid">
              <Indicador valor={a.activos} etiqueta="Activos al cierre" actual={a.activos} anterior={p.activos} />
              <Indicador valor={conPorcentaje(a.asistencia_entrenamientos)} etiqueta="Asist. entrenamientos" actual={a.asistencia_entrenamientos} anterior={p.asistencia_entrenamientos} pp />
              <Indicador valor={conPorcentaje(a.asistencia_partidos)} etiqueta="Asist. partidos" actual={a.asistencia_partidos} anterior={p.asistencia_partidos} pp />
              <Indicador valor={a.entrenamientos} etiqueta="Entrenamientos" actual={a.entrenamientos} anterior={p.entrenamientos} neutro />
              <Indicador valor={a.partidos} etiqueta="Partidos" actual={a.partidos} anterior={p.partidos} neutro />
              <Indicador valor={conPorcentaje(a.suspendidos_pct)} etiqueta="Suspendidos" actual={a.suspendidos_pct} anterior={p.suspendidos_pct} pp invertido />
              <Indicador valor={a.evaluaciones} etiqueta="Evaluaciones" actual={a.evaluaciones} anterior={p.evaluaciones} />
              <Indicador valor={oGuion(conComa(a.promedio_evaluacion))} etiqueta="Promedio evaluación" actual={a.promedio_evaluacion} anterior={p.promedio_evaluacion} decimales={1} />
              <Indicador valor={a.lesiones} etiqueta="Lesiones nuevas" actual={a.lesiones} anterior={p.lesiones} invertido />
              <Indicador valor={a.chicos_con_tests} etiqueta="Chicos con tests" actual={a.chicos_con_tests} anterior={p.chicos_con_tests} />
              <Indicador valor={`${a.minutos_tecnica}′`} etiqueta="Minutos de técnica" actual={a.minutos_tecnica} anterior={p.minutos_tecnica} />
              <Indicador valor={conPorcentaje(datos.administrativo.ficha_pct)} etiqueta="Fichas vigentes (hoy)" neutro />
            </div>
            {datos.registro.sin_asistencia.length > 0 && (
              <div className="aviso" style={{ marginTop: 10 }}>
                Hay <b>{datos.registro.sin_asistencia.length}</b> eventos ya ocurridos sin asistencia
                tomada en el período: los porcentajes quedan cortos. El detalle va en la
                hoja "Calidad del registro".
              </div>
            )}
          </div>

          <div className="tarjeta">
            <h3>Hojas del informe</h3>
            <p className="mini" style={{ margin: '2px 0 8px' }}>
              Elegí qué secciones entran en el PDF.
            </p>
            {SECCIONES_INFORME.map((s) => (
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
                onClick={() => descargarArchivo(armarPDF(), nombreArchivoInforme(datos.desde, datos.hasta))}
              >
                Descargar
              </button>
            </div>
            {!secciones.length && (
              <p className="mini" style={{ marginTop: 6 }}>
                Marcá al menos una sección para generar el informe.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
