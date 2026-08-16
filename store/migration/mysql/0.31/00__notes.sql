-- note_folder
CREATE TABLE `note_folder` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `parent_id` INT DEFAULT NULL,
  `name` TEXT NOT NULL,
  `shared` BOOLEAN NOT NULL DEFAULT FALSE,
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_note_folder_creator_id` ON `note_folder`(`creator_id`);
CREATE INDEX `idx_note_folder_parent_id` ON `note_folder`(`parent_id`);

-- note
CREATE TABLE `note` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `folder_id` INT DEFAULT NULL,
  `title` VARCHAR(512) NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_note_folder_id` ON `note`(`folder_id`);
CREATE INDEX `idx_note_creator_id` ON `note`(`creator_id`);
CREATE INDEX `idx_note_title` ON `note`(`title`);

-- note_link
CREATE TABLE `note_link` (
  `note_id` INT NOT NULL,
  `target_type` VARCHAR(16) NOT NULL,
  `target_id` INT DEFAULT NULL,
  `target_title` VARCHAR(512) NOT NULL,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`note_id`, `target_type`, `target_id`, `target_title`)
);

CREATE INDEX `idx_note_link_target` ON `note_link`(`target_type`, `target_id`);
CREATE INDEX `idx_note_link_note_id` ON `note_link`(`note_id`);

-- note_tag
CREATE TABLE `note_tag` (
  `note_id` INT NOT NULL,
  `tag` VARCHAR(256) NOT NULL,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`note_id`, `tag`)
);

CREATE INDEX `idx_note_tag_tag` ON `note_tag`(`tag`);
