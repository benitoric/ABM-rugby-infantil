// Quién puede ver qué. Todo control por rol de la API pasa por acá.
//
// Hay dos alcances:
//  - "completo": entrenadores, preparadores físicos y la cabeza de división.
//    Ven y cargan todo.
//  - "administrativo": los managers (principal y asistente), que suelen ser
//    padres. Solo entran a lo administrativo: viajes, padrón (datos de
//    contacto, DNI y ficha médica), la lista del staff y sus propios avisos.
//    Nunca ven asistencia, evaluaciones, entrenamientos, partidos, lesiones,
//    tests físicos ni boletines.
//
// El alcance administrativo funciona por lista blanca: cualquier ruta que no
// esté nombrada en `rutaAdministrativa` les devuelve 403. Así una ruta nueva
// nace cerrada para los managers sin que nadie tenga que acordarse.
//
// Un rol que no sea ninguno de los conocidos (o vacío) también queda en el
// alcance administrativo: ante la duda, se cierra.

export const ROLES = [
  'Cabeza de división',
  'Entrenador',
  'Preparador físico (PF)',
  'PF/entrenador',
  'Manager principal',
  'Manager asistente',
]

export const ROLES_COMPLETOS = [
  'Cabeza de división',
  'Entrenador',
  'Preparador físico (PF)',
  'PF/entrenador',
]

export const ROLES_MANAGER = ['Manager principal', 'Manager asistente']

// El dueño del repositorio (el email sembrado en db/schema.sql) conserva
// todas las atribuciones aunque cambie de rol o no tenga ninguno.
export const EMAIL_DUENIO = 'benitoric@gmail.com'

// Acciones reservadas (borrar evaluaciones, reabrir un bloque cerrado, manejar
// el staff, borrar un viaje entero): la cabeza de división y el dueño.
export function puedeAdministrar(yo) {
  return yo.email === EMAIL_DUENIO || yo.rol === 'Cabeza de división'
}

export function alcance(yo) {
  if (yo.email === EMAIL_DUENIO || ROLES_COMPLETOS.includes(yo.rol)) return 'completo'
  return 'administrativo'
}

// Lo que ve el frontend de la sesión (respuesta de `me` y del login)
export function perfil(yo) {
  return {
    email: yo.email,
    nombre: yo.nombre,
    rol: yo.rol,
    admin: puedeAdministrar(yo),
    alcance: alcance(yo),
  }
}

// Rutas abiertas al alcance administrativo. `p` son los tramos de la ruta
// (`viajes/abc/pagos` → ['viajes', 'abc', 'pagos']).
export function rutaAdministrativa(metodo, p) {
  const [raiz, sub] = p
  switch (raiz) {
    case 'me':
      return true
    // Giras: todo, incluida la edición (borrar un viaje ya exige administrar)
    case 'viajes':
      return true
    // Padrón: datos administrativos de los chicos (sin nada deportivo)
    case 'padron':
      return true
    // Escaneos del DNI: se ven y se cargan desde el padrón
    case 'documentos':
      return true
    // Avisos en el propio celular
    case 'push':
      return true
    // La lista del staff solo para leerla (para elegir quién viaja)
    case 'staff':
      return metodo === 'GET' && !sub
    default:
      return false
  }
}

export function validarRol(rol) {
  if (!rol) throw { codigo: 400, error: 'rol_requerido' }
  if (!ROLES.includes(rol)) throw { codigo: 400, error: 'rol_invalido' }
  return rol
}
