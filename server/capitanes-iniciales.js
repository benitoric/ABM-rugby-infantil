// Planilla de capitanes que venía llevándose aparte, para arrancar el
// historial con lo ya jugado en la temporada 2026. Se importa una sola vez
// (ver migrar() en server/db.js): si la tabla capitanias ya tiene algo, no se
// vuelve a tocar. La fecha vacía significa "todavía no fue capitán".
// Formato: 'APELLIDO, NOMBRE': 'AAAA-MM-DD' | null
export const CAPITANES_INICIALES = {
  'ACEVEDO GHIDARA, AGUSTÍN': '2026-05-16',
  'ALLORI ROJKES, LAUTARO': null,
  'ARGÜELLO, FELIPE': null,
  'ATRIA, JUAN IGNACIO': '2026-08-01',
  'BALVOA, FRANCISCO': '2026-05-30',
  'BARCELO, FRANCISCO': '2026-08-08',
  'BASLA, BALTASAR BENICIO': null,
  'BAZAN, BASTIAN BAUTISTA': '2026-06-07',
  'BENITO, FACUNDO MARTIN': '2026-06-06',
  'BULACIO LAYANA, LORENZO': '2026-05-30',
  'BUNADER, LEON': '2026-04-11',
  'CÁCERES CORTEZ, BAUTISTA': '2026-05-23',
  'CANGEMI, BENICIO': '2026-08-01',
  'CELIZ SANJINES, ENZO': null,
  'CHILIAN, MARIANO': '2026-06-27',
  'CHRESTIA, MATIAS': null,
  'CORABALAN TABOADA, LISANDRO': '2026-03-28',
  'CRIVILLON GRAMAJO, FABRIZZIO': '2026-04-11',
  'DUPUY DURÁN, TOMÁS': '2026-05-23',
  'ESTRADA, FELIPE': '2026-04-25',
  'GARCÍA BIAGOSCH, MIRKO': '2026-06-06',
  'GUERINEAU, TOMAS': null,
  'GUTIERREZ COLOMBRES, AGUSTIN': null,
  'HADDAD, SALVADOR': '2026-06-27',
  'KOTTLER, JEREMIAS ARON': null,
  'LAMMOGLIA DUHART, TIZIANO': '2026-05-16',
  'LEGUIZAMON, IGNACIO': null,
  'LISTELLI MERCAU, THIAGO': '2026-04-18',
  'MAREÑO BERTOLINI, LUCIO': '2026-03-21',
  'MARTINEZ AVILA, CLEMENTE': '2026-06-13',
  'MEDINA, JOAQUIN': null,
  'MERCADO ZAMORATTE, TOMÁS': '2026-04-11',
  'NAVARRO MACCHIONE, JUAN PABLO': null,
  'ORTEGA, BERNARDO': null,
  'PAESANI ALVAREZ, HUGO FACUNDO': '2026-03-28',
  'PALINA CORDOMÍ, MÁXIMO': '2026-08-08',
  'RAMIREZ BELMONTE, MAURO SEBASTIAN': null,
  'RAMIREZ MERCÉ, JUAN PABLO': '2026-04-18',
  'RIVADENEIRA, VICTORIANO RUBEN': '2026-06-13',
  'ROBLES, BAUTISTA ESTEBAN': null,
  'RODRIGUEZ, TOBÍAS JOSUÉ': null,
  'RUIZ, BALTAZAR ANTONIO': null,
  'SALAS, BAUTISTA': '2026-05-09',
  'SAMANIEGO, MATEHO': null,
  'SIMONI, GIOVANNI TIZIANO': null,
  'SIRENA CALVO, VALENTINO': null,
  'SORIA PINNA, MATEO': '2026-03-21',
  'TEJEDA, ALVARO JOSÉ': '2026-04-25',
  'TROVO SELIS, TOBIAS VALENTIN': null,
  'VILLACORTA, NICOLAS': '2026-05-09',
  'VITRIU, JUAN IGNACIO': null,
  'ZELAYA, BENJAMIN': null,
}

// Los nombres de la planilla y los de la base se escriben con distintos
// acentos y mayúsculas, así que se comparan normalizados.
export function clave(texto) {
  return (texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Empareja la planilla con los jugadores cargados: primero por apellido +
// nombre completo y, si no hay, por apellido solo (cuando es de uno solo).
// Devuelve [{ jugador_id, fecha }] con los que sí fueron capitanes.
export function emparejar(jugadores) {
  const porNombre = new Map()
  const porApellido = new Map()
  for (const j of jugadores) {
    porNombre.set(clave(`${j.apellido} ${j.nombre}`), j)
    const k = clave(j.apellido)
    porApellido.set(k, porApellido.has(k) ? null : j)
  }
  const filas = []
  const sinEmparejar = []
  for (const [entrada, fecha] of Object.entries(CAPITANES_INICIALES)) {
    if (!fecha) continue
    const [ape, nom = ''] = entrada.split(',')
    const j = porNombre.get(clave(`${ape} ${nom}`)) || porApellido.get(clave(ape))
    if (j) filas.push({ jugador_id: j.id, fecha })
    else sinEmparejar.push(entrada)
  }
  return { filas, sinEmparejar }
}
