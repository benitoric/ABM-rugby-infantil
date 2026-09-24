// Aviso de versión nueva. La app es una página que queda abierta días en el
// celular o en una pestaña de la PC, y un deploy nuevo no la cambia hasta que
// alguien la recarga: mientras tanto se siguen viendo pantallas viejas (y se
// reportan como no arregladas). Acá se compara cada tanto el archivo de la
// app que está corriendo con el que publica el servidor, y si difieren se
// ofrece recargar. En desarrollo (Vite) no hay archivo publicado y no hace nada.
import { useEffect, useState } from 'react'

const CADA = 5 * 60 * 1000

// Ruta del archivo de la app que está corriendo en esta pestaña
function scriptActual() {
  const s = document.querySelector('script[type="module"][src*="/assets/"]')
  return s ? new URL(s.getAttribute('src'), location.href).pathname : null
}

// Ruta del archivo de la app que publica el servidor ahora mismo (el
// index.html se sirve sin caché, ver vercel.json)
async function scriptPublicado() {
  const res = await fetch('index.html', { cache: 'no-store' })
  if (!res.ok) return null
  const m = (await res.text()).match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)
  return m ? new URL(m[1], location.href).pathname : null
}

export function useVersionNueva() {
  const [hay, setHay] = useState(false)
  useEffect(() => {
    const actual = scriptActual()
    if (!actual) return undefined
    let cancelado = false
    const revisar = async () => {
      try {
        const publicado = await scriptPublicado()
        if (!cancelado && publicado && publicado !== actual) setHay(true)
      } catch { /* sin red: se vuelve a probar más tarde */ }
    }
    revisar()
    const t = setInterval(revisar, CADA)
    const alVolver = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      cancelado = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
  return hay
}
