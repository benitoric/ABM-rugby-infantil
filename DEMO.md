# Versión de prueba (demo)

Una copia de la app con **datos ficticios**, para que entrenadores de otros
clubes la prueben sin ver nada de los chicos reales. Usa el mismo código que
la app del club: cada push a `main` actualiza las dos.

La base de la demo se llena sola: la primera vez que la app arranca con la
base vacía crea las tablas y carga una temporada inventada. No hace falta
correr nada a mano.

## Paso 1 · Base nueva en Neon

1. Entrá a <https://console.neon.tech> con la misma cuenta que usás para la
   app del club.
2. Arriba a la izquierda, en el selector de proyectos, tocá **New project**.
3. Completá:
   - **Project name**: `rugby-demo`
   - **Postgres version**: la que venga por defecto
   - **Region**: la misma que la del club (por ejemplo *AWS São Paulo*), así
     responde rápido
4. Tocá **Create project**.
5. En la pantalla que aparece (o en **Dashboard → Connect**), copiá la
   **Connection string**. Es una línea que empieza con `postgresql://`.
   Dejá tildado *Pooled connection* si aparece la opción.

> ⚠️ Fijate que estás copiando la del proyecto **rugby-demo**, no la del
> club. Igual, si te equivocás, la app no siembra nada en una base que ya
> tiene jugadores.

No hace falta crear tablas ni pegar nada en el SQL Editor.

## Paso 2 · Proyecto nuevo en Vercel

1. Entrá a <https://vercel.com> con tu cuenta.
2. Tocá **Add New… → Project**.
3. En la lista de repositorios de GitHub, buscá **ABM-rugby-infantil** y
   tocá **Import**. Es el mismo repo de la app del club: está bien, Vercel
   deja tener dos proyectos sobre el mismo repo.
4. En **Project Name** poné `rugby-m12-demo` (ese nombre arma la dirección:
   `rugby-m12-demo.vercel.app`).
5. **Framework Preset**: Vite (lo detecta solo). No toques los comandos de
   build.
6. Abrí **Environment Variables** y cargá estas tres, una por una (Name y
   Value, después **Add**):

   | Name           | Value                                                        |
   | -------------- | ------------------------------------------------------------ |
   | `DATABASE_URL` | la Connection string de **rugby-demo** (paso 1, Neon)         |
   | `JWT_SECRET`   | un texto largo cualquiera, distinto del de la app del club (por ejemplo, 40 letras y números al azar) |
   | `DEMO`         | `1`                                                          |

7. Tocá **Deploy** y esperá a que termine (uno o dos minutos).

## Paso 3 · Primer ingreso

1. Abrí la dirección que te dio Vercel (por ejemplo
   `https://rugby-m12-demo.vercel.app`). Arriba tiene que aparecer la franja
   roja **"Versión de prueba · todos los datos son ficticios"**.
2. Ingresá con tu email. La primera vez la app tarda unos segundos más: está
   creando las tablas y cargando los datos de prueba. Como es tu primer
   ingreso, te pide crear una contraseña (conviene una distinta de la del club).
3. Para revisar que quedó todo bien, abrí `/api/health` en esa dirección:
   tiene que decir `"demo": true` y `"tablas": "ok"`.

## Paso 4 · Invitar entrenadores

Cada invitado entra con **su propio email**:

1. En la demo, andá a **Staff** y sumalo con su email y el rol que quieras que
   pruebe: Entrenador o PF para ver todo, Cabeza de división para ver además
   el informe, la encuesta y la administración, o Manager para ver lo que ven
   los padres.
2. Mandale la dirección de la demo. La primera vez que entra con su email, la
   app le pide crear su contraseña.

Para cambiarle el rol o sacarlo, se hace desde la misma pantalla de Staff.

## Qué trae

38 chicos inventados (dos dados de baja y tres que llegaron con la temporada
empezada), 8 personas de staff inventadas con todos los roles, una temporada
de entrenamientos (asistencia, plan técnico, planilla del PF y tests físicos
en tres tomas), partidos con bloques, tiempos, capitanes y crónicas, lesiones y
golpes, dos rondas de evaluaciones y un proceso abierto (con algunas para vos),
una gira con casas y pagos, dos encuentros, barrios en el mapa (tres sin
ubicar) y una encuesta cerrada con resultados, más otra en borrador. Los
boletines y el informe de gestión salen solos de esos datos. No trae escaneos
de DNI.

Las fechas se arman relativas al día en que se sembró. Con el tiempo los datos
quedan "viejos" (por ejemplo, el próximo partido pasa a ser uno pasado).

## Volver a dejarla como nueva

Cuando los invitados la desordenaron o querés las fechas al día: desde una
computadora con el repo (o pidiéndoselo a Claude):

```bash
DEMO=1 DATABASE_URL='postgresql://...la de la demo...' npm run seed:demo
```

Borra todo lo cargado y arma la temporada de nuevo. Las cuentas reales (vos y
los invitados) quedan con sus contraseñas. Con
`DEMO_INVITADOS='ana@mail.com:Entrenador, juan@mail.com:Manager principal'`
delante del comando, además los suma al staff.

## Probarla en la computadora

```bash
npm run build && npm run dev:demo
```

Levanta la demo en <http://localhost:3001> con una base en memoria (se pierde
al cerrarla).
