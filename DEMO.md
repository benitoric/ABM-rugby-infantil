# Versión de prueba (demo)

Una copia de la app con **datos ficticios**, para que entrenadores de otros
clubes la prueben sin ver nada de los chicos reales. Usa el mismo código que
la app del club: cada push a `main` actualiza las dos.

## Puesta en marcha (una sola vez)

1. **Base nueva en Neon**: en tu cuenta de Neon, *New Project* (por ejemplo
   `rugby-m12-demo`). Copiá la cadena de conexión (*Connection string*).
   Tiene que ser una base distinta de la del club.
2. **Proyecto nuevo en Vercel**: *Add New → Project*, elegí este mismo
   repositorio y ponele otro nombre (por ejemplo `rugby-m12-demo`). En
   *Environment Variables* cargá:
   - `DATABASE_URL` = la cadena de la base **de la demo**
   - `JWT_SECRET` = un texto largo cualquiera, distinto del de la app del club
   - `DEMO` = `1`

   y apretá *Deploy*.
3. **Cargar los datos ficticios**: desde una computadora con el repo
   (o pidiéndoselo a Claude):

   ```bash
   DEMO=1 DATABASE_URL='postgresql://...la de la demo...' npm run seed:demo
   ```

   Si por error se usa la cadena de la base del club, el script se niega y no
   toca nada.
4. Entrá a la demo con tu email: la primera vez te pide crear la contraseña.

## Invitar entrenadores

Cada invitado entra con **su propio email**:

- Desde la demo: **Staff → sumar** con su email y el rol que quieras que
  pruebe (Entrenador, Cabeza de división, Manager…). La primera vez que entra,
  crea su contraseña.
- O de una, al sembrar:

  ```bash
  DEMO=1 DATABASE_URL='...' DEMO_INVITADOS='ana@mail.com:Entrenador, juan@mail.com:Manager principal' npm run seed:demo
  ```

## Volver a dejarla como nueva

El mismo comando `npm run seed:demo` borra todo lo que hayan cargado los
invitados y arma la temporada de nuevo, con las fechas corridas a hoy. Las
cuentas reales (vos y los invitados) quedan con sus contraseñas.

## Qué trae

38 chicos inventados (dos dados de baja y tres que llegaron con la temporada
empezada), 8 personas de staff inventadas con todos los roles, una temporada
de entrenamientos (asistencia, plan técnico, planilla del PF, tests físicos en
tres tomas), partidos con bloques, tiempos, capitanes y crónicas, lesiones y
golpes, dos rondas de evaluaciones y un proceso abierto, una gira con casas y
pagos, dos encuentros, barrios en el mapa (tres sin ubicar) y una encuesta
cerrada con resultados más otra en borrador. Los boletines y el informe de
gestión salen solos de esos datos. No trae escaneos de DNI.
