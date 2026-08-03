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
  const datos = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !ruta.startsWith('auth/')) {
      setToken(null)
      alExpirar()
    }
    throw new ApiError(res.status, datos.error || 'error', datos.detalle)
  }
  return datos
}
