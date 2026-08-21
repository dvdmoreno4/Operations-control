# Operations Control

Next.js app (App Router, TypeScript, Tailwind CSS v4).

## Desarrollo

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

## Deploy en Vercel

1. Importar el repo `erickmorenocode/Operations-control` en [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Next.js** (autodetectado).
3. Build command: `next build` (default). Output: managed por Vercel (no usar `output: export`).
4. Si el proyecto usa variables de entorno, definirlas en Project Settings → Environment Variables (no commitear `.env*`).
5. Deploy automático en cada push a `main`.
