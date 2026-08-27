# Paisa — Personal Finance Manager

Track net worth, cash flow, investments, and every kind of account in one place.

## Tech Stack

- **Frontend**: React 19 + TanStack Router + TanStack Start (SSR)
- **Styling**: Tailwind CSS 4 + Radix UI primitives
- **Backend**: TanStack Start server functions (Nitro)
- **Database**: Supabase (PostgreSQL + Auth + Row Level Security)
- **AI Chat**: OpenAI-compatible API via Vercel AI SDK

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your Supabase and AI provider credentials

# 3. Start development server
npm run dev
```

## Production Deployment

```bash
# Build for production
npm run build

# Start the production server
npm start
```

### Docker

```bash
docker build -t paisa-app .
docker run -p 3000:3000 --env-file .env paisa-app
```

### Vercel

```bash
vercel --prod
```

See `.env.example` for all required environment variables.

## Project Structure

```
src/
├── routes/          # File-based routing (TanStack Router)
│   ├── __root.tsx   # App shell
│   ├── auth.tsx     # Authentication page
│   ├── _authenticated/  # Protected routes
│   └── api/         # Server API routes
├── components/      # React components
├── integrations/    # Supabase client + auth
├── lib/             # Business logic, server functions
└── hooks/           # Custom React hooks
```
