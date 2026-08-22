package test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// TestMigrationFromV031ToV032 verifies that the 0.32 migration creates a system
// default folder for every user, moves unfiled notes into it, attaches legacy
// root-level folders under it, and self-heals a legacy folder that already used
// the reserved uid. It runs for every driver: sqlite uses a temp-file database,
// mysql/postgres use TestContainers.
func TestMigrationFromV031ToV032(t *testing.T) {
	ctx := context.Background()
	driver := getDriverFromEnv()

	dsn := prepareV031MigrationDB(t, driver)

	ts := NewTestingStoreWithDSN(ctx, t, driver, dsn)
	require.NoError(t, ts.Migrate(ctx))
	defer ts.Close()

	currentVersion, err := ts.GetCurrentSchemaVersion()
	require.NoError(t, err)
	require.Equal(t, "0.32.1", currentVersion)

	// Every user gets exactly one system default folder.
	folders, err := ts.ListNoteFolders(ctx, &store.FindNoteFolder{})
	require.NoError(t, err)
	require.Len(t, folders, 5)
	defaultByUser := map[int32]*store.NoteFolder{}
	for _, folder := range folders {
		if folder.IsDefault {
			defaultByUser[folder.CreatorID] = folder
		}
	}
	require.Len(t, defaultByUser, 3)
	aliceDefault := defaultByUser[1]
	require.NotNil(t, aliceDefault)
	require.Equal(t, "inbox-1", aliceDefault.UID)
	require.Nil(t, aliceDefault.ParentID)
	require.Equal(t, "My Notes", aliceDefault.Name)
	require.False(t, aliceDefault.Shared)
	bobDefault := defaultByUser[2]
	require.NotNil(t, bobDefault)
	require.Equal(t, "inbox-2", bobDefault.UID)
	require.Nil(t, bobDefault.ParentID)
	// Charlie already had a legacy folder with the reserved uid (inbox-3) in the
	// 0.31 schema; the migration self-heals it into the default rather than
	// creating a duplicate.
	charlieDefault := defaultByUser[3]
	require.NotNil(t, charlieDefault)
	require.Equal(t, "inbox-3", charlieDefault.UID)
	require.Nil(t, charlieDefault.ParentID)

	// Legacy root-level folders are attached under the owner's default folder.
	foldersByUID := map[string]*store.NoteFolder{}
	for _, folder := range folders {
		foldersByUID[folder.UID] = folder
	}
	aliceID := int32(1)
	bobID := int32(2)
	charlieID := int32(3)
	normal := store.Normal
	require.NotNil(t, foldersByUID["work-folder"].ParentID)
	require.Equal(t, aliceDefault.ID, *foldersByUID["work-folder"].ParentID)
	require.NotNil(t, foldersByUID["travel-folder"].ParentID)
	require.Equal(t, bobDefault.ID, *foldersByUID["travel-folder"].ParentID)

	// Unfiled notes moved into their creator's default folder.
	aliceNotes, err := ts.ListNotes(ctx, &store.FindNote{RowStatus: &normal, CreatorID: &aliceID, FolderID: &aliceDefault.ID, FolderIDSet: true})
	require.NoError(t, err)
	require.Len(t, aliceNotes, 1)
	require.Equal(t, "A1", aliceNotes[0].Title)
	bobNotes, err := ts.ListNotes(ctx, &store.FindNote{RowStatus: &normal, CreatorID: &bobID, FolderID: &bobDefault.ID, FolderIDSet: true})
	require.NoError(t, err)
	require.Len(t, bobNotes, 1)
	require.Equal(t, "B1", bobNotes[0].Title)
	charlieNotes, err := ts.ListNotes(ctx, &store.FindNote{RowStatus: &normal, CreatorID: &charlieID, FolderID: &charlieDefault.ID, FolderIDSet: true})
	require.NoError(t, err)
	require.Len(t, charlieNotes, 1)
	require.Equal(t, "C1", charlieNotes[0].Title)
}

// prepareV031MigrationDB creates a minimal 0.31 schema with legacy data (three
// users, two legacy root-level folders plus one root-level folder already using
// the reserved uid, and four notes including a filed one) and returns a DSN
// pointing at it. The schema matches what the 0.32 migration expects and what
// the store queries used in the assertions above need.
func prepareV031MigrationDB(t *testing.T, driver string) string {
	t.Helper()

	var dsn string
	switch driver {
	case "sqlite":
		dsn = fmt.Sprintf("%s/memos_v031_v032_migration.db", t.TempDir())
	case "mysql":
		dsn = GetMySQLDSN(t)
	case "postgres":
		dsn = GetPostgresDSN(t)
	default:
		t.Fatalf("unsupported driver: %s", driver)
	}

	db := openMigrationSQLDB(t, driver, dsn)
	defer db.Close()

	for _, stmt := range v031SchemaStatements(driver) {
		execMigrationSQL(t, db, stmt)
	}

	basicSettingBytes, err := protojson.Marshal(&storepb.InstanceBasicSetting{SchemaVersion: "0.31.1"})
	require.NoError(t, err)
	execMigrationSQL(t, db, schemaVersionInsertSQL(string(basicSettingBytes)))

	for _, stmt := range v031SeedStatements(driver) {
		execMigrationSQL(t, db, stmt)
	}
	if driver == "postgres" {
		// 用显式 id 播种 SERIAL 表后其序列不会前移；需同步到已用 id 之后，
		// 否则 0.32 迁移的 INSERT（省略 id）会复用已有主键而失败。
		execMigrationSQL(t, db, "SELECT setval(pg_get_serial_sequence('note_folder', 'id'), (SELECT COALESCE(MAX(id), 1) FROM note_folder))")
	}
	return dsn
}

// v031SchemaStatements returns the minimal 0.31 schema needed by the 0.32
// migration and by the store queries used in the test assertions.
func v031SchemaStatements(driver string) []string {
	switch driver {
	case "mysql":
		return []string{
			"CREATE TABLE `system_setting` (`name` VARCHAR(256) NOT NULL PRIMARY KEY, `value` LONGTEXT NOT NULL, `description` TEXT NOT NULL)",
			"CREATE TABLE `user` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL', `username` VARCHAR(256) NOT NULL UNIQUE, `role` VARCHAR(256) NOT NULL DEFAULT 'USER', `email` VARCHAR(256) NOT NULL DEFAULT '', `nickname` VARCHAR(256) NOT NULL DEFAULT '', `password_hash` VARCHAR(256) NOT NULL, `avatar_url` LONGTEXT NOT NULL, `description` VARCHAR(256) NOT NULL DEFAULT '')",
			"CREATE TABLE `memo` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY)",
			"CREATE TABLE `note_folder` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `uid` VARCHAR(256) NOT NULL UNIQUE, `creator_id` INT NOT NULL, `parent_id` INT DEFAULT NULL, `name` TEXT NOT NULL, `shared` BOOLEAN NOT NULL DEFAULT FALSE, `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL', `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
			"CREATE TABLE `note` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `uid` VARCHAR(256) NOT NULL UNIQUE, `creator_id` INT NOT NULL, `folder_id` INT DEFAULT NULL, `title` VARCHAR(512) NOT NULL, `content` MEDIUMTEXT NOT NULL, `row_status` VARCHAR(256) NOT NULL DEFAULT 'NORMAL', `created_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_ts` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
		}
	case "postgres":
		return []string{
			"CREATE TABLE system_setting (name TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL, description TEXT NOT NULL)",
			`CREATE TABLE "user" (id SERIAL PRIMARY KEY, created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()), updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()), row_status TEXT NOT NULL DEFAULT 'NORMAL', username TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'USER', email TEXT NOT NULL DEFAULT '', nickname TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, avatar_url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '')`,
			"CREATE TABLE memo (id SERIAL PRIMARY KEY)",
			"CREATE TABLE note_folder (id SERIAL PRIMARY KEY, uid TEXT NOT NULL UNIQUE, creator_id INTEGER NOT NULL, parent_id INTEGER DEFAULT NULL, name TEXT NOT NULL, shared BOOLEAN NOT NULL DEFAULT FALSE, row_status TEXT NOT NULL DEFAULT 'NORMAL', created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()), updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()))",
			"CREATE TABLE note (id SERIAL PRIMARY KEY, uid TEXT NOT NULL UNIQUE, creator_id INTEGER NOT NULL, folder_id INTEGER DEFAULT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', row_status TEXT NOT NULL DEFAULT 'NORMAL', created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()), updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()))",
		}
	default: // sqlite
		return []string{
			"CREATE TABLE system_setting (name TEXT NOT NULL, value TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', UNIQUE(name))",
			"CREATE TABLE user (id INTEGER PRIMARY KEY AUTOINCREMENT, created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')), updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')), row_status TEXT NOT NULL DEFAULT 'NORMAL', username TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'USER', email TEXT NOT NULL DEFAULT '', nickname TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, avatar_url TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '')",
			"CREATE TABLE memo (id INTEGER PRIMARY KEY AUTOINCREMENT)",
			"CREATE TABLE note_folder (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL UNIQUE, creator_id INTEGER NOT NULL, parent_id INTEGER DEFAULT NULL, name TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0, row_status TEXT NOT NULL DEFAULT 'NORMAL', created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')), updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')))",
			"CREATE TABLE note (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL UNIQUE, creator_id INTEGER NOT NULL, folder_id INTEGER DEFAULT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', row_status TEXT NOT NULL DEFAULT 'NORMAL', created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')), updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')))",
		}
	}
}

// schemaVersionInsertSQL returns the INSERT that records the schema version
// the way an installed 0.31 instance would have it.
func schemaVersionInsertSQL(value string) string {
	return "INSERT INTO system_setting (name, value, description) VALUES ('BASIC', '" + value + "', '')"
}

// v031SeedStatements returns the legacy rows that existed before the 0.32
// migration: three users, two legacy root-level folders plus one root-level
// folder that already uses the reserved uid (inbox-3), three unfiled notes and
// one note inside Work.
func v031SeedStatements(driver string) []string {
	switch driver {
	case "mysql":
		return []string{
			"INSERT INTO `user` (id, username, password_hash, avatar_url) VALUES (1, 'alice', 'x', ''), (2, 'bob', 'x', ''), (3, 'charlie', 'x', '')",
			"INSERT INTO `note_folder` (id, uid, creator_id, name) VALUES (1, 'work-folder', 1, 'Work'), (2, 'travel-folder', 2, 'Travel'), (3, 'inbox-3', 3, 'Inbox')",
			"INSERT INTO `note` (id, uid, creator_id, folder_id, title, content) VALUES (1, 'note-alice-unfiled', 1, NULL, 'A1', ''), (2, 'note-alice-work', 1, 1, 'A2', ''), (3, 'note-bob-unfiled', 2, NULL, 'B1', ''), (4, 'note-charlie-unfiled', 3, NULL, 'C1', '')",
		}
	case "postgres":
		return []string{
			`INSERT INTO "user" (id, username, password_hash, avatar_url) VALUES (1, 'alice', 'x', ''), (2, 'bob', 'x', ''), (3, 'charlie', 'x', '')`,
			"INSERT INTO note_folder (id, uid, creator_id, name) VALUES (1, 'work-folder', 1, 'Work'), (2, 'travel-folder', 2, 'Travel'), (3, 'inbox-3', 3, 'Inbox')",
			"INSERT INTO note (id, uid, creator_id, folder_id, title, content) VALUES (1, 'note-alice-unfiled', 1, NULL, 'A1', ''), (2, 'note-alice-work', 1, 1, 'A2', ''), (3, 'note-bob-unfiled', 2, NULL, 'B1', ''), (4, 'note-charlie-unfiled', 3, NULL, 'C1', '')",
		}
	default: // sqlite
		return []string{
			"INSERT INTO user (id, username, password_hash) VALUES (1, 'alice', 'x'), (2, 'bob', 'x'), (3, 'charlie', 'x')",
			"INSERT INTO note_folder (id, uid, creator_id, name) VALUES (1, 'work-folder', 1, 'Work'), (2, 'travel-folder', 2, 'Travel'), (3, 'inbox-3', 3, 'Inbox')",
			"INSERT INTO note (id, uid, creator_id, folder_id, title) VALUES (1, 'note-alice-unfiled', 1, NULL, 'A1'), (2, 'note-alice-work', 1, 1, 'A2'), (3, 'note-bob-unfiled', 2, NULL, 'B1'), (4, 'note-charlie-unfiled', 3, NULL, 'C1')",
		}
	}
}
