# Task: Add User-Facing MDBList Playlist Browser to Aperture

## Overview
Add a "Browse Pre-made Playlists" section to the Aperture Playlists page where non-admin users can browse and subscribe to MDBList curated playlists. Users should NOT need to configure any API keys — the admin's already-configured MDBList API key is used.

## Current State
- Aperture already has full MDBList integration (admin-only):
  - API routes in `apps/api/src/routes/mdblist/index.ts` — all gated by `requireAdmin`
  - `MDBListSelector` component in `apps/web/src/pages/settings/components/MDBListSelector.tsx`
  - Core functions in `packages/core/src/mdblist/provider.ts`
- Playlists page at `apps/web/src/pages/playlists/index.tsx`
- Auth plugin at `apps/api/src/plugins/auth.ts` (has `requireAdmin` and likely `requireAuth`)

## What to Build

### Backend Changes

1. **New user-facing MDBList routes** (`apps/api/src/routes/mdblist-browse/index.ts` or extend existing):
   - `GET /api/browse/playlists/featured` — returns the 10 pre-defined curated lists (hardcoded list IDs)
   - `GET /api/browse/playlists/top` — proxy to MDBList top lists (using admin key)
   - `GET /api/browse/playlists/search?q=...` — proxy to MDBList search
   - `GET /api/browse/playlists/:id/items` — get list items with library match info
   - `POST /api/browse/playlists/subscribe` — subscribe current user to a list
   - `DELETE /api/browse/playlists/subscribe/:id` — unsubscribe
   - `GET /api/browse/playlists/subscriptions` — get current user's subscriptions
   
   All routes should use `requireAuth` (not `requireAdmin`). They use the admin's MDBList API key internally.

2. **Subscription storage** — new DB table `user_mdblist_subscriptions`:
   ```sql
   CREATE TABLE IF NOT EXISTS user_mdblist_subscriptions (
     id SERIAL PRIMARY KEY,
     user_id UUID NOT NULL,
     emby_user_id TEXT NOT NULL,
     mdblist_id INTEGER NOT NULL,
     list_name TEXT NOT NULL,
     mediatype TEXT DEFAULT 'movie',
     enabled BOOLEAN DEFAULT true,
     created_at TIMESTAMP DEFAULT NOW(),
     UNIQUE(user_id, mdblist_id)
   );
   ```

### Frontend Changes

3. **Add "Browse Playlists" tab/section** to `apps/web/src/pages/playlists/index.tsx`:
   - Add a Tabs component: "My Playlists" | "Browse Pre-made"
   - "Browse Pre-made" tab shows:
     - **Featured** section: 10 curated lists with poster-like cards
     - **Search** bar to find more lists
     - Each list card shows: name, item count, likes, "Subscribe" button
     - Subscribed lists show a checkmark + "Unsubscribe" button
   
4. **New component** `apps/web/src/pages/playlists/components/BrowsePlaylistsTab.tsx`:
   - Featured lists grid
   - Search functionality
   - Subscribe/unsubscribe toggles
   - Show library match percentage (how many items are available)

### Pre-defined Featured Lists (hardcode these IDs):
```
{id: 14, name: "Trending Movies This Week", mediatype: "movie"}
{id: 2194, name: "Latest TV Shows", mediatype: "show"}
{id: 3093, name: "Netflix Movies", mediatype: "movie"}
{id: 3082, name: "Netflix TV Shows", mediatype: "show"}
{id: 3095, name: "Disney+ Movies", mediatype: "movie"}
{id: 3090, name: "Disney+ TV Shows", mediatype: "show"}
{id: 2410, name: "Top Horror Movies", mediatype: "movie"}
{id: 2412, name: "Top Sci-Fi & Fantasy", mediatype: "movie"}
{id: 3892, name: "Mindfuck Movies", mediatype: "movie"}
{id: 3895, name: "Most Pirated This Week", mediatype: "movie"}
```

## Style Guide
- Match Aperture's existing dark theme (MUI, dark mode)
- Use existing component patterns (Card, Grid, Typography from MUI)
- Keep consistent with the existing playlists page design
- Mobile-responsive

## Auth Pattern
Look at `apps/api/src/plugins/auth.ts` for how `requireAuth` works. The user object on the request should have their Emby user ID. Use that for subscriptions.

## Important Notes
- Do NOT modify any existing routes or components — only ADD new ones
- The subscription data will be consumed by an external Python sync script (not part of this task)
- Keep the MDBList API key usage transparent to users — they just see lists, not configuration
- TypeScript throughout
