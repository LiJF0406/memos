-- Add a system default folder ("My Notes") for every user.
ALTER TABLE `note_folder` ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT FALSE;

-- Self-heal: if a legacy folder already uses the reserved uid, mark it as the
-- default so it is not flagged as duplicated and stays protected.
UPDATE `note_folder` SET `is_default` = TRUE WHERE `uid` = CONCAT('inbox-', `creator_id`) AND `is_default` = FALSE;

-- Create the default folder for each user (idempotent, keyed on the reserved
-- uid rather than the is_default flag).
INSERT INTO `note_folder` (`uid`, `creator_id`, `parent_id`, `name`, `shared`, `is_default`)
SELECT CONCAT('inbox-', `id`), `id`, NULL, 'My Notes', FALSE, TRUE
FROM `user`
WHERE NOT EXISTS (
  SELECT 1 FROM `note_folder` WHERE `uid` = CONCAT('inbox-', `user`.`id`)
);

-- Move notes without a folder into their owner's default folder.
UPDATE `note`
SET `folder_id` = (
  SELECT `id` FROM `note_folder` WHERE `creator_id` = `note`.`creator_id` AND `is_default` = TRUE
)
WHERE `folder_id` IS NULL;

-- Attach legacy root-level folders to the owner's default folder.
UPDATE `note_folder` AS nf
JOIN `note_folder` AS default_folder ON default_folder.`creator_id` = nf.`creator_id` AND default_folder.`is_default` = TRUE
SET nf.`parent_id` = default_folder.`id`
WHERE nf.`parent_id` IS NULL AND nf.`is_default` = FALSE;
