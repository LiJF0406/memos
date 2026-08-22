-- system_setting
CREATE TABLE `system_setting` (
  `name` VARCHAR(256) NOT NULL PRIMARY KEY,
  `value` LONGTEXT NOT NULL,
  `description` TEXT NOT NULL
);

-- user
CREATE TABLE `user` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `username` VARCHAR(256) NOT NULL UNIQUE,
  `role` VARCHAR(256) NOT NULL DEFAULT 'USER',
  `email` VARCHAR(256) NOT NULL DEFAULT '',
  `nickname` VARCHAR(256) NOT NULL DEFAULT '',
  `password_hash` VARCHAR(256) NOT NULL,
  `avatar_url` LONGTEXT NOT NULL,
  `description` VARCHAR(256) NOT NULL DEFAULT ''
);

-- user_setting
CREATE TABLE `user_setting` (
  `user_id` INT NOT NULL,
  `key` VARCHAR(256) NOT NULL,
  `value` LONGTEXT NOT NULL,
  UNIQUE(`user_id`,`key`)
);

-- memo
CREATE TABLE `memo` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL',
  `content` TEXT NOT NULL,
  `visibility` VARCHAR(256) NOT NULL DEFAULT 'PRIVATE',
  `pinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `payload` JSON NOT NULL
);

-- memo_relation
CREATE TABLE `memo_relation` (
  `memo_id` INT NOT NULL,
  `related_memo_id` INT NOT NULL,
  `type` VARCHAR(256) NOT NULL,
  UNIQUE(`memo_id`,`related_memo_id`,`type`)
);

-- attachment
CREATE TABLE `attachment` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `filename` TEXT NOT NULL,
  `blob` MEDIUMBLOB,
  `type` VARCHAR(256) NOT NULL DEFAULT '',
  `size` INT NOT NULL DEFAULT '0',
  `memo_id` INT DEFAULT NULL,
  `storage_type` VARCHAR(256) NOT NULL DEFAULT '',
  `reference` TEXT NOT NULL DEFAULT (''),
  `payload` TEXT NOT NULL
);

-- idp
CREATE TABLE `idp` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `type` TEXT NOT NULL,
  `identifier_filter` VARCHAR(256) NOT NULL DEFAULT '',
  `config` TEXT NOT NULL
);

-- inbox
CREATE TABLE `inbox` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sender_id` INT NOT NULL,
  `receiver_id` INT NOT NULL,
  `status` TEXT NOT NULL,
  `message` TEXT NOT NULL
);

-- reaction
CREATE TABLE `reaction` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `creator_id` INT NOT NULL,
  `content_id` VARCHAR(256) NOT NULL,
  `reaction_type` VARCHAR(256) NOT NULL,
  UNIQUE(`creator_id`,`content_id`,`reaction_type`)  
);

-- memo_share
CREATE TABLE `memo_share` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid`        VARCHAR(255) NOT NULL UNIQUE,
  `memo_id`    INT          NOT NULL,
  `creator_id` INT          NOT NULL,
  `created_ts` BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `expires_ts` BIGINT       DEFAULT NULL,
  FOREIGN KEY (`memo_id`) REFERENCES `memo`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_memo_share_memo_id` ON `memo_share`(`memo_id`);

-- user_identity
CREATE TABLE `user_identity` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT          NOT NULL,
  `provider`   VARCHAR(256) NOT NULL,
  `extern_uid` VARCHAR(256) NOT NULL,
  `created_ts` BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT       NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  UNIQUE (`provider`, `extern_uid`),
  UNIQUE (`user_id`, `provider`)
);

CREATE INDEX `idx_user_identity_user_id` ON `user_identity`(`user_id`);

-- note_folder
CREATE TABLE `note_folder` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `parent_id` INT DEFAULT NULL,
  `name` TEXT NOT NULL,
  `shared` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
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
