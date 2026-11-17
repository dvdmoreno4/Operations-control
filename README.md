# Operations Control

Next.js 15, React 19, Tailwind 4 y Supabase.

## Ejecutar en local

1. `npm install`
2. Crear un proyecto en Supabase y ejecutar `supabase/schema.sql` en su SQL editor.
3. Copiar `.env.example` a `.env.local` y completar las claves de Supabase, `APP_PASSWORD` y `SESSION_SECRET`.
4. `npm run dev`

## Estructura

- `app/`: rutas de Next.js (App Router). `app/page.tsx` monta `src/App.tsx`; `app/api/*` son los endpoints.
- `src/App.tsx`: shell con cabecera, pestañas y contenido.
- `src/components/`: componentes de UI (`ui.tsx` tiene los estilos compartidos).
- `src/lib/`: lógica compartida (`api.ts` envoltorio de rutas, `session.ts` sesión por clave compartida, `supabase.ts` clientes).
- `supabase/`: scripts SQL del esquema.
