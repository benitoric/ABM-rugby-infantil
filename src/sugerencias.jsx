import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'

// Rivales y lugares ya usados, para autocompletar. La lista la arma la API con
// lo que hay cargado en eventos y bloques: al guardar un evento, sus datos
// quedan disponibles como sugerencia la próxima vez.
export function useSugerencias() {
  const [datos, setDatos] = useState({ rivales: [], lugares: [] })
  const recargar = useCallback(() => {
    api('sugerencias').then(setDatos).catch(() => { /* sin sugerencias se escribe igual */ })
  }, [])
  useEffect(() => { recargar() }, [recargar])
  return [datos, recargar]
}

// Compara sin acentos ni mayúsculas: "tucuman" encuentra "Tucumán".
function normalizar(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

// Input de texto que va sugiriendo lo ya cargado según las letras escritas.
// Las coincidencias aparecen como chips debajo (se tocan para completar);
// mientras el campo está vacío muestra los más usados.
export function CampoSugerido({ value, onChange, opciones = [], maximo = 6, ...props }) {
  const [conFoco, setConFoco] = useState(false)
  const escrito = normalizar(value)
  const coincidencias = opciones
    .filter((o) => {
      const n = normalizar(o)
      return escrito ? n.includes(escrito) && n !== escrito : true
    })
    .slice(0, maximo)

  return (
    <>
      <input
        {...props}
        value={value || ''}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setConFoco(true)}
        onBlur={() => setConFoco(false)}
      />
      {conFoco && coincidencias.length > 0 && (
        <div className="sugerencias">
          {coincidencias.map((o) => (
            <button
              key={o}
              type="button"
              className="chip"
              // en mousedown (no en click) para que el campo no pierda el foco
              onMouseDown={(e) => { e.preventDefault(); onChange(o) }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
