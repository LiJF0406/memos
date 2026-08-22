package test

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// TestMigrationFromV031ToV032 verifies that the 0.32 migration creates a system
// default folder for every user, moves unfiled notes into it, and attaches
// legacy root-level folders under it. It is sqlite-only and does not require
// containers.
func TestMigrationFromV031ToV032(t *testing.T) {
	if getDriverFromEnv() != "sqlite" {
		t.Skip("skipping focused migration fixture for non-sqlite driver")
	}

	ctx := context.Background()
	dsn := fmt.Sprintf("%s/memos_v031_v032_migration.db", t.TempDir())

	db, err := sql.Open("sqlite", dsn)
	require.NoError(t, err)

	_, err = db.ExecContext(ctx, `
		CREATE TABLE system_setting (
			name TEXT NOT NULL,
			value TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			UNIQUE(name)
		);
		CREATE TABLE user (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
			updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
			row_status TEXT NOT NULL DEFAULT 'NORMAL',
			username TEXT NOT NULL UNIQUE,
			role TEXT NOT NULL DEFAULT 'USER',
			email TEXT NOT NULL DEFAULT '',
			nickname TEXT NOT NULL DEFAULT '',
			password_hash TEXT NOT NULL,
			avatar_url TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT ''
		);
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
		CREATE TABLE memo (
			id INTEGER PRIMARY KEY AUTOINCREMENT
		);
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
	`)
	require.NoError(t, err)

	basicSettingBytes, err := protojson.Marshal(&storepb.InstanceBasicSetting{SchemaVersion: "0.31.1"})
	require.NoError(t, err)

	_, err = db.ExecContext(ctx, "INSERT INTO system_setting (name, value) VALUES ('BASIC', ?)", string(basicSettingBytes))
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, "INSERT INTO user (id, username, password_hash) VALUES (1, 'alice', 'x'), (2, 'bob', 'x')")
	require.NoError(t, err)
	// Two root-level folders: one per user, both without a parent.
	_, err = db.ExecContext(ctx, "INSERT INTO note_folder (id, uid, creator_id, name) VALUES (1, 'work-folder', 1, 'Work'), (2, 'travel-folder', 2, 'Travel')")
	require.NoError(t, err)
	// Alice has an unfiled note and a note inside Work; Bob has an unfiled note.
	_, err = db.ExecContext(ctx, "INSERT INTO note (id, uid, creator_id, folder_id, title) VALUES (1, 'note-alice-unfiled', 1, NULL, 'A1'), (2, 'note-alice-work', 1, 1, 'A2'), (3, 'note-bob-unfiled', 2, NULL, 'B1')")
	require.NoError(t, err)
	require.NoError(t, db.Close())

	ts := NewTestingStoreWithDSN(ctx, t, "sqlite", dsn)
	require.NoError(t, ts.Migrate(ctx))
	defer ts.Close()

	currentVersion, err := ts.GetCurrentSchemaVersion()
	require.NoError(t, err)
	require.Equal(t, "0.32.1", currentVersion)

	// Every user gets exactly one system default folder.
	folders, err := ts.ListNoteFolders(ctx, &store.FindNoteFolder{})
	require.NoError(t, err)
	require.Len(t, folders, 4)
	defaultByUser := map[int32]*store.NoteFolder{}
	for _, folder := range folders {
		if folder.IsDefault {
			defaultByUser[folder.CreatorID] = folder
		}
	}
	require.Len(t, defaultByUser, 2)
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

	// Legacy root-level folders are attached under the owner's default folder.
	foldersByUID := map[string]*store.NoteFolder{}
	for _, folder := range folders {
		foldersByUID[folder.UID] = folder
	}
	aliceID := int32(1)
	bobID := int32(2)
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
}
