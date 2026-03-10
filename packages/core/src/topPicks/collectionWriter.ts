/**
 * Top Picks Collection/Playlist Writer
 * 
 * Creates collections (Box Sets) and playlists in the media server
 * for Top Picks items using the items from the Top Picks library itself
 * (not the original library items) to avoid duplicates.
 */

import { createChildLogger } from '../lib/logger.js'
import { getMediaServerProvider } from '../media/index.js'
import { getMediaServerApiKey } from '../settings/systemSettings.js'
import { getTopPicksConfig } from './config.js'
import type { PopularMovie, PopularSeries } from './popularity.js'
import { query, queryOne } from '../lib/db.js'
import type { Movie, Series } from '../media/types.js'

const logger = createChildLogger('top-picks-collection-writer')

/**
 * Minimal library info needed for querying items
 */
interface LibraryInfo {
  id: string
  guid: string
  name: string
}

/**
 * Get admin user ID for creating playlists
 * Playlists require a user ID, so we use the first admin user
 */
async function getAdminUserId(): Promise<string | null> {
  const result = await queryOne<{ provider_user_id: string }>(
    `SELECT provider_user_id FROM users WHERE is_admin = true LIMIT 1`
  )
  return result?.provider_user_id ?? null
}

/**
 * PATCH: Fallback to original Emby items when no Top Picks library exists.
 * Enables collection/playlist creation on remote servers without STRM/symlinks.
 */
async function getOriginalMovieIds(movies: PopularMovie[]): Promise<string[]> {
  if (movies.length === 0) return []
  const movieIds = movies.map(m => m.movieId)
  const result = await query<{ id: number; provider_item_id: string }>(
    `SELECT id, provider_item_id FROM movies WHERE id = ANY($1)`,
    [movieIds]
  )
  const idMap = new Map(result.rows.map(r => [String(r.id), r.provider_item_id]))
  const ids = movies.map(m => idMap.get(String(m.movieId))).filter(Boolean) as string[]
  logger.info({ requested: movies.length, matched: ids.length }, 'Matched movies via original Emby items (no-library fallback)')
  return ids
}

async function getOriginalSeriesIds(seriesList: PopularSeries[]): Promise<string[]> {
  if (seriesList.length === 0) return []
  const seriesIds = seriesList.map(s => s.seriesId)
  const result = await query<{ id: number; provider_item_id: string }>(
    `SELECT id, provider_item_id FROM series WHERE id = ANY($1)`,
    [seriesIds]
  )
  const idMap = new Map(result.rows.map(r => [String(r.id), r.provider_item_id]))
  const ids = seriesList.map(s => idMap.get(String(s.seriesId))).filter(Boolean) as string[]
  logger.info({ requested: seriesList.length, matched: ids.length }, 'Matched series via original Emby items (no-library fallback)')
  return ids
}

/**
 * Fetch items from a Top Picks library and match them to our ranked list
 * This ensures we use the newly-scanned library items, not originals
 */
async function getTopPicksLibraryMovieIds(
  movies: PopularMovie[],
  topPicksLibrary: LibraryInfo | null
): Promise<string[]> {
  if (!topPicksLibrary || movies.length === 0) {
    logger.debug('No Top Picks library or no movies, skipping')
    return []
  }

  const provider = await getMediaServerProvider()
  const apiKey = await getMediaServerApiKey()
  if (!apiKey) return []

  try {
    // Fetch all items from the Top Picks library
    const result = await provider.getMovies(apiKey, {
      parentIds: [topPicksLibrary.id],
      limit: 500, // Should be enough for Top Picks
    })

    logger.info({ 
      library: topPicksLibrary.name, 
      itemCount: result.items.length 
    }, 'Fetched items from Top Picks Movies library')

    // Create a map for quick lookup by title+year
    const libraryItemMap = new Map<string, Movie>()
    for (const item of result.items) {
      const key = `${item.name.toLowerCase()}|${item.year || ''}`
      libraryItemMap.set(key, item)
    }

    // Match our ranked movies to library items in order
    const matchedIds: string[] = []
    for (const movie of movies) {
      const key = `${movie.title.toLowerCase()}|${movie.year || ''}`
      const libraryItem = libraryItemMap.get(key)
      
      if (libraryItem) {
        matchedIds.push(libraryItem.id)
      } else {
        logger.debug({ title: movie.title, year: movie.year }, 'Movie not found in Top Picks library')
      }
    }

    logger.info({ 
      requested: movies.length, 
      matched: matchedIds.length 
    }, 'Matched movies to Top Picks library items')

    return matchedIds
  } catch (err) {
    logger.error({ err }, 'Failed to fetch items from Top Picks library')
    return []
  }
}

/**
 * Fetch series items from a Top Picks library and match them to our ranked list
 */
async function getTopPicksLibrarySeriesIds(
  seriesList: PopularSeries[],
  topPicksLibrary: LibraryInfo | null
): Promise<string[]> {
  if (!topPicksLibrary || seriesList.length === 0) {
    logger.debug('No Top Picks library or no series, skipping')
    return []
  }

  const provider = await getMediaServerProvider()
  const apiKey = await getMediaServerApiKey()
  if (!apiKey) return []

  try {
    // Fetch all items from the Top Picks library
    const result = await provider.getSeries(apiKey, {
      parentIds: [topPicksLibrary.id],
      limit: 500, // Should be enough for Top Picks
    })

    logger.info({ 
      library: topPicksLibrary.name, 
      itemCount: result.items.length 
    }, 'Fetched items from Top Picks Series library')

    // Create a map for quick lookup by title+year
    const libraryItemMap = new Map<string, Series>()
    for (const item of result.items) {
      const key = `${item.name.toLowerCase()}|${item.year || ''}`
      libraryItemMap.set(key, item)
    }

    // Match our ranked series to library items in order
    const matchedIds: string[] = []
    for (const series of seriesList) {
      const key = `${series.title.toLowerCase()}|${series.year || ''}`
      const libraryItem = libraryItemMap.get(key)
      
      if (libraryItem) {
        matchedIds.push(libraryItem.id)
      } else {
        logger.debug({ title: series.title, year: series.year }, 'Series not found in Top Picks library')
      }
    }

    logger.info({ 
      requested: seriesList.length, 
      matched: matchedIds.length 
    }, 'Matched series to Top Picks library items')

    return matchedIds
  } catch (err) {
    logger.error({ err }, 'Failed to fetch items from Top Picks library')
    return []
  }
}

export interface CollectionWriteResult {
  created: boolean
  collectionId: string
  itemCount: number
}

export interface PlaylistWriteResult {
  created: boolean
  playlistId: string
  itemCount: number
}

/**
 * Create or update a Top Picks Movies collection (Box Set)
 * Uses items from the Top Picks library, not original items
 */
export async function writeTopPicksMoviesCollection(
  movies: PopularMovie[],
  topPicksLibrary: LibraryInfo | null
): Promise<CollectionWriteResult | null> {
  const config = await getTopPicksConfig()
  
  if (!config.moviesCollectionEnabled) {
    logger.debug('Movies collection is disabled, skipping')
    return null
  }
  
  const provider = await getMediaServerProvider()
  const apiKey = await getMediaServerApiKey()
  
  if (!apiKey) {
    logger.error('MEDIA_SERVER_API_KEY not set')
    return null
  }
  
  const collectionName = config.moviesCollectionName || 'Top Picks - Movies'
  logger.info({ name: collectionName, count: movies.length }, 'Creating movies collection')
  
  // Get item IDs from the Top Picks library (not original items)
  let itemIds = await getTopPicksLibraryMovieIds(movies, topPicksLibrary)

  if (itemIds.length === 0) {
    logger.info('No items in Top Picks library, trying original Emby items...')
    itemIds = await getOriginalMovieIds(movies)
  }

  if (itemIds.length === 0) {
    logger.warn('No movie items found anywhere, skipping collection')
    return null
  }

  try {
    const result = await provider.createOrUpdateCollection(apiKey, collectionName, itemIds)

    logger.info({
      collectionId: result.collectionId,
      itemCount: itemIds.length
    }, 'Movies collection created/updated')

    return {
      created: true,
      collectionId: result.collectionId,
      itemCount: itemIds.length,
    }
  } catch (err) {
    logger.error({ err, name: collectionName }, 'Failed to create movies collection')
    return null
  }
}

/**
 * Create or update a Top Picks Series collection (Box Set)
 * Uses items from the Top Picks library, not original items
 */
export async function writeTopPicksSeriesCollection(
  seriesList: PopularSeries[],
  topPicksLibrary: LibraryInfo | null
): Promise<CollectionWriteResult | null> {
  const config = await getTopPicksConfig()
  
  if (!config.seriesCollectionEnabled) {
    logger.debug('Series collection is disabled, skipping')
    return null
  }
  
  const provider = await getMediaServerProvider()
  const apiKey = await getMediaServerApiKey()
  
  if (!apiKey) {
    logger.error('MEDIA_SERVER_API_KEY not set')
    return null
  }
  
  const collectionName = config.seriesCollectionName || 'Top Picks - Series'
  logger.info({ name: collectionName, count: seriesList.length }, 'Creating series collection')
  
  // Get item IDs from the Top Picks library (not original items)
  let itemIds = await getTopPicksLibrarySeriesIds(seriesList, topPicksLibrary)

  if (itemIds.length === 0) {
    logger.info('No items in Top Picks library, trying original Emby items...')
    itemIds = await getOriginalSeriesIds(seriesList)
  }

  if (itemIds.length === 0) {
    logger.warn('No series items found anywhere, skipping collection')
    return null
  }

  try {
    const result = await provider.createOrUpdateCollection(apiKey, collectionName, itemIds)

    logger.info({
      collectionId: result.collectionId,
      itemCount: itemIds.length
    }, 'Series collection created/updated')

    return {
      created: true,
      collectionId: result.collectionId,
      itemCount: itemIds.length,
    }
  } catch (err) {
    logger.error({ err, name: collectionName }, 'Failed to create series collection')
    return null
  }
}

/**
 * Create or update a Top Picks Movies playlist
 * Uses items from the Top Picks library, not original items
 */
export async function writeTopPicksMoviesPlaylist(
  movies: PopularMovie[],
  topPicksLibrary: LibraryInfo | null
): Promise<PlaylistWriteResult | null> {
  const config = await getTopPicksConfig()
  
  if (!config.moviesPlaylistEnabled) {
    logger.debug('Movies playlist is disabled, skipping')
    return null
  }
  
  const provider = await getMediaServerProvider()
  const apiKey = await getMediaServerApiKey()
  
  if (!apiKey) {
    logger.error('MEDIA_SERVER_API_KEY not set')
    return null
  }
  
  // Need an admin user ID for playlist creation
  const adminUserId = await getAdminUserId()
  if (!adminUserId) {
    logger.error('No admin user found for playlist creation')
    return null
  }
  
  const playlistName = config.moviesCollectionName || 'Top Picks - Movies'
  logger.info({ name: playlistName, count: movies.length }, 'Creating movies playlist')
  
  // Get item IDs from the Top Picks library (not original items)
  let itemIds = await getTopPicksLibraryMovieIds(movies, topPicksLibrary)

  if (itemIds.length === 0) {
    logger.info('No items in Top Picks library, trying original Emby items...')
    itemIds = await getOriginalMovieIds(movies)
  }

  if (itemIds.length === 0) {
    logger.warn('No movie items found anywhere, skipping playlist')
    return null
  }

  try {
    const result = await provider.createOrUpdatePlaylist(apiKey, adminUserId, playlistName, itemIds)

    logger.info({
      playlistId: result.playlistId,
      itemCount: itemIds.length
    }, 'Movies playlist created/updated')

    return {
      created: true,
      playlistId: result.playlistId,
      itemCount: itemIds.length,
    }
  } catch (err) {
    logger.error({ err, name: playlistName }, 'Failed to create movies playlist')
    return null
  }
}

/**
 * Create or update a Top Picks Series playlist
 * Uses items from the Top Picks library, not original items
 */
export async function writeTopPicksSeriesPlaylist(
  seriesList: PopularSeries[],
  topPicksLibrary: LibraryInfo | null
): Promise<PlaylistWriteResult | null> {
  const config = await getTopPicksConfig()
  
  if (!config.seriesPlaylistEnabled) {
    logger.debug('Series playlist is disabled, skipping')
    return null
  }
  
  const provider = await getMediaServerProvider()
  const apiKey = await getMediaServerApiKey()
  
  if (!apiKey) {
    logger.error('MEDIA_SERVER_API_KEY not set')
    return null
  }
  
  // Need an admin user ID for playlist creation
  const adminUserId = await getAdminUserId()
  if (!adminUserId) {
    logger.error('No admin user found for playlist creation')
    return null
  }
  
  const playlistName = config.seriesCollectionName || 'Top Picks - Series'
  logger.info({ name: playlistName, count: seriesList.length }, 'Creating series playlist')
  
  // Get item IDs from the Top Picks library (not original items)
  let itemIds = await getTopPicksLibrarySeriesIds(seriesList, topPicksLibrary)

  if (itemIds.length === 0) {
    logger.info('No items in Top Picks library, trying original Emby items...')
    itemIds = await getOriginalSeriesIds(seriesList)
  }

  if (itemIds.length === 0) {
    logger.warn('No series items found anywhere, skipping playlist')
    return null
  }

  try {
    const result = await provider.createOrUpdatePlaylist(apiKey, adminUserId, playlistName, itemIds)

    logger.info({
      playlistId: result.playlistId,
      itemCount: itemIds.length
    }, 'Series playlist created/updated')

    return {
      created: true,
      playlistId: result.playlistId,
      itemCount: itemIds.length,
    }
  } catch (err) {
    logger.error({ err, name: playlistName }, 'Failed to create series playlist')
    return null
  }
}

/**
 * Write all Top Picks collections and playlists based on config
 * Must be called AFTER library refresh completes so items exist
 */
export async function writeTopPicksCollectionsAndPlaylists(
  movies: PopularMovie[],
  seriesList: PopularSeries[],
  moviesLibrary: LibraryInfo | null,
  seriesLibrary: LibraryInfo | null
): Promise<{
  moviesCollection: CollectionWriteResult | null
  seriesCollection: CollectionWriteResult | null
  moviesPlaylist: PlaylistWriteResult | null
  seriesPlaylist: PlaylistWriteResult | null
}> {
  // Run movies and series in parallel, but collections and playlists sequentially
  // (to avoid duplicate API calls for the same library)
  const [moviesCollection, seriesCollection] = await Promise.all([
    writeTopPicksMoviesCollection(movies, moviesLibrary),
    writeTopPicksSeriesCollection(seriesList, seriesLibrary),
  ])
  
  const [moviesPlaylist, seriesPlaylist] = await Promise.all([
    writeTopPicksMoviesPlaylist(movies, moviesLibrary),
    writeTopPicksSeriesPlaylist(seriesList, seriesLibrary),
  ])
  
  return {
    moviesCollection,
    seriesCollection,
    moviesPlaylist,
    seriesPlaylist,
  }
}
