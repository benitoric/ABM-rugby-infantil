import { SECCIONES, SECCION_DEMO } from '../instructivo.js'
import { ES_DEMO } from '../demo.jsx'
import { VERSION } from '../version.js'

// El instructivo de uso (#/instructivo), en una pestaña aparte. No pide
// sesión ni toca la posición guardada de la app (src/main.jsx). El contenido
// vive en src/instructivo.js y sale con cada deploy.
export default function Instructivo() {
  const secciones = ES_DEMO ? [SECCION_DEMO, ...SECCIONES] : SECCIONES
  // El índice no usa anclas (#id): el hash es la navegación de la app
  const ir = (id) => document.getElementById(`instr-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="instructivo">
      <header className="instr-cabeza">
        <h1>🏉 Rugby M12 · Cómo se usa</h1>
        <div className="mini">Instructivo de la versión {VERSION}: se actualiza con cada cambio de la app.</div>
      </header>

      <nav className="instr-indice tarjeta">
        <div className="instr-indice-titulo">Contenido</div>
        <ol>
          {secciones.map((s) => (
            <li key={s.id}><button onClick={() => ir(s.id)}>{s.ico} {s.titulo}</button></li>
          ))}
        </ol>
      </nav>

      {secciones.map((s) => (
        <section key={s.id} id={`instr-${s.id}`} className="instr-seccion tarjeta">
          <h2>{s.ico} {s.titulo}</h2>
          {s.intro && <p className="instr-intro">{s.intro}</p>}
          {s.items.map((it, i) => it.pasos ? (
            <ol key={i} className="instr-pasos">
              {it.pasos.map((p, k) => <li key={k}>{p}</li>)}
            </ol>
          ) : (
            <div key={i} className="instr-item">
              <div className="instr-item-t">{it.t}</div>
              <p>{it.d}</p>
            </div>
          ))}
          <button className="instr-arriba" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ Volver al índice</button>
        </section>
      ))}
    </div>
  )
}
