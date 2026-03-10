/**
 * MDBList Browse API Schemas
 *
 * User-facing endpoints for browsing and subscribing to curated MDBList playlists.
 * All endpoints require user authentication (not admin).
 */

export const browseMdblistSchemas = {
  // Featured list entry
  FeaturedList: {
    type: 'object',
    description: 'A featured/curated MDBList list',
    properties: {
      id: { type: 'integer', description: 'MDBList list ID' },
      name: { type: 'string', description: 'List name' },
      mediatype: { type: 'string', enum: ['movie', 'show'], description: 'Media type' },
      description: { type: 'string', nullable: true, description: 'List description' },
      items: { type: 'integer', description: 'Number of items in list' },
      likes: { type: 'integer', description: 'Number of likes' },
      isSubscribed: { type: 'boolean', description: 'Whether current user is subscribed' },
    },
  },

  // Subscription entry
  Subscription: {
    type: 'object',
    description: 'A user subscription to an MDBList list',
    properties: {
      id: { type: 'integer', description: 'Subscription ID' },
      mdblistId: { type: 'integer', description: 'MDBList list ID' },
      listName: { type: 'string', description: 'List name' },
      mediatype: { type: 'string', description: 'Media type' },
      enabled: { type: 'boolean', description: 'Whether sync is enabled' },
      createdAt: { type: 'string', description: 'When subscription was created' },
    },
  },

  // Library match info
  LibraryMatch: {
    type: 'object',
    description: 'Library match statistics for a list',
    properties: {
      total: { type: 'integer', description: 'Total items in list' },
      matched: { type: 'integer', description: 'Items found in local library' },
      matchPercentage: { type: 'number', description: 'Percentage of items available' },
    },
  },
} as const

// Route-specific schemas
export const getFeaturedListsSchema = {
  tags: ['mdblist-browse'],
  summary: 'Get featured playlists',
  description: 'Get curated featured MDBList playlists. Available to all authenticated users.',
}

export const getTopListsSchema = {
  tags: ['mdblist-browse'],
  summary: 'Get top playlists',
  description: 'Get popular public lists from MDBList. Available to all authenticated users.',
  querystring: {
    type: 'object',
    properties: {
      mediatype: { type: 'string', enum: ['movie', 'show'], description: 'Filter by media type' },
      limit: { type: 'string', description: 'Maximum lists to return', default: '20' },
    },
  },
}

export const searchListsSchema = {
  tags: ['mdblist-browse'],
  summary: 'Search playlists',
  description: 'Search public MDBList lists by name. Available to all authenticated users.',
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', description: 'Search query', minLength: 2 },
      mediatype: { type: 'string', enum: ['movie', 'show'], description: 'Filter by media type' },
    },
  },
}

export const getListItemsSchema = {
  tags: ['mdblist-browse'],
  summary: 'Get playlist items',
  description: 'Get items from a playlist with library match information.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'MDBList list ID' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'string', description: 'Maximum items to return', default: '100' },
    },
  },
}

export const subscribeSchema = {
  tags: ['mdblist-browse'],
  summary: 'Subscribe to playlist',
  description: 'Subscribe the current user to an MDBList playlist.',
  body: {
    type: 'object',
    required: ['mdblistId', 'listName'],
    properties: {
      mdblistId: { type: 'integer', description: 'MDBList list ID' },
      listName: { type: 'string', description: 'List name' },
      mediatype: { type: 'string', enum: ['movie', 'show'], default: 'movie' },
    },
  },
}

export const unsubscribeSchema = {
  tags: ['mdblist-browse'],
  summary: 'Unsubscribe from playlist',
  description: 'Unsubscribe the current user from an MDBList playlist.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'MDBList list ID' },
    },
  },
}

export const getSubscriptionsSchema = {
  tags: ['mdblist-browse'],
  summary: 'Get subscriptions',
  description: 'Get all playlist subscriptions for the current user.',
}

export const getListInfoSchema = {
  tags: ['mdblist-browse'],
  summary: 'Get playlist info',
  description: 'Get detailed information about a specific MDBList playlist.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'MDBList list ID' },
    },
  },
}
