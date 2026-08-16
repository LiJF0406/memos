package store

import (
	"context"
)

// NoteTag represents a #tag relationship for a note.
type NoteTag struct {
	NoteID    int32
	Tag       string
	CreatedTs int64
}

type FindNoteTag struct {
	NoteID     *int32
	NoteIDList []int32
	Tag        *string
	TagList    []string

	Limit  *int
	Offset *int
}

type DeleteNoteTag struct {
	NoteID *int32
	Tag    *string
}

// UpsertNoteTag upserts a note tag.
func (s *Store) UpsertNoteTag(ctx context.Context, create *NoteTag) (*NoteTag, error) {
	return s.driver.UpsertNoteTag(ctx, create)
}

// ListNoteTags lists note tags matching the given filter.
func (s *Store) ListNoteTags(ctx context.Context, find *FindNoteTag) ([]*NoteTag, error) {
	return s.driver.ListNoteTags(ctx, find)
}

// DeleteNoteTags deletes note tags matching the given filter.
func (s *Store) DeleteNoteTags(ctx context.Context, delete *DeleteNoteTag) error {
	return s.driver.DeleteNoteTags(ctx, delete)
}

// SetNoteRelations atomically replaces the links and tags for a note.
func (s *Store) SetNoteRelations(ctx context.Context, noteID int32, links []*NoteLink, tags []*NoteTag) error {
	return s.driver.SetNoteRelations(ctx, noteID, links, tags)
}
