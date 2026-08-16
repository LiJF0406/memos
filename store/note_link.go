package store

import (
	"context"
)

// NoteLinkTargetType enumerates the possible target types of a note link.
type NoteLinkTargetType string

const (
	// NoteLinkTargetNote points to another note.
	NoteLinkTargetNote NoteLinkTargetType = "NOTE"
	// NoteLinkTargetMemo points to a memo.
	NoteLinkTargetMemo NoteLinkTargetType = "MEMO"
	// NoteLinkTargetUnresolved is a dangling link whose title could not be resolved.
	NoteLinkTargetUnresolved NoteLinkTargetType = "UNRESOLVED"
)

// String returns the string representation of the target type.
func (t NoteLinkTargetType) String() string {
	return string(t)
}

// NoteLink represents a wiki link ([[...]]) relationship for a note.
type NoteLink struct {
	NoteID      int32
	TargetType  NoteLinkTargetType
	TargetID    *int32
	TargetTitle string
	CreatedTs   int64
}

type FindNoteLink struct {
	NoteID      *int32
	NoteIDList  []int32
	TargetType  *NoteLinkTargetType
	TargetID    *int32
	TargetTitle *string

	Limit  *int
	Offset *int
}

type DeleteNoteLink struct {
	NoteID     *int32
	TargetType *NoteLinkTargetType
	TargetID   *int32
}

// UpsertNoteLink upserts a note link.
func (s *Store) UpsertNoteLink(ctx context.Context, create *NoteLink) (*NoteLink, error) {
	return s.driver.UpsertNoteLink(ctx, create)
}

// ListNoteLinks lists note links matching the given filter.
func (s *Store) ListNoteLinks(ctx context.Context, find *FindNoteLink) ([]*NoteLink, error) {
	return s.driver.ListNoteLinks(ctx, find)
}

// DeleteNoteLinks deletes note links matching the given filter.
func (s *Store) DeleteNoteLinks(ctx context.Context, delete *DeleteNoteLink) error {
	return s.driver.DeleteNoteLinks(ctx, delete)
}
