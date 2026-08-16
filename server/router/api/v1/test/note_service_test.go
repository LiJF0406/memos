package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

// TestNotePermissionPrivateNote verifies that private notes are only
// accessible to their creator.
func TestNotePermissionPrivateNote(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice, err := ts.CreateRegularUser(ctx, "alice")
	require.NoError(t, err)
	bob, err := ts.CreateRegularUser(ctx, "bob")
	require.NoError(t, err)
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)
	bobCtx := ts.CreateUserContext(ctx, bob.ID)

	note, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "Private", Content: "secret content"},
	})
	require.NoError(t, err)

	// Creator can read and update.
	got, err := ts.Service.GetNote(aliceCtx, &v1pb.GetNoteRequest{Name: note.Name})
	require.NoError(t, err)
	assert.Equal(t, "Private", got.Title)

	// Another user cannot read.
	_, err = ts.Service.GetNote(bobCtx, &v1pb.GetNoteRequest{Name: note.Name})
	require.Error(t, err)
	assert.Equal(t, codes.PermissionDenied, status.Code(err))

	// Another user cannot update.
	_, err = ts.Service.UpdateNote(bobCtx, &v1pb.UpdateNoteRequest{
		Note:       &v1pb.Note{Name: note.Name, Content: "hacked"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}},
	})
	require.Error(t, err)
	assert.Equal(t, codes.PermissionDenied, status.Code(err))

	// Another user cannot delete.
	_, err = ts.Service.DeleteNote(bobCtx, &v1pb.DeleteNoteRequest{Name: note.Name})
	require.Error(t, err)
	assert.Equal(t, codes.PermissionDenied, status.Code(err))
}

// TestNotePermissionSharedFolder verifies that notes in a shared folder are
// fully accessible to all registered users.
func TestNotePermissionSharedFolder(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice, err := ts.CreateRegularUser(ctx, "alice")
	require.NoError(t, err)
	bob, err := ts.CreateRegularUser(ctx, "bob")
	require.NoError(t, err)
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)
	bobCtx := ts.CreateUserContext(ctx, bob.ID)

	folder, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Shared Workspace", Shared: true},
	})
	require.NoError(t, err)

	note, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "Meeting", Content: "minutes", Folder: &folder.Name},
	})
	require.NoError(t, err)
	assert.True(t, note.Shared)

	// Another user can read, update and delete.
	got, err := ts.Service.GetNote(bobCtx, &v1pb.GetNoteRequest{Name: note.Name})
	require.NoError(t, err)
	assert.Equal(t, "Meeting", got.Title)

	updated, err := ts.Service.UpdateNote(bobCtx, &v1pb.UpdateNoteRequest{
		Note:       &v1pb.Note{Name: note.Name, Content: "updated by bob"},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"content"}},
	})
	require.NoError(t, err)
	assert.Equal(t, "updated by bob", updated.Content)

	_, err = ts.Service.DeleteNote(bobCtx, &v1pb.DeleteNoteRequest{Name: note.Name})
	require.NoError(t, err)
}

// TestNotePermissionSharedInheritance verifies that a folder inherits the
// shared flag of its ancestors, and private branches stay private.
func TestNotePermissionSharedInheritance(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice, err := ts.CreateRegularUser(ctx, "alice")
	require.NoError(t, err)
	bob, err := ts.CreateRegularUser(ctx, "bob")
	require.NoError(t, err)
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)
	bobCtx := ts.CreateUserContext(ctx, bob.ID)

	root, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Root", Shared: false},
	})
	require.NoError(t, err)

	sharedChild, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Shared Child", Shared: true, Parent: &root.Name},
	})
	require.NoError(t, err)

	privateChild, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Private Child", Shared: false, Parent: &root.Name},
	})
	require.NoError(t, err)

	sharedNote, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "Public", Content: "hello", Folder: &sharedChild.Name},
	})
	require.NoError(t, err)
	assert.True(t, sharedNote.Shared)

	privateNote, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "Secret", Content: "classified", Folder: &privateChild.Name},
	})
	require.NoError(t, err)
	assert.False(t, privateNote.Shared)

	// Bob can read the inherited-shared note but not the private branch.
	_, err = ts.Service.GetNote(bobCtx, &v1pb.GetNoteRequest{Name: sharedNote.Name})
	require.NoError(t, err)
	_, err = ts.Service.GetNote(bobCtx, &v1pb.GetNoteRequest{Name: privateNote.Name})
	require.Error(t, err)
	assert.Equal(t, codes.PermissionDenied, status.Code(err))
}

// TestNoteFolderMoveCycleGuard verifies that a folder cannot be moved under
// itself or its own descendant.
func TestNoteFolderMoveCycleGuard(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice, err := ts.CreateRegularUser(ctx, "alice")
	require.NoError(t, err)
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)

	parent, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Parent"},
	})
	require.NoError(t, err)
	child, err := ts.Service.CreateNoteFolder(aliceCtx, &v1pb.CreateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Title: "Child", Parent: &parent.Name},
	})
	require.NoError(t, err)

	// Moving the parent under its own child must fail.
	_, err = ts.Service.UpdateNoteFolder(aliceCtx, &v1pb.UpdateNoteFolderRequest{
		NoteFolder: &v1pb.NoteFolder{Name: parent.Name, Parent: &child.Name},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"parent"}},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// TestNoteWikiLinkResolution verifies that [[...]] links in content are
// resolved to notes at save time, and dangling links stay unresolved.
func TestNoteWikiLinkResolution(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice, err := ts.CreateRegularUser(ctx, "alice")
	require.NoError(t, err)
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)

	target, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "Go 学习", Content: "学习资料"},
	})
	require.NoError(t, err)

	source, err := ts.Service.CreateNote(aliceCtx, &v1pb.CreateNoteRequest{
		Note: &v1pb.Note{Title: "索引", Content: "见 [[Go 学习]] 和 [[不存在的笔记]] 以及 #golang"},
	})
	require.NoError(t, err)

	resp, err := ts.Service.ListNoteLinks(aliceCtx, &v1pb.ListNoteLinksRequest{Name: source.Name})
	require.NoError(t, err)

	var resolved *v1pb.NoteLink
	var unresolved *v1pb.NoteLink
	for _, link := range resp.Links {
		switch link.Title {
		case "Go 学习":
			resolved = link
		case "不存在的笔记":
			unresolved = link
		default:
			// Ignore unrelated links.
		}
	}
	require.NotNil(t, resolved)
	assert.Equal(t, v1pb.NoteLinkTargetType_NOTE, resolved.TargetType)
	assert.Equal(t, target.Name, resolved.Target)

	require.NotNil(t, unresolved)
	assert.Equal(t, v1pb.NoteLinkTargetType_UNRESOLVED, unresolved.TargetType)
	assert.Empty(t, unresolved.Target)

	// The source note's tags are extracted.
	got, err := ts.Service.GetNote(aliceCtx, &v1pb.GetNoteRequest{Name: source.Name})
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"golang"}, got.Tags)
}

// TestNoteImportTitleDedup verifies that importing a note with a colliding
// title appends a "(1)" suffix instead of overwriting.
func TestNoteImportTitleDedup(t *testing.T) {
	ts := NewTestService(t)
	defer ts.Cleanup()
	ctx := context.Background()

	alice, err := ts.CreateRegularUser(ctx, "alice")
	require.NoError(t, err)
	aliceCtx := ts.CreateUserContext(ctx, alice.ID)

	first, err := ts.Service.ImportNote(aliceCtx, &v1pb.ImportNoteRequest{Title: "Daily", Content: "day one"})
	require.NoError(t, err)
	assert.Equal(t, "Daily", first.Title)

	second, err := ts.Service.ImportNote(aliceCtx, &v1pb.ImportNoteRequest{Title: "Daily", Content: "day two"})
	require.NoError(t, err)
	assert.Equal(t, "Daily (1)", second.Title)
}
