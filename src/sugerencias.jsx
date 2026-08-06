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
function sinAcentos(t) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Muestra la coincidencia con las letras escritas en negrita. Se normaliza
// letra por letra para que las posiciones sigan valiendo sobre el texto real.
function resaltar(opcion, escrito) {
  const plano = [...opcion].map((c) => sinAcentos(c)).join('')
  const desde = plano.indexOf(escrito)
  if (desde < 0 || plano.length !== opcion.length) return opcion
  return (
    <>
      {opcion.slice(0, desde)}
      <b>{opcion.slice(desde, desde + escrito.length)}</b>
      {opcion.slice(desde + escrito.length)}
    </>
  )
}

// Input de texto que va sugiriendo lo ya cargado. Las coincidencias aparecen
// recién a medida que se escribe (nunca con el campo vacío: pueden ser
// muchas), en una lista debajo del campo. Se elige tocando la sugerencia, con
// Enter, o con Tab para completar y seguir al campo siguiente.
export function CampoSugerido({ value, onChange, opciones = [], maximo = 6, ...props }) {
  const [abierta, setAbierta] = useState(false)
  const [marcada, setMarcada] = useState(0)

  const escrito = sinAcentos(value).trim()
  const coincidencias = !escrito ? [] : opciones
    .filter((o) => {
      const n = sinAcentos(o).trim()
      return n.includes(escrito) && n !== escrito
    })
    .slice(0, maximo)
  const visibles = abierta ? coincidencias : []
  const activa = Math.min(marcada, visibles.length - 1)

  function completar(texto) {
    onChange(texto)
    setAbierta(false)
    setMarcada(0)
  }

  function alTeclear(e) {
    if (!visibles.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMarcada((i) => (Math.min(i, visibles.length - 1) + 1) % visibles.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMarcada((i) => (Math.min(i, visibles.length - 1) + visibles.length - 1) % visibles.length)
    } else if (e.key === 'Enter') {
      e.preventDefault() // completa el campo en vez de enviar el formulario
      completar(visibles[activa])
    } else if (e.key === 'Tab') {
      completar(visibles[activa]) // completa y el foco sigue al campo siguiente
    } else if (e.key === 'Escape') {
      setAbierta(false)
    }
  }

  return (
    <>
      <input
        {...props}
        value={value || ''}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setAbierta(true); setMarcada(0) }}
        onKeyDown={alTeclear}
        onBlur={() => setAbierta(false)}
      />
      {visibles.length > 0 && (
        <ul className="sugerencias">
          {visibles.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                className={`sugerencia${i === activa ? ' marcada' : ''}`}
                // en mousedown (no en click) para que el campo no pierda el
                // foco y la lista no se cierre antes de tomar la elección
                onMouseDown={(e) => { e.preventDefault(); completar(o) }}
              >
                {resaltar(o, escrito)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
