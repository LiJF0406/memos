package store

import (
	"context"
	"errors"

	"github.com/usememos/memos/internal/base"
)

// NoteFolder is a folder for organizing notes. Folders may be nested and shared.
type NoteFolder struct {
	// ID is the system generated unique identifier for the folder.
	ID int32
	// UID is the user defined unique identifier for the folder.
	UID string

	// Standard fields.
	RowStatus RowStatus
	CreatorID int32
	CreatedTs int64
	UpdatedTs int64

	// Domain specific fields.
	ParentID *int32
	Name     string
	Shared   bool
	// IsDefault is true for the system default folder created for each user.
	IsDefault bool
}

type FindNoteFolder struct {
	ID  *int32
	UID *string

	IDList  []int32
	UIDList []string

	RowStatus *RowStatus
	CreatorID *int32

	// ParentID filters by parent folder. When ParentIDSet is true and ParentID
	// is nil, it matches root-level folders (parent_id IS NULL).
	ParentID    *int32
	ParentIDSet bool

	// IsDefault filters by whether the folder is the system default folder.
	IsDefault *bool
}

type UpdateNoteFolder struct {
	ID int32

	Name       *string
	RowStatus  *RowStatus
	UpdatedTs  *int64
	Shared     *bool
	ParentID   *int32
	MoveToRoot bool
}

type DeleteNoteFolder struct {
	ID int32
}

// CreateNoteFolder creates a note folder.
func (s *Store) CreateNoteFolder(ctx context.Context, create *NoteFolder) (*NoteFolder, error) {
	if !base.UIDMatcher.MatchString(create.UID) {
		return nil, errors.New("invalid uid")
	}
	return s.driver.CreateNoteFolder(ctx, create)
}

// ListNoteFolders lists note folders matching the given filter.
func (s *Store) ListNoteFolders(ctx context.Context, find *FindNoteFolder) ([]*NoteFolder, error) {
	return s.driver.ListNoteFolders(ctx, find)
}

// GetNoteFolder returns a single note folder matching the given filter, or nil.
func (s *Store) GetNoteFolder(ctx context.Context, find *FindNoteFolder) (*NoteFolder, error) {
	list, err := s.ListNoteFolders(ctx, find)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, nil
	}
	return list[0], nil
}

// UpdateNoteFolder updates a note folder.
func (s *Store) UpdateNoteFolder(ctx context.Context, update *UpdateNoteFolder) error {
	return s.driver.UpdateNoteFolder(ctx, update)
}

// DeleteNoteFolder deletes a folder, its descendant folders, and all notes
// contained within them.
func (s *Store) DeleteNoteFolder(ctx context.Context, delete *DeleteNoteFolder) error {
	folderIDs, err := s.collectNoteFolderDescendantIDs(ctx, delete.ID)
	if err != nil {
		return err
	}

	noteIDs := []int32{}
	notes, err := s.ListNotes(ctx, &FindNote{FolderIDList: folderIDs})
	if err != nil {
		return err
	}
	for _, note := range notes {
		noteIDs = append(noteIDs, note.ID)
	}

	return s.driver.DeleteNoteFoldersAndNotes(ctx, folderIDs, noteIDs)
}

// collectNoteFolderDescendantIDs returns the given folder ID plus all of its
// descendant folder IDs, in breadth-first order.
func (s *Store) collectNoteFolderDescendantIDs(ctx context.Context, folderID int32) ([]int32, error) {
	result := []int32{folderID}
	queue := []int32{folderID}
	visited := map[int32]bool{folderID: true}
	for len(queue) > 0 {
		parentID := queue[0]
		queue = queue[1:]
		children, err := s.ListNoteFolders(ctx, &FindNoteFolder{ParentID: &parentID})
		if err != nil {
			return nil, err
		}
		for _, child := range children {
			if visited[child.ID] {
				continue
			}
			visited[child.ID] = true
			result = append(result, child.ID)
			queue = append(queue, child.ID)
		}
	}
	return result, nil
}

// ListSharedNoteFolderIDs returns the IDs of all folders that are part of a
// shared workspace: a folder whose own `shared` flag is set, or that has a
// shared ancestor. These folders are accessible to all registered users.
func (s *Store) ListSharedNoteFolderIDs(ctx context.Context) ([]int32, error) {
	folders, err := s.ListNoteFolders(ctx, &FindNoteFolder{})
	if err != nil {
		return nil, err
	}

	byID := make(map[int32]*NoteFolder, len(folders))
	for _, folder := range folders {
		byID[folder.ID] = folder
	}

	sharedMemo := make(map[int32]bool, len(folders))
	visiting := make(map[int32]bool, len(folders))
	var isShared func(id int32) bool
	isShared = func(id int32) bool {
		if v, ok := sharedMemo[id]; ok {
			return v
		}
		folder := byID[id]
		if folder == nil {
			sharedMemo[id] = false
			return false
		}
		if visiting[id] {
			// Cycle guard; treat as not shared.
			sharedMemo[id] = false
			return false
		}
		visiting[id] = true
		shared := folder.Shared
		if !shared && folder.ParentID != nil {
			shared = isShared(*folder.ParentID)
		}
		visiting[id] = false
		sharedMemo[id] = shared
		return shared
	}

	var result []int32
	for _, folder := range folders {
		if isShared(folder.ID) {
			result = append(result, folder.ID)
		}
	}
	return result, nil
}
