package test

import (
	"context"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

// createUserViaAPI creates a user through the public CreateUser API so the
// system default folder is created alongside the user.
func createUserViaAPI(t *testing.T, ts *TestService, ctx context.Context, username string) *store.User {
	t.Helper()
	user, err := ts.Service.CreateUser(ctx, &v1pb.CreateUserRequest{
		User: &v1pb.User{
			Username: username,
			Email:    username + "@example.com",
			Password: "password123",
		},
	})
	require.NoError(t, err)
	require.NotEmpty(t, user.Name)
	storeUser, err := ts.Store.GetUser(ctx, &store.FindUser{Username: &username})
	require.NoError(t, err)
	require.NotNil(t, storeUser)
	return storeUser
}

// TestDefaultNoteFolderCreatedOnUserCreation verifies that every user gets a
// system default folder with a reserved uid and the localized title.
func TestDefaultNoteFolderCreatedOnUserCreation(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	storeUser := createUserViaAPI(t, ts, ctx, "alice")
	aliceCtx := ts.CreateUserContext(ctx, storeUser.ID)

	folders, err := ts.Service.ListNoteFolders(aliceCtx, &v1pb.ListNoteFoldersRequest{})
	require.NoError(t, err)
	require.Len(t, folders.NoteFolders, 1)
	defaultFolder := folders.NoteFolders[0]
	assert.True(t, defaultFolder.IsDefault)
	assert.Equal(t, "My Notes", defaultFolder.Title)
	assert.Equal(t, "note_folders/inbox-"+strconv.Itoa(int(storeUser.ID)), defaultFolder.Name)
	assert.Empty(t, defaultFolder.GetParent())
	assert.False(t, defaultFolder.Shared)
}

// TestDefaultNoteFolderCannotBeModifiedOrDeleted verifies that the system
// default folder is protected from rename, move, share and delete operations.
func TestDefaultNoteFolderCannotBeModifiedOrDeleted(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	storeUser := createUserViaAPI(t, ts, ctx, "alice")
	aliceCtx := ts.CreateUserContext(ctx, storeUser.ID)

	folders, err := ts.Service.ListNoteFolders(aliceCtx, &v1pb.ListNoteFoldersRequest{})
	require.NoError(t, err)
	require.Len(t, folders.NoteFolders, 1)
	defaultFolder := folders.NoteFolders[0]

	subFolder, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Sub", Parent: &defaultFolder.Name},
	})
	require.NoError(t, err)

	// Rename is rejected.
	_, err = ts.Service.UpdateNoteFolder(aliceCtx, &v1pb.UpdateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Name: defaultFolder.Name, Title: "Renamed"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title"}},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// Moving under another folder is rejected.
	_, err = ts.Service.UpdateNoteFolder(aliceCtx, &v1pb.UpdateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Name: defaultFolder.Name, Parent: &subFolder.Name},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"parent"}},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// Marking it shared is rejected.
	_, err = ts.Service.UpdateNoteFolder(aliceCtx, &v1pb.UpdateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Name: defaultFolder.Name, Shared: true},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"shared"}},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// Deleting it is rejected.
	_, err = ts.Service.DeleteNoteFolder(aliceCtx, &v1pb.DeleteNoteFolderRequest{Name: defaultFolder.Name})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// TestReservedFolderUIDPrefixRejected verifies that the "inbox-" uid prefix is
// reserved for the system default folder.
func TestReservedFolderUIDPrefixRejected(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	storeUser := createUserViaAPI(t, ts, ctx, "alice")
	aliceCtx := ts.CreateUserContext(ctx, storeUser.ID)

	_, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolderId: "inbox-custom",
		NoteFolder:   &v1pb.NoteFolder{Title: "Custom"},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// TestNoteWithoutFolderGoesToDefaultFolder verifies that a note created
// without a folder is placed in the creator's system default folder.
func TestNoteWithoutFolderGoesToDefaultFolder(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	storeUser := createUserViaAPI(t, ts, ctx, "alice")
	aliceCtx := ts.CreateUserContext(ctx, storeUser.ID)

	folders, err := ts.Service.ListNoteFolders(aliceCtx, &v1pb.ListNoteFoldersRequest{})
	require.NoError(t, err)
	require.Len(t, folders.NoteFolders, 1)
	defaultFolder := folders.NoteFolders[0]

	note, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "Draft", Content: "hello"},
	})
	require.NoError(t, err)
	assert.Equal(t, defaultFolder.Name, note.GetFolder())

	// Listing notes in the default folder returns the note.
	listed, err := ts.Service.ListNotes(aliceCtx, &v1pb.ListNotesRequest{Folder: defaultFolder.Name})
	require.NoError(t, err)
	require.Len(t, listed.Notes, 1)
	assert.Equal(t, note.Name, listed.Notes[0].Name)
}

// TestSharedFolderListedWithoutDefaultFlag verifies that shared folders are
// returned to other users with is_default=false and the shared flag set.
func TestSharedFolderListedWithoutDefaultFlag(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice := createUserViaAPI(t, ts, ctx, "alice")
	bob := createUserViaAPI(t, ts, ctx, "bob")
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)
	bobCtx := ts.CreateUserContext(ctx, bob.ID)

	sharedFolder, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Shared", Shared: true},
	})
	require.NoError(t, err)
	assert.False(t, sharedFolder.IsDefault)

	bobFolders, err := ts.Service.ListNoteFolders(bobCtx, &v1pb.ListNoteFoldersRequest{})
	require.NoError(t, err)
	require.Len(t, bobFolders.NoteFolders, 2)

	var bobDefault, bobShared *v1pb.NoteFolder
	for _, folder := range bobFolders.NoteFolders {
		if folder.IsDefault {
			bobDefault = folder
		} else if folder.Shared {
			bobShared = folder
		}
	}
	require.NotNil(t, bobDefault)
	require.NotNil(t, bobShared)
	assert.Equal(t, "note_folders/inbox-"+strconv.Itoa(int(bob.ID)), bobDefault.Name)
	assert.Equal(t, sharedFolder.Name, bobShared.Name)
	assert.False(t, bobShared.IsDefault)
}
