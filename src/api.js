const CLAVE_TOKEN = 'rugby_m12_token'

export function getToken() {
  return localStorage.getItem(CLAVE_TOKEN)
}
export function setToken(t) {
  if (t) localStorage.setItem(CLAVE_TOKEN, t)
  else localStorage.removeItem(CLAVE_TOKEN)
}

let alExpirar = () => {}
export function onSesionExpirada(fn) { alExpirar = fn }

// Seguimiento de escrituras (POST/PUT/DELETE): el refresco automático de la
// vista de partido se saltea mientras haya cambios propios viajando al
// servidor, para no pisar el estado optimista con una foto vieja.
let escrituras = 0
let totalEscrituras = 0
export function escrituraEnVuelo() { return escrituras > 0 }
export function marcaEscrituras() { return totalEscrituras }

export class ApiError extends Error {
  constructor(codigo, error, detalle) {
    super(error)
    this.codigo = codigo
    this.error = error
    this.detalle = detalle
  }
}

export async function api(ruta, { method = 'GET', body } = {}) {
  const esEscritura = method !== 'GET'
  if (esEscritura) escrituras++
  try {
    // La ruta viaja como query para no depender del enrutamiento anidado de
    // Vercel (/api/index es un archivo literal, siempre resuelve). Si la ruta
    // trae sus propios parámetros (?anio=...), se agregan aparte.
    const [camino, extra] = ruta.split('?')
    const res = await fetch(`/api/index?ruta=${encodeURIComponent(camino)}${extra ? `&${extra}` : ''}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const crudo = await res.text()
    let datos = {}
    try { datos = JSON.parse(crudo) } catch { /* respuesta no JSON (error de plataforma) */ }
    if (!res.ok) {
      if (res.status === 401 && !ruta.startsWith('auth/')) {
        setToken(null)
        alExpirar()
      }
      throw new ApiError(
        res.status,
        datos.error || 'error',
        datos.detalle || (datos.error ? undefined : crudo.slice(0, 200)),
      )
    }
    return datos
  } finally {
    if (esEscritura) { escrituras--; totalEscrituras++ }
  }
}
