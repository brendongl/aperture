-- User MDBList Subscriptions
-- Stores user subscriptions to MDBList curated playlists
-- Used by the playlist browser feature to let users subscribe to pre-made lists

CREATE TABLE IF NOT EXISTS user_mdblist_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emby_user_id TEXT NOT NULL,
  mdblist_id INTEGER NOT NULL,
  list_name TEXT NOT NULL,
  mediatype TEXT DEFAULT 'movie',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, mdblist_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_user_mdblist_subscriptions_user_id ON user_mdblist_subscriptions(user_id);

-- Index for enabled subscriptions (used by sync script)
CREATE INDEX IF NOT EXISTS idx_user_mdblist_subscriptions_enabled ON user_mdblist_subscriptions(enabled) WHERE enabled = true;

-- Add comments
COMMENT ON TABLE user_mdblist_subscriptions IS 'User subscriptions to MDBList curated playlists';
COMMENT ON COLUMN user_mdblist_subscriptions.user_id IS 'Reference to users table';
COMMENT ON COLUMN user_mdblist_subscriptions.emby_user_id IS 'Emby/Jellyfin user ID for sync script';
COMMENT ON COLUMN user_mdblist_subscriptions.mdblist_id IS 'MDBList list ID';
COMMENT ON COLUMN user_mdblist_subscriptions.list_name IS 'Cached list name for display';
COMMENT ON COLUMN user_mdblist_subscriptions.mediatype IS 'Media type: movie or show';
COMMENT ON COLUMN user_mdblist_subscriptions.enabled IS 'Whether sync is enabled for this subscription';
