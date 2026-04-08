# x-factor

This project started as a Base44 app and is being migrated to a Supabase-backed SDK compatibility layer.

## Local development

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
# Optional: defaults to "uploads"
VITE_SUPABASE_STORAGE_BUCKET=uploads
```

### 3) Run app

```bash
npm run dev
```

## Build and checks

```bash
npm run lint
npm run build
npm run test
```

## Deployment

Deploy to Vercel and configure the same Supabase environment variables in Vercel project settings.
