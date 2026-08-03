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

export class ApiError extends Error {
  constructor(codigo, error, detalle) {
    super(error)
    this.codigo = codigo
    this.error = error
    this.detalle = detalle
  }
}

export async function api(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${ruta}`, {
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
}
