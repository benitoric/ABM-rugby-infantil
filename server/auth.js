import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { query } from './db.js'

function secreto() {
  const s = process.env.JWT_SECRET || (process.env.PGLITE === '1' ? 'secreto-de-prueba' : null)
  if (!s) throw new Error('Falta la variable de entorno JWT_SECRET')
  return new TextEncoder().encode(s)
}

export async function crearToken(email) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('60d')
    .sign(secreto())
}

export function hashClave(clave) {
  return bcrypt.hash(clave, 10)
}

export function compararClave(clave, hash) {
  return bcrypt.compare(clave, hash)
}

// Devuelve la fila de staff del usuario autenticado, o lanza {codigo: 401}
export async function autenticar(req) {
  const cab = req.headers['authorization'] || ''
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : null
  if (!token) throw { codigo: 401, error: 'sin_token' }
  let email
  try {
    const { payload } = await jwtVerify(token, secreto())
    email = payload.email
  } catch {
    throw { codigo: 401, error: 'token_invalido' }
  }
  const filas = await query(
    'select email, nombre, activo from staff where email = $1', [email])
  if (!filas.length || !filas[0].activo) throw { codigo: 401, error: 'no_autorizado' }
  return filas[0]
}
