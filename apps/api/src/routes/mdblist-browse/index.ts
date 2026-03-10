import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../plugins/auth.js'
import { query, queryOne } from '../../lib/db.js'
import {
  isMDBListConfigured,
  getTopLists,
  searchLists,
  getListInfo,
  getListItems,
} from '@aperture/core'
import {
  browseMdblistSchemas,
  getFeaturedListsSchema,
  getTopListsSchema,
  searchListsSchema,
  getListItemsSchema,
  subscribeSchema,
  unsubscribeSchema,
  getSubscriptionsSchema,
  getListInfoSchema,
} from './schemas.js'

// Pre-defined featured lists (hardcoded IDs)
const FEATURED_LISTS = [
  { id: 14, name: 'Trending Movies This Week', mediatype: 'movie' as const },
  { id: 2194, name: 'Latest TV Shows', mediatype: 'show' as const },
  { id: 3093, name: 'Netflix Movies', mediatype: 'movie' as const },
  { id: 3082, name: 'Netflix TV Shows', mediatype: 'show' as const },
  { id: 3095, name: 'Disney+ Movies', mediatype: 'movie' as const },
  { id: 3090, name: 'Disney+ TV Shows', mediatype: 'show' as const },
  { id: 2410, name: 'Top Horror Movies', mediatype: 'movie' as const },
  { id: 2412, name: 'Top Sci-Fi & Fantasy', mediatype: 'movie' as const },
  { id: 3892, name: 'Mindfuck Movies', mediatype: 'movie' as const },
  { id: 3895, name: 'Most Pirated This Week', mediatype: 'movie' as const },
]

interface SubscriptionRow {
  id: number
  mdblist_id: number
  list_name: string
  mediatype: string
  enabled: boolean
  created_at: Date
}

const mdblistBrowseRoutes: FastifyPluginAsync = async (fastify) => {
  // Register schemas
  for (const [name, schema] of Object.entries(browseMdblistSchemas)) {
    fastify.addSchema({ $id: `browse-${name}`, ...schema })
  }

  // =========================================================================
  // Featured Lists (hardcoded curated lists)
  // =========================================================================

  /**
   * GET /api/browse/playlists/featured
   * Get the 10 pre-defined featured/curated lists
   */
  fastify.get(
    '/api/browse/playlists/featured',
    { preHandler: requireAuth, schema: getFeaturedListsSchema },
    async (request, reply) => {
      try {
        const configured = await isMDBListConfigured()
        if (!configured) {
          return reply.status(400).send({ error: 'MDBList is not configured by admin' })
        }

        const userId = request.user!.id

        // Get user's subscriptions to mark which lists they're subscribed to
        const subscriptions = await query<{ mdblist_id: number }>(
          'SELECT mdblist_id FROM user_mdblist_subscriptions WHERE user_id = $1',
          [userId]
        )
        const subscribedIds = new Set(subscriptions.rows.map((s) => s.mdblist_id))

        // Fetch info for each featured list
        const listsWithInfo = await Promise.all(
          FEATURED_LISTS.map(async (featured) => {
            try {
              const info = await getListInfo(featured.id)
              return {
                id: featured.id,
                name: info?.name || featured.name,
                mediatype: info?.mediatype || featured.mediatype,
                description: info?.description || null,
                items: info?.items || 0,
                likes: info?.likes || 0,
                isSubscribed: subscribedIds.has(featured.id),
              }
            } catch {
              // If we can't fetch info, use the hardcoded data
              return {
                id: featured.id,
                name: featured.name,
                mediatype: featured.mediatype,
                description: null,
                items: 0,
                likes: 0,
                isSubscribed: subscribedIds.has(featured.id),
              }
            }
          })
        )

        return reply.send({ lists: listsWithInfo })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get featured lists')
        return reply.status(500).send({ error: 'Failed to get featured lists' })
      }
    }
  )

  // =========================================================================
  // Top Lists (proxy to MDBList)
  // =========================================================================

  /**
   * GET /api/browse/playlists/top
   * Proxy to MDBList top lists (using admin key)
   */
  fastify.get<{
    Querystring: {
      mediatype?: 'movie' | 'show'
      limit?: string
    }
  }>(
    '/api/browse/playlists/top',
    { preHandler: requireAuth, schema: getTopListsSchema },
    async (request, reply) => {
      try {
        const configured = await isMDBListConfigured()
        if (!configured) {
          return reply.status(400).send({ error: 'MDBList is not configured by admin' })
        }

        const userId = request.user!.id
        const { mediatype, limit } = request.query

        // Get user's subscriptions
        const subscriptions = await query<{ mdblist_id: number }>(
          'SELECT mdblist_id FROM user_mdblist_subscriptions WHERE user_id = $1',
          [userId]
        )
        const subscribedIds = new Set(subscriptions.rows.map((s) => s.mdblist_id))

        const lists = await getTopLists(mediatype)

        // Apply optional limit
        const maxItems = limit ? parseInt(limit, 10) : 20
        const limitedLists = lists.slice(0, maxItems)

        // Add subscription status
        const listsWithStatus = limitedLists.map((list) => ({
          ...list,
          isSubscribed: subscribedIds.has(list.id),
        }))

        return reply.send({ lists: listsWithStatus })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get top lists')
        return reply.status(500).send({ error: 'Failed to get top lists' })
      }
    }
  )

  // =========================================================================
  // Search Lists
  // =========================================================================

  /**
   * GET /api/browse/playlists/search
   * Search public MDBList lists
   */
  fastify.get<{
    Querystring: {
      q: string
      mediatype?: 'movie' | 'show'
    }
  }>(
    '/api/browse/playlists/search',
    { preHandler: requireAuth, schema: searchListsSchema },
    async (request, reply) => {
      try {
        const configured = await isMDBListConfigured()
        if (!configured) {
          return reply.status(400).send({ error: 'MDBList is not configured by admin' })
        }

        const userId = request.user!.id
        const { q, mediatype } = request.query

        if (!q || q.length < 2) {
          return reply.status(400).send({ error: 'Search query must be at least 2 characters' })
        }

        // Get user's subscriptions
        const subscriptions = await query<{ mdblist_id: number }>(
          'SELECT mdblist_id FROM user_mdblist_subscriptions WHERE user_id = $1',
          [userId]
        )
        const subscribedIds = new Set(subscriptions.rows.map((s) => s.mdblist_id))

        const lists = await searchLists(q, mediatype)

        // Add subscription status
        const listsWithStatus = lists.map((list) => ({
          ...list,
          isSubscribed: subscribedIds.has(list.id),
        }))

        return reply.send({ lists: listsWithStatus })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to search lists')
        return reply.status(500).send({ error: 'Failed to search lists' })
      }
    }
  )

  // =========================================================================
  // List Info
  // =========================================================================

  /**
   * GET /api/browse/playlists/:id
   * Get list info
   */
  fastify.get<{
    Params: { id: string }
  }>(
    '/api/browse/playlists/:id',
    { preHandler: requireAuth, schema: getListInfoSchema },
    async (request, reply) => {
      try {
        const configured = await isMDBListConfigured()
        if (!configured) {
          return reply.status(400).send({ error: 'MDBList is not configured by admin' })
        }

        const listId = parseInt(request.params.id, 10)
        if (isNaN(listId)) {
          return reply.status(400).send({ error: 'Invalid list ID' })
        }

        const userId = request.user!.id

        const info = await getListInfo(listId)
        if (!info) {
          return reply.status(404).send({ error: 'List not found' })
        }

        // Check if user is subscribed
        const subscription = await queryOne<{ id: number }>(
          'SELECT id FROM user_mdblist_subscriptions WHERE user_id = $1 AND mdblist_id = $2',
          [userId, listId]
        )

        return reply.send({
          list: {
            ...info,
            isSubscribed: !!subscription,
          },
        })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get list info')
        return reply.status(500).send({ error: 'Failed to get list info' })
      }
    }
  )

  // =========================================================================
  // List Items with Library Match
  // =========================================================================

  /**
   * GET /api/browse/playlists/:id/items
   * Get list items with library match information
   */
  fastify.get<{
    Params: { id: string }
    Querystring: { limit?: string }
  }>(
    '/api/browse/playlists/:id/items',
    { preHandler: requireAuth, schema: getListItemsSchema },
    async (request, reply) => {
      try {
        const configured = await isMDBListConfigured()
        if (!configured) {
          return reply.status(400).send({ error: 'MDBList is not configured by admin' })
        }

        const listId = parseInt(request.params.id, 10)
        if (isNaN(listId)) {
          return reply.status(400).send({ error: 'Invalid list ID' })
        }

        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100

        const items = await getListItems(listId, { limit })

        // Get library match info
        const movieTmdbIds = items
          .filter((i) => i.mediatype === 'movie' && i.tmdbid)
          .map((i) => String(i.tmdbid))
        const movieImdbIds = items
          .filter((i) => i.mediatype === 'movie' && i.imdbid)
          .map((i) => i.imdbid!)
        const showTmdbIds = items
          .filter((i) => i.mediatype === 'show' && i.tmdbid)
          .map((i) => String(i.tmdbid))
        const showImdbIds = items
          .filter((i) => i.mediatype === 'show' && i.imdbid)
          .map((i) => i.imdbid!)
        const showTvdbIds = items
          .filter((i) => i.mediatype === 'show' && i.tvdbid)
          .map((i) => String(i.tvdbid))

        interface MatchRow {
          tmdb_id: string | null
          imdb_id: string | null
          tvdb_id?: string | null
        }

        const matchedMovieTmdbIds = new Set<string>()
        const matchedMovieImdbIds = new Set<string>()
        const matchedShowTmdbIds = new Set<string>()
        const matchedShowImdbIds = new Set<string>()
        const matchedShowTvdbIds = new Set<string>()

        // Match movies
        if (movieTmdbIds.length > 0 || movieImdbIds.length > 0) {
          const movieResult = await query<MatchRow>(
            `SELECT tmdb_id, imdb_id FROM movies
             WHERE tmdb_id = ANY($1) OR imdb_id = ANY($2)`,
            [movieTmdbIds, movieImdbIds]
          )
          for (const row of movieResult.rows) {
            if (row.tmdb_id) matchedMovieTmdbIds.add(row.tmdb_id)
            if (row.imdb_id) matchedMovieImdbIds.add(row.imdb_id)
          }
        }

        // Match shows
        if (showTmdbIds.length > 0 || showImdbIds.length > 0 || showTvdbIds.length > 0) {
          const showResult = await query<MatchRow>(
            `SELECT tmdb_id, imdb_id, tvdb_id FROM series
             WHERE tmdb_id = ANY($1) OR imdb_id = ANY($2) OR tvdb_id = ANY($3)`,
            [showTmdbIds, showImdbIds, showTvdbIds]
          )
          for (const row of showResult.rows) {
            if (row.tmdb_id) matchedShowTmdbIds.add(row.tmdb_id)
            if (row.imdb_id) matchedShowImdbIds.add(row.imdb_id)
            if (row.tvdb_id) matchedShowTvdbIds.add(row.tvdb_id)
          }
        }

        // Add inLibrary flag to each item
        const itemsWithMatch = items.map((item) => {
          let inLibrary = false
          if (item.mediatype === 'movie') {
            inLibrary =
              (!!item.tmdbid && matchedMovieTmdbIds.has(String(item.tmdbid))) ||
              (!!item.imdbid && matchedMovieImdbIds.has(item.imdbid))
          } else if (item.mediatype === 'show') {
            inLibrary =
              (!!item.tmdbid && matchedShowTmdbIds.has(String(item.tmdbid))) ||
              (!!item.imdbid && matchedShowImdbIds.has(item.imdbid)) ||
              (!!item.tvdbid && matchedShowTvdbIds.has(String(item.tvdbid)))
          }
          return { ...item, inLibrary }
        })

        const matchedCount = itemsWithMatch.filter((i) => i.inLibrary).length
        const matchPercentage = items.length > 0 ? Math.round((matchedCount / items.length) * 100) : 0

        return reply.send({
          items: itemsWithMatch,
          libraryMatch: {
            total: items.length,
            matched: matchedCount,
            matchPercentage,
          },
        })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get list items')
        return reply.status(500).send({ error: 'Failed to get list items' })
      }
    }
  )

  // =========================================================================
  // Subscriptions
  // =========================================================================

  /**
   * POST /api/browse/playlists/subscribe
   * Subscribe current user to a list
   */
  fastify.post<{
    Body: {
      mdblistId: number
      listName: string
      mediatype?: string
    }
  }>(
    '/api/browse/playlists/subscribe',
    { preHandler: requireAuth, schema: subscribeSchema },
    async (request, reply) => {
      try {
        const userId = request.user!.id
        const embyUserId = request.user!.providerUserId
        const { mdblistId, listName, mediatype = 'movie' } = request.body

        // Check if already subscribed
        const existing = await queryOne<{ id: number }>(
          'SELECT id FROM user_mdblist_subscriptions WHERE user_id = $1 AND mdblist_id = $2',
          [userId, mdblistId]
        )

        if (existing) {
          return reply.status(400).send({ error: 'Already subscribed to this list' })
        }

        // Insert subscription
        const result = await queryOne<SubscriptionRow>(
          `INSERT INTO user_mdblist_subscriptions (user_id, emby_user_id, mdblist_id, list_name, mediatype)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, mdblist_id, list_name, mediatype, enabled, created_at`,
          [userId, embyUserId, mdblistId, listName, mediatype]
        )

        return reply.send({
          subscription: {
            id: result!.id,
            mdblistId: result!.mdblist_id,
            listName: result!.list_name,
            mediatype: result!.mediatype,
            enabled: result!.enabled,
            createdAt: result!.created_at,
          },
        })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to subscribe to list')
        return reply.status(500).send({ error: 'Failed to subscribe to list' })
      }
    }
  )

  /**
   * DELETE /api/browse/playlists/subscribe/:id
   * Unsubscribe current user from a list
   */
  fastify.delete<{
    Params: { id: string }
  }>(
    '/api/browse/playlists/subscribe/:id',
    { preHandler: requireAuth, schema: unsubscribeSchema },
    async (request, reply) => {
      try {
        const userId = request.user!.id
        const mdblistId = parseInt(request.params.id, 10)

        if (isNaN(mdblistId)) {
          return reply.status(400).send({ error: 'Invalid list ID' })
        }

        const result = await query(
          'DELETE FROM user_mdblist_subscriptions WHERE user_id = $1 AND mdblist_id = $2',
          [userId, mdblistId]
        )

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Subscription not found' })
        }

        return reply.send({ success: true })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to unsubscribe from list')
        return reply.status(500).send({ error: 'Failed to unsubscribe from list' })
      }
    }
  )

  /**
   * GET /api/browse/playlists/subscriptions
   * Get current user's subscriptions
   */
  fastify.get(
    '/api/browse/playlists/subscriptions',
    { preHandler: requireAuth, schema: getSubscriptionsSchema },
    async (request, reply) => {
      try {
        const userId = request.user!.id

        const result = await query<SubscriptionRow>(
          `SELECT id, mdblist_id, list_name, mediatype, enabled, created_at
           FROM user_mdblist_subscriptions
           WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId]
        )

        const subscriptions = result.rows.map((row) => ({
          id: row.id,
          mdblistId: row.mdblist_id,
          listName: row.list_name,
          mediatype: row.mediatype,
          enabled: row.enabled,
          createdAt: row.created_at,
        }))

        return reply.send({ subscriptions })
      } catch (err) {
        fastify.log.error({ err }, 'Failed to get subscriptions')
        return reply.status(500).send({ error: 'Failed to get subscriptions' })
      }
    }
  )

  /**
   * GET /api/browse/playlists/status
   * Check if MDBList is configured (for showing/hiding the feature)
   */
  fastify.get('/api/browse/playlists/status', { preHandler: requireAuth }, async (_request, reply) => {
    try {
      const configured = await isMDBListConfigured()
      return reply.send({ configured })
    } catch (err) {
      fastify.log.error({ err }, 'Failed to check MDBList status')
      return reply.status(500).send({ error: 'Failed to check status' })
    }
  })
}

export default mdblistBrowseRoutes
