import { useEffect, useRef, useState } from 'react'
import { generarMiniatura, RECORTE_DNI } from '../archivos.js'

// Elección del encuadre de la cara para la miniatura del listado: se toca
// sobre la foto del DNI para centrar el recuadro y se ajusta el tamaño.
export default function RecorteCara({ blob, onListo, onCancelar }) {
  const [url] = useState(() => URL.createObjectURL(blob))
  const [rec, setRec] = useState(RECORTE_DNI)
  const [natural, setNatural] = useState(null)
  const [caja, setCaja] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const ref = useRef(null)

  useEffect(() => () => URL.revokeObjectURL(url), [url])

  useEffect(() => {
    const medir = () => { if (ref.current) setCaja(ref.current.getBoundingClientRect()) }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [natural])

  function centrar(e) {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const p = e.touches?.[0] || e
    setRec((v) => ({
      ...v,
      cx: Math.min(1, Math.max(0, (p.clientX - r.left) / r.width)),
      cy: Math.min(1, Math.max(0, (p.clientY - r.top) / r.height)),
    }))
  }

  async function guardar() {
    setGuardando(true)
    try {
      onListo(await generarMiniatura(blob, rec))
    } catch {
      setGuardando(false)
    }
  }

  // Lado del recuadro en pantalla: la misma fracción del lado menor que se
  // usa después al recortar la imagen original.
  const lado = caja ? Math.min(caja.width, caja.height) * rec.tam : 0

  // Vista previa: la imagen escalada para que el recorte llene el cuadrito
  const previo = natural && (() => {
    const ladoOrig = Math.min(natural.w, natural.h) * rec.tam
    const escala = 64 / ladoOrig
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: `${natural.w * escala}px ${natural.h * escala}px`,
      backgroundPosition:
        `${32 - natural.w * rec.cx * escala}px ${32 - natural.h * rec.cy * escala}px`,
    }
  })()

  return (
    <div className="modal-fondo" onClick={onCancelar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 4 }}>
          <h3>Encuadrá la cara</h3>
          <button className="btn sec chico" onClick={onCancelar}>Cancelar</button>
        </div>
        <p className="mini" style={{ marginBottom: 10 }}>
          Tocá sobre la cara del jugador para centrar el recuadro. Es lo que se
          va a ver junto a su nombre en el listado.
        </p>

        <div
          ref={ref}
          className="recorte-caja"
          onClick={centrar}
          onTouchStart={centrar}
          onTouchMove={centrar}
        >
          <img
            src={url}
            alt="Documento"
            onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
          />
          {caja && (
            <div
              className="recorte-marco"
              style={{
                left: `${rec.cx * 100}%`,
                top: `${rec.cy * 100}%`,
                width: lado,
                height: lado,
              }}
            />
          )}
        </div>

        <div className="campo" style={{ marginTop: 12 }}>
          <label>Tamaño del recuadro</label>
          <input
            type="range" min="20" max="100" step="1"
            value={Math.round(rec.tam * 100)}
            onChange={(e) => setRec({ ...rec, tam: Number(e.target.value) / 100 })}
          />
        </div>

        <div className="fila" style={{ marginBottom: 12 }}>
          <div className="recorte-previo" style={previo || undefined} />
          <span className="mini crece">Así se va a ver en el listado</span>
        </div>

        <button className="btn" style={{ width: '100%' }} disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
