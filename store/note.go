package store

import (
	"context"
	"errors"

	"github.com/usememos/memos/internal/base"
)

// Note is a long-form markdown document, independent from Memo.
type Note struct {
	// ID is the system generated unique identifier for the note.
	ID int32
	// UID is the user defined unique identifier for the note.
	UID string

	// Standard fields.
	RowStatus RowStatus
	CreatorID int32
	CreatedTs int64
	UpdatedTs int64

	// Domain specific fields.
	FolderID *int32
	Title    string
	Content  string
}

type FindNote struct {
	ID  *int32
	UID *string

	IDList  []int32
	UIDList []string

	RowStatus *RowStatus
	CreatorID *int32

	// AccessibleFolderIDList restricts results to notes inside these folders.
	// When combined with CreatorID, the condition becomes
	// (creator_id = ? OR folder_id IN (...)).
	AccessibleFolderIDList []int32

	// FolderID filters by the note's folder. When FolderIDSet is true and
	// FolderID is nil, it matches root-level notes (folder_id IS NULL).
	FolderID    *int32
	FolderIDSet bool
	// FolderIDList matches notes whose folder is any of the given IDs.
	FolderIDList []int32

	// Title matches the exact title. TitleList matches any title in the list.
	// TitleSearch performs a fuzzy (substring) match.
	Title       *string
	TitleList   []string
	TitleSearch *string

	// Tag filters notes that carry the given tag.
	Tag *string

	// Pagination.
	Limit  *int
	Offset *int

	// Ordering.
	OrderByUpdatedTs bool
	OrderByTimeAsc   bool
}

type UpdateNote struct {
	ID int32

	Title     *string
	Content   *string
	RowStatus *RowStatus
	UpdatedTs *int64

	// FolderID is the folder to move the note into. MoveToRoot, when true,
	// moves the note to the root (folder_id = NULL).
	FolderID   *int32
	MoveToRoot bool
}

type DeleteNote struct {
	ID int32
}

// CreateNote creates a note.
func (s *Store) CreateNote(ctx context.Context, create *Note) (*Note, error) {
	if !base.UIDMatcher.MatchString(create.UID) {
		return nil, errors.New("invalid uid")
	}
	return s.driver.CreateNote(ctx, create)
}

// ListNotes lists notes matching the given filter.
func (s *Store) ListNotes(ctx context.Context, find *FindNote) ([]*Note, error) {
	return s.driver.ListNotes(ctx, find)
}

// GetNote returns a single note matching the given filter, or nil.
func (s *Store) GetNote(ctx context.Context, find *FindNote) (*Note, error) {
	list, err := s.ListNotes(ctx, find)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, nil
	}
	return list[0], nil
}

// UpdateNote updates a note.
func (s *Store) UpdateNote(ctx context.Context, update *UpdateNote) error {
	return s.driver.UpdateNote(ctx, update)
}

// DeleteNote deletes a note and its link/tag relations.
func (s *Store) DeleteNote(ctx context.Context, delete *DeleteNote) error {
	return s.driver.DeleteNoteWithRelations(ctx, delete.ID)
}
