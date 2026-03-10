# Project Context

This is a TypeScript monorepo (pnpm workspaces) for Aperture — an AI movie recommendation engine.

## Structure
- `apps/web/` — React + MUI frontend (Vite SPA)
- `apps/api/` — Fastify API server
- `packages/core/` — Shared business logic

## Key Files
- Auth: `apps/api/src/plugins/auth.ts` — `requireAuth` (any user) and `requireAdmin`
- MDBList routes: `apps/api/src/routes/mdblist/index.ts` (admin-only)
- MDBList core: `packages/core/src/mdblist/provider.ts`
- Playlists page: `apps/web/src/pages/playlists/index.tsx`
- DB queries: use `query()` and `queryOne()` from `@aperture/core` or `../lib/db.js`

## Auth
- Users authenticate via Emby/Jellyfin credentials
- `request.user` has: `id` (UUID), `username`, `providerUserId` (Emby user ID), `isAdmin`
- Use `requireAuth` for user routes, `requireAdmin` for admin routes

## Task
Read TASK.md and implement the user-facing MDBList playlist browser.

## Rules
- TypeScript throughout
- Do NOT modify existing files unless absolutely necessary (prefer adding new files)
- Follow existing code patterns and style
- Dark theme MUI components
