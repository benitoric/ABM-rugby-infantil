# 🏉 Rugby M12 · Tucumán Lawn Tennis

App de gestión de jugadores para el staff de la división M12 de rugby infantil.
Funciona desde el celular y la PC (es una web app; se puede "agregar a la
pantalla de inicio" del teléfono y queda como una app más).

## Funciones

1. **Jugadores (ABM)**: altas, bajas y modificaciones. Datos personales, tutor,
   posición, estado (activo / lesionado / inactivo) y ficha médica.
2. **Ficha de seguimiento evolutivo**: entradas por fecha y área (técnica, física,
   táctica, actitudinal, social) con valoración de 1 a 5 estrellas y comentarios.
3. **Asistencia**: eventos de tipo entrenamiento o partido, con toma rápida
   (Presente / Tarde / Justificado / Ausente) y porcentajes por jugador.
4. **Bloques del día de partido**: asignación de los presentes a los 2 bloques
   que presenta el club.
5. **Equipos por tiempo**: cada bloque juega 4 a 6 tiempos; se arma el equipo de
   cada tiempo y la app avisa qué chicos todavía no jugaron ningún tiempo.

## Arquitectura

- **Frontend**: React + Vite, CSS propio, mobile-first (`src/`).
- **API**: funciones serverless de Vercel (`api/` + `server/`), en el mismo repo.
- **Base de datos**: PostgreSQL propio en [Neon](https://neon.tech) (plan
  gratuito). Esquema en `db/schema.sql`.
- **Acceso**: login con email y contraseña. Solo pueden entrar los emails
  cargados en la tabla `staff` desde la pestaña Staff de la app. En el primer
  ingreso, cada persona crea su contraseña. Las sesiones usan JWT (60 días).

## Puesta en marcha (una sola vez)

### 1. Base de datos en Neon

1. Entrá a [console.neon.tech](https://console.neon.tech) con tu cuenta.
2. Creá un proyecto nuevo (ej. `rugby-m12`, región AWS São Paulo).
3. Copiá la **connection string** (botón "Connect", incluye `?sslmode=require`).
4. Creá las tablas. Opción A — desde tu PC:
   ```bash
   DATABASE_URL='postgresql://...' npm run db:init
   ```
   Opción B — pegá el contenido de `db/schema.sql` en el **SQL Editor** de Neon.

### 2. Hosting en Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importá este
   repositorio (igual que hiciste con finanzas-familia).
2. En **Environment Variables** agregá:
   - `DATABASE_URL`: la connection string de Neon.
   - `JWT_SECRET`: una frase larga y aleatoria (por ej. 40 caracteres).
3. Deploy. Cada push a `main` redeploya solo.

### 3. Primer ingreso

Entrá con `benitoric@gmail.com` (ya está cargado como staff en el esquema):
la app te pide crear tu contraseña. Después sumá al resto del staff desde la
pestaña **Staff**.

## Desarrollo local

```bash
npm install
npm run dev:api   # API con base en memoria (PGLITE=1) en :3001
npm run dev       # frontend en :5173, proxy /api → :3001
```

Para desarrollar contra la base real: `DATABASE_URL='postgresql://...' node scripts/dev-server.mjs`.
