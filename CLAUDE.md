# Rugby M12 · Tucumán Lawn Tennis

App de gestión de jugadores para el staff de la división M12 de rugby infantil.

## Instrucciones permanentes del dueño del repo

- **Mergear los pull requests sin pedirle nada al usuario**: una vez que los
  cambios están pusheados y verificados, marcar el PR como listo (ready for
  review) y mergearlo directamente. No pedirle al usuario que lo haga él.
- Comunicarse en español (Argentina).

## Arquitectura

- **Frontend**: React + Vite, CSS propio mobile-first, en `src/`.
- **API**: funciones serverless de Vercel — `api/[...path].js` delega en
  `server/router.js`. Sin framework de backend.
- **Base de datos**: PostgreSQL en Neon (plan gratuito, proyecto propio del
  club). Esquema en `db/schema.sql`.
- **Auth**: login email + contraseña contra la tabla `staff` (bcryptjs + JWT
  de 60 días firmado con `JWT_SECRET`). El primer ingreso de un email invitado
  crea su contraseña. Sin registro abierto: solo emails cargados en `staff`.
- **Deploy**: Vercel (auto-deploy en cada push a `main`). Variables de entorno
  requeridas: `DATABASE_URL` (Neon) y `JWT_SECRET`.
- Diagnóstico de despliegue: `GET /api/health`.

## Desarrollo y pruebas

```bash
npm install
npm run dev:api   # API en :3001 con Postgres en memoria (PGLITE=1)
npm run dev       # frontend en :5173 con proxy /api → :3001
npm run build     # build de producción
```

- Las columnas `date`/`time` se devuelven como texto (`::text` en los SELECT
  del router) para evitar objetos Date con desfase de zona horaria.
- Para probar la API completa: levantar `PGLITE=1 node scripts/dev-server.mjs`
  (sirve `dist/` + API) y correr requests contra `/api/...`.
