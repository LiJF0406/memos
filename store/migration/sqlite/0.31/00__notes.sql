-- note_folder
CREATE TABLE note_folder (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  name TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_note_folder_creator_id ON note_folder(creator_id);
CREATE INDEX idx_note_folder_parent_id ON note_folder(parent_id);

-- note
CREATE TABLE note (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  folder_id INTEGER DEFAULT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  row_status TEXT NOT NULL DEFAULT 'NORMAL',
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_note_folder_id ON note(folder_id);
CREATE INDEX idx_note_creator_id ON note(creator_id);
CREATE INDEX idx_note_title ON note(title);

-- note_link
CREATE TABLE note_link (
  note_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER DEFAULT NULL,
  target_title TEXT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(note_id, target_type, target_id, target_title)
);

CREATE INDEX idx_note_link_target ON note_link(target_type, target_id);
CREATE INDEX idx_note_link_note_id ON note_link(note_id);

-- note_tag
CREATE TABLE note_tag (
  note_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(note_id, tag)
);

CREATE INDEX idx_note_tag_tag ON note_tag(tag);
