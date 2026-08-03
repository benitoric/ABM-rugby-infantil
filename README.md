# 🏉 Rugby M12 · Tucumán Lawn Tennis

App de gestión de jugadores para el staff de la división M12 de rugby infantil.
Funciona desde el celular y la PC (es una web app; se puede "agregar a la pantalla
de inicio" del teléfono y queda como una app más).

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

- **Frontend**: React + Vite, sin librerías de UI (CSS propio, mobile-first).
- **Backend**: [Supabase](https://supabase.com) (PostgreSQL + autenticación).
  Las tablas llevan prefijo `rugby_` porque conviven con otra app en el mismo
  proyecto Supabase (`biuwqdmcbwoqlandgzbg`, "flia"). El esquema completo está
  aplicado como migración `rugby_m12_schema_inicial` en ese proyecto.
- **Seguridad**: todas las tablas tienen RLS. Solo pueden leer/escribir los
  usuarios cuyo email figura en la tabla `rugby_staff` con `activo = true`.
  Crear una cuenta no da acceso: hace falta estar invitado.

## Acceso del staff

1. Un miembro del staff agrega el email del nuevo integrante en la pestaña **Staff**.
2. El nuevo integrante entra a la app, toca **"No tengo cuenta todavía"** y se
   registra con ese mismo email (confirma el email si se lo piden).
3. Al iniciar sesión, la app vincula su cuenta con la invitación y ya tiene acceso.

El primer usuario habilitado es `benitoric@gmail.com`.

## Desarrollo local

```bash
npm install
npm run dev
```

## Publicación (GitHub Pages)

El workflow `.github/workflows/deploy.yml` compila y publica automáticamente en
GitHub Pages con cada push a `main`. Requisitos (una sola vez):

1. El repositorio debe ser **público** (o tener plan pago de GitHub para Pages
   en repos privados).
2. En GitHub: **Settings → Pages → Source: GitHub Actions**.

La app queda en `https://benitoric.github.io/ABM-rugby-infantil/`.

Alternativa: importar el repo en [Vercel](https://vercel.com) o
[Netlify](https://netlify.com) (build `npm run build`, carpeta `dist`).

## Recomendaciones de seguridad

- En el panel de Supabase del proyecto "flia" conviene revisar
  **Authentication → Sign In / Up** y, si tu app familiar ya no necesita
  registros nuevos, desactivar los registros públicos una vez que todo el staff
  haya creado su cuenta.
- Si más adelante liberás un lugar en tu plan de Supabase (o pasás a plan pago),
  se puede migrar la app a un proyecto propio: es correr la migración
  `rugby_m12_schema_inicial` allá y cambiar la URL y la clave en
  `src/supabaseClient.js`.
