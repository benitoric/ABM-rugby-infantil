// Navegación persistente: la posición en la app vive en el hash de la URL
// (#/partidos/<id>/<vista>) y se respalda en localStorage, porque la PWA
// instalada arranca siempre en start_url "." (sin hash) cuando el sistema
// descarta la página (pantalla bloqueada, salto a WhatsApp, etc.).
const CLAVE_NAV = 'rugby_m12_nav'

export function leerHash() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
    .map((s) => { try { return decodeURIComponent(s) } catch { return s } })
}

function aHash(partes) {
  return '#/' + partes.filter(Boolean).map(encodeURIComponent).join('/')
}

function guardar(hash) {
  try { localStorage.setItem(CLAVE_NAV, hash) } catch { /* modo privado */ }
}

// Cambia la posición sumando una entrada al historial: el botón "atrás" del
// celular vuelve a la vista anterior en vez de cerrar la app
export function irA(...partes) {
  const nuevo = aHash(partes)
  if (location.hash === nuevo) return
  location.hash = nuevo
  guardar(nuevo)
}

// Normaliza el hash sin sumar historial ni disparar hashchange (para
// restauraciones: el que llama ya tiene el estado correcto)
export function reponer(...partes) {
  const nuevo = aHash(partes)
  if (location.hash !== nuevo) history.replaceState(null, '', nuevo)
  guardar(nuevo)
}

export function suscribir(fn) {
  window.addEventListener('hashchange', fn)
  return () => window.removeEventListener('hashchange', fn)
}

// Se llama una vez al arrancar: sin hash (ícono de la PWA, recarga limpia)
// retoma la última posición guardada. También deja guardando la posición en
// cada cambio, incluidos los del botón "atrás".
export function iniciarNavegacion() {
  if (leerHash().length) guardar(location.hash)
  else {
    let guardado = null
    try { guardado = localStorage.getItem(CLAVE_NAV) } catch { /* modo privado */ }
    if (guardado) history.replaceState(null, '', guardado)
  }
  window.addEventListener('hashchange', () => guardar(location.hash))
}
