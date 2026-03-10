import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardActionArea,
  Skeleton,
  Alert,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  alpha,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import MovieIcon from '@mui/icons-material/Movie'
import TvIcon from '@mui/icons-material/Tv'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import StarIcon from '@mui/icons-material/Star'

// Types
interface MDBListInfo {
  id: number
  name: string
  mediatype: 'movie' | 'show'
  description: string | null
  items: number
  likes: number
  isSubscribed: boolean
}

interface Subscription {
  id: number
  mdblistId: number
  listName: string
  mediatype: string
  enabled: boolean
  createdAt: string
}

type MediaTypeFilter = 'all' | 'movie' | 'show'

export function BrowsePlaylistsTab() {
  const [featuredLists, setFeaturedLists] = useState<MDBListInfo[]>([])
  const [searchResults, setSearchResults] = useState<MDBListInfo[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [subscribingId, setSubscribingId] = useState<number | null>(null)
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all')
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Check if MDBList is configured
        const statusResponse = await fetch('/api/browse/playlists/status', {
          credentials: 'include',
        })
        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          setIsConfigured(statusData.configured)
          if (!statusData.configured) {
            setLoading(false)
            return
          }
        }

        // Fetch featured lists and subscriptions in parallel
        const [featuredResponse, subscriptionsResponse] = await Promise.all([
          fetch('/api/browse/playlists/featured', { credentials: 'include' }),
          fetch('/api/browse/playlists/subscriptions', { credentials: 'include' }),
        ])

        if (featuredResponse.ok) {
          const data = await featuredResponse.json()
          setFeaturedLists(data.lists || [])
        }

        if (subscriptionsResponse.ok) {
          const data = await subscriptionsResponse.json()
          setSubscriptions(data.subscriptions || [])
        }
      } catch (err) {
        setError('Failed to load playlists')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Search handler with debounce
  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([])
      return
    }

    setSearchLoading(true)
    try {
      const response = await fetch(
        `/api/browse/playlists/search?q=${encodeURIComponent(query)}`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.lists || [])
      }
    } catch {
      // Silent fail for search
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, handleSearch])

  // Subscribe/unsubscribe handler
  const handleToggleSubscription = async (list: MDBListInfo) => {
    setSubscribingId(list.id)
    try {
      if (list.isSubscribed) {
        // Unsubscribe
        const response = await fetch(`/api/browse/playlists/subscribe/${list.id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (response.ok) {
          // Update local state
          setFeaturedLists((prev) =>
            prev.map((l) => (l.id === list.id ? { ...l, isSubscribed: false } : l))
          )
          setSearchResults((prev) =>
            prev.map((l) => (l.id === list.id ? { ...l, isSubscribed: false } : l))
          )
          setSubscriptions((prev) => prev.filter((s) => s.mdblistId !== list.id))
        }
      } else {
        // Subscribe
        const response = await fetch('/api/browse/playlists/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            mdblistId: list.id,
            listName: list.name,
            mediatype: list.mediatype,
          }),
        })
        if (response.ok) {
          const data = await response.json()
          // Update local state
          setFeaturedLists((prev) =>
            prev.map((l) => (l.id === list.id ? { ...l, isSubscribed: true } : l))
          )
          setSearchResults((prev) =>
            prev.map((l) => (l.id === list.id ? { ...l, isSubscribed: true } : l))
          )
          setSubscriptions((prev) => [...prev, data.subscription])
        }
      }
    } catch {
      // Silent fail
    } finally {
      setSubscribingId(null)
    }
  }

  // Filter lists by media type
  const filterByMediaType = (lists: MDBListInfo[]) => {
    if (mediaTypeFilter === 'all') return lists
    return lists.filter((l) => l.mediatype === mediaTypeFilter)
  }

  // Not configured state
  if (isConfigured === false) {
    return (
      <Box py={4}>
        <Alert severity="info">
          MDBList is not configured. An admin needs to set up MDBList integration in Settings to enable
          pre-made playlists.
        </Alert>
      </Box>
    )
  }

  // Loading state
  if (loading) {
    return (
      <Box py={2}>
        <Box mb={4}>
          <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 3 }} />
        </Box>
        <Typography variant="h6" fontWeight={600} mb={2}>
          Featured Playlists
        </Typography>
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={180} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box py={4}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  const filteredFeatured = filterByMediaType(featuredLists)
  const filteredSearchResults = filterByMediaType(searchResults)

  return (
    <Box py={2}>
      {/* Search Bar */}
      <Box mb={3}>
        <TextField
          fullWidth
          placeholder="Search for playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: searchLoading ? (
              <InputAdornment position="end">
                <CircularProgress size={20} />
              </InputAdornment>
            ) : null,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              backgroundColor: 'background.paper',
            },
          }}
        />
      </Box>

      {/* Media Type Filter */}
      <Box mb={3} display="flex" alignItems="center" gap={2}>
        <Typography variant="body2" color="text.secondary">
          Filter:
        </Typography>
        <ToggleButtonGroup
          value={mediaTypeFilter}
          exclusive
          onChange={(_, value) => value && setMediaTypeFilter(value)}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="movie">
            <MovieIcon sx={{ mr: 0.5, fontSize: 18 }} />
            Movies
          </ToggleButton>
          <ToggleButton value="show">
            <TvIcon sx={{ mr: 0.5, fontSize: 18 }} />
            TV Shows
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Search Results */}
      {searchQuery.length >= 2 && (
        <Box mb={4}>
          <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
            <SearchIcon fontSize="small" />
            Search Results
          </Typography>
          {filteredSearchResults.length === 0 ? (
            <Typography color="text.secondary">
              {searchLoading ? 'Searching...' : 'No playlists found'}
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {filteredSearchResults.map((list) => (
                <Grid item xs={12} sm={6} md={4} key={list.id}>
                  <PlaylistCard
                    list={list}
                    isSubscribing={subscribingId === list.id}
                    onToggleSubscription={() => handleToggleSubscription(list)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* Subscriptions Section */}
      {subscriptions.length > 0 && (
        <Box mb={4}>
          <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
            <PlaylistAddCheckIcon fontSize="small" />
            My Subscriptions ({subscriptions.length})
          </Typography>
          <Grid container spacing={2}>
            {subscriptions.map((sub) => {
              const listData: MDBListInfo = {
                id: sub.mdblistId,
                name: sub.listName,
                mediatype: sub.mediatype as 'movie' | 'show',
                description: null,
                items: 0,
                likes: 0,
                isSubscribed: true,
              }
              if (mediaTypeFilter !== 'all' && sub.mediatype !== mediaTypeFilter) return null
              return (
                <Grid item xs={12} sm={6} md={4} key={sub.id}>
                  <PlaylistCard
                    list={listData}
                    isSubscribing={subscribingId === sub.mdblistId}
                    onToggleSubscription={() => handleToggleSubscription(listData)}
                    compact
                  />
                </Grid>
              )
            })}
          </Grid>
        </Box>
      )}

      {/* Featured Playlists */}
      <Box mb={4}>
        <Typography variant="h6" fontWeight={600} mb={2} display="flex" alignItems="center" gap={1}>
          <StarIcon fontSize="small" sx={{ color: 'warning.main' }} />
          Featured Playlists
        </Typography>
        {filteredFeatured.length === 0 ? (
          <Typography color="text.secondary">No featured playlists available</Typography>
        ) : (
          <Grid container spacing={2}>
            {filteredFeatured.map((list) => (
              <Grid item xs={12} sm={6} md={4} key={list.id}>
                <PlaylistCard
                  list={list}
                  isSubscribing={subscribingId === list.id}
                  onToggleSubscription={() => handleToggleSubscription(list)}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  )
}

// Playlist Card Component
interface PlaylistCardProps {
  list: MDBListInfo
  isSubscribing: boolean
  onToggleSubscription: () => void
  compact?: boolean
}

function PlaylistCard({ list, isSubscribing, onToggleSubscription, compact = false }: PlaylistCardProps) {
  const [showMatch, setShowMatch] = useState(false)
  const [matchInfo, setMatchInfo] = useState<{ total: number; matched: number; matchPercentage: number } | null>(null)
  const [loadingMatch, setLoadingMatch] = useState(false)

  // Fetch library match on hover
  const handleMouseEnter = async () => {
    if (matchInfo || loadingMatch || compact) return
    setShowMatch(true)
    setLoadingMatch(true)
    try {
      const response = await fetch(`/api/browse/playlists/${list.id}/items?limit=500`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setMatchInfo(data.libraryMatch)
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingMatch(false)
    }
  }

  const handleSubscribeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleSubscription()
  }

  return (
    <Card
      onMouseEnter={handleMouseEnter}
      sx={{
        backgroundColor: 'background.paper',
        borderRadius: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        border: list.isSubscribed ? 2 : 1,
        borderColor: list.isSubscribed ? 'primary.main' : 'divider',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardActionArea
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          p: 2,
        }}
      >
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Box flex={1} minWidth={0}>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {list.name}
            </Typography>
          </Box>
          <Chip
            icon={list.mediatype === 'show' ? <TvIcon /> : <MovieIcon />}
            label={list.mediatype === 'show' ? 'TV' : 'Movie'}
            size="small"
            sx={{
              ml: 1,
              height: 22,
              fontSize: '0.7rem',
              '& .MuiChip-icon': { fontSize: 14 },
            }}
          />
        </Box>

        {/* Description */}
        {list.description && !compact && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              mb: 1,
              minHeight: 40,
              lineHeight: 1.4,
            }}
          >
            {list.description}
          </Typography>
        )}

        {/* Stats */}
        {!compact && (
          <Box display="flex" gap={2} mb={1}>
            {list.items > 0 && (
              <Box display="flex" alignItems="center" gap={0.5}>
                <TrendingUpIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {list.items} items
                </Typography>
              </Box>
            )}
            {list.likes > 0 && (
              <Box display="flex" alignItems="center" gap={0.5}>
                <ThumbUpIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {list.likes}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Library Match Progress */}
        {showMatch && !compact && (
          <Box mt="auto">
            {loadingMatch ? (
              <LinearProgress sx={{ borderRadius: 1 }} />
            ) : matchInfo ? (
              <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                  <Typography variant="caption" color="text.secondary">
                    In your library
                  </Typography>
                  <Typography variant="caption" fontWeight={600} color="primary.main">
                    {matchInfo.matchPercentage}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={matchInfo.matchPercentage}
                  sx={{
                    borderRadius: 1,
                    height: 6,
                    backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  }}
                />
              </Box>
            ) : null}
          </Box>
        )}
      </CardActionArea>

      {/* Subscribe Button */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          bgcolor: list.isSubscribed ? alpha('#4caf50', 0.08) : 'action.hover',
        }}
      >
        <Tooltip title={list.isSubscribed ? 'Unsubscribe' : 'Subscribe'}>
          <IconButton
            size="small"
            onClick={handleSubscribeClick}
            disabled={isSubscribing}
            color={list.isSubscribed ? 'success' : 'primary'}
            sx={{
              bgcolor: list.isSubscribed ? alpha('#4caf50', 0.15) : alpha('#2196f3', 0.1),
              '&:hover': {
                bgcolor: list.isSubscribed ? alpha('#4caf50', 0.25) : alpha('#2196f3', 0.2),
              },
            }}
          >
            {isSubscribing ? (
              <CircularProgress size={20} color="inherit" />
            ) : list.isSubscribed ? (
              <PlaylistAddCheckIcon />
            ) : (
              <PlaylistAddIcon />
            )}
          </IconButton>
        </Tooltip>
      </Box>
    </Card>
  )
}
