import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { fechaCorta } from '../helpers.js'
import { base64ABlob, prepararArchivo, tamanoLegible } from '../archivos.js'

export default function Documentos({ jugadorId, documentos, onCambio }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [viendo, setViendo] = useState(null)
  const entrada = useRef(null)

  // Las URLs de los blobs se liberan al cerrar la vista o salir de la ficha
  useEffect(() => () => { if (viendo) URL.revokeObjectURL(viendo.url) }, [viendo])

  async function subir(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return
    setSubiendo(true)
    setError('')
    try {
      const preparado = await prepararArchivo(file)
      await api('documentos', {
        method: 'POST',
        body: { jugador_id: jugadorId, ...preparado },
      })
      onCambio()
    } catch (err) {
      setError(err?.message === 'archivo_muy_grande'
        ? 'El archivo es demasiado grande.'
        : err?.message || 'No se pudo subir el archivo.')
    }
    setSubiendo(false)
  }

  async function ver(d) {
    if (viendo?.id === d.id) return setViendo(null)
    setError('')
    try {
      const r = await api(`documentos/${d.id}`)
      setViendo({ ...d, url: URL.createObjectURL(base64ABlob(r.datos, r.mime)) })
    } catch {
      setError('No se pudo abrir el archivo.')
    }
  }

  // Los PDF no se previsualizan: iOS no los muestra dentro de la página. Se
  // bajan al dispositivo y los abre el visor del sistema.
  async function descargar(d) {
    setError('')
    try {
      const r = await api(`documentos/${d.id}`)
      const url = URL.createObjectURL(base64ABlob(r.datos, r.mime))
      const a = document.createElement('a')
      a.href = url
      a.download = d.nombre
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      setError('No se pudo descargar el archivo.')
    }
  }

  async function borrar(d) {
    if (!confirm(`¿Borrar "${d.nombre}"?`)) return
    if (viendo?.id === d.id) setViendo(null)
    await api(`documentos/${d.id}`, { method: 'DELETE' })
    onCambio()
  }

  return (
    <>
      <div className="fila entre">
        <h3>Documentación (DNI)</h3>
        <button className="btn chico" disabled={subiendo} onClick={() => entrada.current.click()}>
          {subiendo ? 'Subiendo…' : '+ Subir archivo'}
        </button>
        <input
          ref={entrada}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
          onChange={subir}
        />
      </div>

      {error && <div className="error">{error}</div>}

      {documentos.length === 0 && !subiendo && (
        <div className="vacio">
          Sin documentación cargada. Subí una foto o un PDF del DNI
          (podés subir el frente y el dorso por separado).
        </div>
      )}

      {documentos.map((d) => (
        <div key={d.id} className="tarjeta doc-item">
          <div className="fila entre" style={{ flexWrap: 'nowrap' }}>
            <div className="crece" style={{ minWidth: 0 }}>
              <div className="doc-nombre">
                {d.mime === 'application/pdf' ? '📄' : '🖼️'} {d.nombre}
              </div>
              <div className="mini">
                {tamanoLegible(Number(d.bytes))} · {fechaCorta(d.fecha)}
                {d.subido_por ? ` · ${d.subido_por}` : ''}
              </div>
            </div>
            <div className="fila" style={{ flexWrap: 'nowrap', gap: 6 }}>
              {d.mime === 'application/pdf' ? (
                <button className="btn sec chico" onClick={() => descargar(d)}>⬇ Abrir</button>
              ) : (
                <button className="btn sec chico" onClick={() => ver(d)}>
                  {viendo?.id === d.id ? 'Ocultar' : 'Ver'}
                </button>
              )}
              <button className="btn peligro chico" onClick={() => borrar(d)}>Borrar</button>
            </div>
          </div>

          {viendo?.id === d.id && (
            <div style={{ marginTop: 10 }}>
              <img className="doc-vista" alt={d.nombre} src={viendo.url} />
              <a className="btn sec chico" href={viendo.url} download={d.nombre}
                 style={{ display: 'inline-block', marginTop: 8 }}>
                ⬇ Descargar
              </a>
            </div>
          )}
        </div>
      ))}
    </>
  )
}
