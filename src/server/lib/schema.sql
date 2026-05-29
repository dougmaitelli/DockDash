CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  ports TEXT NOT NULL DEFAULT '[]',
  check_port INTEGER,
  protocol TEXT DEFAULT 'http',
  source TEXT NOT NULL DEFAULT 'docker',
  status TEXT NOT NULL DEFAULT 'unknown',
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_links (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  label TEXT DEFAULT '',
  type TEXT DEFAULT 'communication',
  description TEXT DEFAULT '',
  target_port INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (source_id != target_id)
);

CREATE TABLE IF NOT EXISTS service_positions (
  service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  parent_id TEXT REFERENCES services(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_links_source ON service_links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON service_links(target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_unique ON service_links(source_id, target_id);
