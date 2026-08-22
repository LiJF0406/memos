package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func TestNoteStore(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	noteCreate := &store.Note{
		UID:       "note-test-1",
		CreatorID: user.ID,
		Title:     "First Note",
		Content:   "Hello [[World]]",
	}
	note, err := ts.CreateNote(ctx, noteCreate)
	require.NoError(t, err)
	require.Equal(t, "First Note", note.Title)

	// Get by UID.
	got, err := ts.GetNote(ctx, &store.FindNote{UID: &note.UID})
	require.NoError(t, err)
	require.NotNil(t, got)

	// Filter by exact title list (used for import dedup and wikilink resolution).
	titleList, err := ts.ListNotes(ctx, &store.FindNote{CreatorID: &user.ID, TitleList: []string{"First Note"}})
	require.NoError(t, err)
	require.Len(t, titleList, 1)

	// Filter by tag (exercises the postgres JOIN placeholder numbering).
	tag := "work"
	require.NoError(t, ts.SetNoteRelations(ctx, note.ID, nil, []*store.NoteTag{{Tag: tag}}))
	tagList, err := ts.ListNotes(ctx, &store.FindNote{CreatorID: &user.ID, Tag: &tag})
	require.NoError(t, err)
	require.Len(t, tagList, 1)
	require.Equal(t, note.ID, tagList[0].ID)

	// Update.
	content := "Updated content"
	err = ts.UpdateNote(ctx, &store.UpdateNote{ID: note.ID, Content: &content})
	require.NoError(t, err)
	got, err = ts.GetNote(ctx, &store.FindNote{ID: &note.ID})
	require.NoError(t, err)
	require.Equal(t, content, got.Content)

	// Delete removes the note and its relations.
	require.NoError(t, ts.DeleteNote(ctx, &store.DeleteNote{ID: note.ID}))
	got, err = ts.GetNote(ctx, &store.FindNote{ID: &note.ID})
	require.NoError(t, err)
	require.Nil(t, got)
	tagList, err = ts.ListNotes(ctx, &store.FindNote{CreatorID: &user.ID, Tag: &tag})
	require.NoError(t, err)
	require.Len(t, tagList, 0)
}

func TestNoteFolderStore(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	parent, err := ts.CreateNoteFolder(ctx, &store.NoteFolder{
		UID:       "folder-test-1",
		CreatorID: user.ID,
		Name:      "Parent",
	})
	require.NoError(t, err)

	child, err := ts.CreateNoteFolder(ctx, &store.NoteFolder{
		UID:       "folder-test-2",
		CreatorID: user.ID,
		Name:      "Child",
		ParentID:  &parent.ID,
	})
	require.NoError(t, err)

	// Notes inside both folders.
	noteInParent, err := ts.CreateNote(ctx, &store.Note{
		UID:       "note-folder-1",
		CreatorID: user.ID,
		Title:     "In Parent",
		FolderID:  &parent.ID,
	})
	require.NoError(t, err)
	noteInChild, err := ts.CreateNote(ctx, &store.Note{
		UID:       "note-folder-2",
		CreatorID: user.ID,
		Title:     "In Child",
		FolderID:  &child.ID,
	})
	require.NoError(t, err)

	// An unrelated sibling folder that must NOT be touched by the cascade.
	sibling, err := ts.CreateNoteFolder(ctx, &store.NoteFolder{
		UID:       "folder-test-3",
		CreatorID: user.ID,
		Name:      "Sibling",
	})
	require.NoError(t, err)
	noteInSibling, err := ts.CreateNote(ctx, &store.Note{
		UID:       "note-folder-3",
		CreatorID: user.ID,
		Title:     "In Sibling",
		FolderID:  &sibling.ID,
	})
	require.NoError(t, err)

	// Deleting the parent cascades to the child folder and both notes.
	err = ts.DeleteNoteFolder(ctx, &store.DeleteNoteFolder{ID: parent.ID})
	require.NoError(t, err)

	noteList, err := ts.ListNotes(ctx, &store.FindNote{FolderIDList: []int32{parent.ID, child.ID}})
	require.NoError(t, err)
	require.Len(t, noteList, 0)
	got, err := ts.GetNote(ctx, &store.FindNote{ID: &noteInParent.ID})
	require.NoError(t, err)
	require.Nil(t, got)
	got, err = ts.GetNote(ctx, &store.FindNote{ID: &noteInChild.ID})
	require.NoError(t, err)
	require.Nil(t, got)
	folderList, err := ts.ListNoteFolders(ctx, &store.FindNoteFolder{IDList: []int32{parent.ID, child.ID}})
	require.NoError(t, err)
	require.Len(t, folderList, 0)

	// The unrelated sibling folder and its note must survive.
	siblingList, err := ts.ListNoteFolders(ctx, &store.FindNoteFolder{IDList: []int32{sibling.ID}})
	require.NoError(t, err)
	require.Len(t, siblingList, 1)
	gotSiblingNote, err := ts.GetNote(ctx, &store.FindNote{ID: &noteInSibling.ID})
	require.NoError(t, err)
	require.NotNil(t, gotSiblingNote)
}

func TestNoteRelations(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	target, err := ts.CreateNote(ctx, &store.Note{
		UID:       "note-relation-target",
		CreatorID: user.ID,
		Title:     "Target",
	})
	require.NoError(t, err)
	source, err := ts.CreateNote(ctx, &store.Note{
		UID:       "note-relation-source",
		CreatorID: user.ID,
		Title:     "Source",
	})
	require.NoError(t, err)

	targetID := target.ID
	link := &store.NoteLink{
		NoteID:      source.ID,
		TargetType:  store.NoteLinkTargetNote,
		TargetID:    &targetID,
		TargetTitle: "Target",
	}
	tag := &store.NoteTag{NoteID: source.ID, Tag: "tag-a"}
	require.NoError(t, ts.SetNoteRelations(ctx, source.ID, []*store.NoteLink{link}, []*store.NoteTag{tag}))

	// Outgoing links and tags are persisted.
	links, err := ts.ListNoteLinks(ctx, &store.FindNoteLink{NoteID: &source.ID})
	require.NoError(t, err)
	require.Len(t, links, 1)
	require.Equal(t, store.NoteLinkTargetNote, links[0].TargetType)

	tags, err := ts.ListNoteTags(ctx, &store.FindNoteTag{NoteID: &source.ID})
	require.NoError(t, err)
	require.Len(t, tags, 1)
	require.Equal(t, "tag-a", tags[0].Tag)

	// Replacing relations drops the old ones.
	require.NoError(t, ts.SetNoteRelations(ctx, source.ID, nil, nil))
	links, err = ts.ListNoteLinks(ctx, &store.FindNoteLink{NoteID: &source.ID})
	require.NoError(t, err)
	require.Len(t, links, 0)

	// Re-create the link, then delete the target: the incoming link degrades
	// to UNRESOLVED and the source note keeps its row.
	require.NoError(t, ts.SetNoteRelations(ctx, source.ID, []*store.NoteLink{link}, nil))
	require.NoError(t, ts.DeleteNote(ctx, &store.DeleteNote{ID: target.ID}))
	incoming, err := ts.ListNoteLinks(ctx, &store.FindNoteLink{
		TargetType: &targetTypeNote,
		TargetID:   &targetID,
	})
	require.NoError(t, err)
	require.Len(t, incoming, 0)

	degraded, err := ts.ListNoteLinks(ctx, &store.FindNoteLink{
		NoteID:      &source.ID,
		TargetTitle: &link.TargetTitle,
	})
	require.NoError(t, err)
	require.Len(t, degraded, 1)
	require.Equal(t, store.NoteLinkTargetUnresolved, degraded[0].TargetType)
	require.Nil(t, degraded[0].TargetID)

	got, err := ts.GetNote(ctx, &store.FindNote{ID: &source.ID})
	require.NoError(t, err)
	require.NotNil(t, got)
}

var targetTypeNote = store.NoteLinkTargetNote
