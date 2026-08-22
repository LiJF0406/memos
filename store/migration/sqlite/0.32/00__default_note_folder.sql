-- Add a system default folder ("My Notes") for every user.
ALTER TABLE note_folder ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

-- Self-heal: if a legacy folder already uses the reserved uid, mark it as the
-- default so it is not flagged as duplicated and stays protected.
UPDATE note_folder SET is_default = 1 WHERE uid = 'inbox-' || creator_id AND is_default = 0;

-- Create the default folder for each user (idempotent, keyed on the reserved
-- uid rather than the is_default flag).
INSERT INTO note_folder (uid, creator_id, parent_id, name, shared, is_default)
SELECT 'inbox-' || id, id, NULL, 'My Notes', 0, 1
FROM user
WHERE NOT EXISTS (
  SELECT 1 FROM note_folder WHERE uid = 'inbox-' || user.id
);

-- Move notes without a folder into their owner's default folder.
UPDATE note
SET folder_id = (
  SELECT id FROM note_folder WHERE creator_id = note.creator_id AND is_default = 1
)
WHERE folder_id IS NULL;

-- Attach legacy root-level folders to the owner's default folder.
UPDATE note_folder AS nf
SET parent_id = (
  SELECT dnf.id FROM note_folder AS dnf WHERE dnf.creator_id = nf.creator_id AND dnf.is_default = 1
)
WHERE nf.parent_id IS NULL AND nf.is_default = 0;