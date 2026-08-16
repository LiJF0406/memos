package v1

import (
	"context"
	"fmt"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func convertNoteLinkTargetTypeToProto(t store.NoteLinkTargetType) v1pb.NoteLinkTargetType {
	switch t {
	case store.NoteLinkTargetNote:
		return v1pb.NoteLinkTargetType_NOTE
	case store.NoteLinkTargetMemo:
		return v1pb.NoteLinkTargetType_MEMO
	default:
		return v1pb.NoteLinkTargetType_UNRESOLVED
	}
}

// listNoteFoldersMap loads all note folders into an ID-keyed map.
func (s *APIV1Service) listNoteFoldersMap(ctx context.Context) (map[int32]*store.NoteFolder, error) {
	folders, err := s.Store.ListNoteFolders(ctx, &store.FindNoteFolder{})
	if err != nil {
		return nil, err
	}
	foldersMap := make(map[int32]*store.NoteFolder, len(folders))
	for _, folder := range folders {
		foldersMap[folder.ID] = folder
	}
	return foldersMap, nil
}

// noteFolderIsInSharedWorkspace reports whether the folder, or any of its
// ancestors, has the `shared` flag set.
func noteFolderIsInSharedWorkspace(folderID *int32, foldersMap map[int32]*store.NoteFolder) bool {
	seen := make(map[int32]bool)
	id := folderID
	for id != nil {
		if seen[*id] {
			return false
		}
		seen[*id] = true
		folder, ok := foldersMap[*id]
		if !ok {
			return false
		}
		if folder.Shared {
			return true
		}
		id = folder.ParentID
	}
	return false
}

// checkNoteFolderReadAccess verifies the current user can see the folder:
// the creator, or any registered user when the folder is in a shared workspace.
func (s *APIV1Service) checkNoteFolderReadAccess(ctx context.Context, folder *store.NoteFolder, foldersMap map[int32]*store.NoteFolder) error {
	if folder == nil {
		return status.Errorf(codes.NotFound, "note folder not found")
	}
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if folder.CreatorID == user.ID || noteFolderIsInSharedWorkspace(&folder.ID, foldersMap) {
		return nil
	}
	return status.Errorf(codes.PermissionDenied, "permission denied")
}

// checkNoteFolderWriteAccess verifies the current user can modify the folder:
// only the creator (or an admin).
func (s *APIV1Service) checkNoteFolderWriteAccess(ctx context.Context, folder *store.NoteFolder) error {
	if folder == nil {
		return status.Errorf(codes.NotFound, "note folder not found")
	}
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if folder.CreatorID != user.ID && !isSuperUser(user) {
		return status.Errorf(codes.PermissionDenied, "permission denied")
	}
	return nil
}

// checkNoteAccess verifies the current user can read or write the note:
// the creator, or any registered user when the note lives in a shared workspace.
func (s *APIV1Service) checkNoteAccess(ctx context.Context, note *store.Note, foldersMap map[int32]*store.NoteFolder) error {
	if note == nil {
		return status.Errorf(codes.NotFound, "note not found")
	}
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if note.CreatorID == user.ID || noteFolderIsInSharedWorkspace(note.FolderID, foldersMap) {
		return nil
	}
	return status.Errorf(codes.PermissionDenied, "permission denied")
}

// resolveNoteLinkTargets resolves a list of wiki link titles to note links.
// Note titles are resolved first, then memo titles; unresolved titles become
// UNRESOLVED links that preserve the original title.
func (s *APIV1Service) resolveNoteLinkTargets(ctx context.Context, wikilinks []string, user *store.User) ([]*store.NoteLink, error) {
	if len(wikilinks) == 0 {
		return []*store.NoteLink{}, nil
	}

	titleSet := make(map[string]struct{}, len(wikilinks))
	for _, title := range wikilinks {
		titleSet[title] = struct{}{}
	}
	titles := make([]string, 0, len(titleSet))
	for title := range titleSet {
		titles = append(titles, title)
	}

	sharedFolderIDs, err := s.Store.ListSharedNoteFolderIDs(ctx)
	if err != nil {
		return nil, errors.Wrap(err, "failed to list shared note folder IDs")
	}
	notes, err := s.Store.ListNotes(ctx, &store.FindNote{
		TitleList:              titles,
		CreatorID:              &user.ID,
		AccessibleFolderIDList: sharedFolderIDs,
	})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list notes by title")
	}
	noteByTitle := make(map[string]*store.Note, len(notes))
	for _, note := range notes {
		existing, ok := noteByTitle[note.Title]
		if !ok || note.CreatedTs > existing.CreatedTs {
			noteByTitle[note.Title] = note
		}
	}

	memos, err := s.Store.ListMemos(ctx, &store.FindMemo{
		ExcludeContent: true,
		Filters:        []string{fmt.Sprintf(`creator_id == %d || visibility in ["PUBLIC"]`, user.ID)},
	})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list memos for link resolution")
	}
	memoByTitle := make(map[string]*store.Memo)
	for _, memo := range memos {
		if memo.Payload == nil || memo.Payload.Property == nil || memo.Payload.Property.Title == "" {
			continue
		}
		existing, ok := memoByTitle[memo.Payload.Property.Title]
		if !ok || memo.CreatedTs > existing.CreatedTs {
			memoByTitle[memo.Payload.Property.Title] = memo
		}
	}

	links := make([]*store.NoteLink, 0, len(titles))
	for _, title := range titles {
		if note, ok := noteByTitle[title]; ok {
			targetID := note.ID
			links = append(links, &store.NoteLink{
				TargetType:  store.NoteLinkTargetNote,
				TargetID:    &targetID,
				TargetTitle: title,
			})
			continue
		}
		if memo, ok := memoByTitle[title]; ok {
			targetID := memo.ID
			links = append(links, &store.NoteLink{
				TargetType:  store.NoteLinkTargetMemo,
				TargetID:    &targetID,
				TargetTitle: title,
			})
			continue
		}
		links = append(links, &store.NoteLink{
			TargetType:  store.NoteLinkTargetUnresolved,
			TargetTitle: title,
		})
	}
	return links, nil
}

// convertOutgoingNoteLinks resolves the target of each outgoing link (note_id = source).
func (s *APIV1Service) convertOutgoingNoteLinks(ctx context.Context, links []*store.NoteLink) ([]*v1pb.NoteLink, error) {
	noteIDs := make([]int32, 0)
	memoIDs := make([]int32, 0)
	for _, link := range links {
		if link.TargetID == nil {
			continue
		}
		switch link.TargetType {
		case store.NoteLinkTargetNote:
			noteIDs = append(noteIDs, *link.TargetID)
		case store.NoteLinkTargetMemo:
			memoIDs = append(memoIDs, *link.TargetID)
		default:
			// Unresolved links have no target ID.
		}
	}

	noteUIDMap := make(map[int32]string)
	if len(noteIDs) > 0 {
		notes, err := s.Store.ListNotes(ctx, &store.FindNote{IDList: noteIDs})
		if err != nil {
			return nil, errors.Wrap(err, "failed to list linked notes")
		}
		for _, note := range notes {
			noteUIDMap[note.ID] = note.UID
		}
	}
	memoUIDMap := make(map[int32]string)
	if len(memoIDs) > 0 {
		memos, err := s.Store.ListMemos(ctx, &store.FindMemo{IDList: memoIDs, ExcludeContent: true})
		if err != nil {
			return nil, errors.Wrap(err, "failed to list linked memos")
		}
		for _, memo := range memos {
			memoUIDMap[memo.ID] = memo.UID
		}
	}

	result := make([]*v1pb.NoteLink, 0, len(links))
	for _, link := range links {
		target := ""
		switch link.TargetType {
		case store.NoteLinkTargetNote:
			if link.TargetID != nil {
				if uid, ok := noteUIDMap[*link.TargetID]; ok {
					target = fmt.Sprintf("%s%s", NoteNamePrefix, uid)
				}
			}
		case store.NoteLinkTargetMemo:
			if link.TargetID != nil {
				if uid, ok := memoUIDMap[*link.TargetID]; ok {
					target = fmt.Sprintf("%s%s", MemoNamePrefix, uid)
				}
			}
		default:
			// Unresolved links render without a target.
		}
		result = append(result, &v1pb.NoteLink{
			TargetType: convertNoteLinkTargetTypeToProto(link.TargetType),
			Target:     target,
			Title:      link.TargetTitle,
		})
	}
	return result, nil
}

// convertIncomingNoteLinks resolves the source note of each incoming link,
// pointing the result back at the note that references the current note.
// Source notes the current user cannot see are filtered out.
func (s *APIV1Service) convertIncomingNoteLinks(ctx context.Context, links []*store.NoteLink, foldersMap map[int32]*store.NoteFolder) ([]*v1pb.NoteLink, error) {
	sourceIDs := make([]int32, 0, len(links))
	for _, link := range links {
		sourceIDs = append(sourceIDs, link.NoteID)
	}
	sourceUIDMap := make(map[int32]string)
	if len(sourceIDs) > 0 {
		notes, err := s.Store.ListNotes(ctx, &store.FindNote{IDList: sourceIDs})
		if err != nil {
			return nil, errors.Wrap(err, "failed to list source notes")
		}
		for _, note := range notes {
			if err := s.checkNoteAccess(ctx, note, foldersMap); err != nil {
				continue
			}
			sourceUIDMap[note.ID] = note.UID
		}
	}

	result := make([]*v1pb.NoteLink, 0, len(links))
	for _, link := range links {
		target := ""
		if uid, ok := sourceUIDMap[link.NoteID]; ok {
			target = fmt.Sprintf("%s%s", NoteNamePrefix, uid)
		}
		result = append(result, &v1pb.NoteLink{
			TargetType: v1pb.NoteLinkTargetType_NOTE,
			Target:     target,
			Title:      link.TargetTitle,
		})
	}
	return result, nil
}

func (s *APIV1Service) convertNoteFromStore(ctx context.Context, note *store.Note, folderName *string, shared bool, tags []string, links []*v1pb.NoteLink, backlinks []*v1pb.NoteLink) (*v1pb.Note, error) {
	creatorMap, err := s.listUsersByID(ctx, []int32{note.CreatorID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list note creator")
	}
	return convertNoteFromStoreWithCreators(note, folderName, shared, tags, links, backlinks, creatorMap)
}

func convertNoteFromStoreWithCreators(note *store.Note, folderName *string, shared bool, tags []string, links []*v1pb.NoteLink, backlinks []*v1pb.NoteLink, creatorMap map[int32]*store.User) (*v1pb.Note, error) {
	creator := creatorMap[note.CreatorID]
	if creator == nil {
		return nil, errors.Errorf("note creator %d not found", note.CreatorID)
	}
	return &v1pb.Note{
		Name:       fmt.Sprintf("%s%s", NoteNamePrefix, note.UID),
		Creator:    BuildUserName(creator.Username),
		CreateTime: timestamppb.New(time.Unix(note.CreatedTs, 0)),
		UpdateTime: timestamppb.New(time.Unix(note.UpdatedTs, 0)),
		Title:      note.Title,
		Content:    note.Content,
		Folder:     folderName,
		Tags:       tags,
		Links:      links,
		Backlinks:  backlinks,
		Shared:     shared,
	}, nil
}

func (s *APIV1Service) convertNoteFolderFromStore(ctx context.Context, folder *store.NoteFolder, parentName *string) (*v1pb.NoteFolder, error) {
	creatorMap, err := s.listUsersByID(ctx, []int32{folder.CreatorID})
	if err != nil {
		return nil, errors.Wrap(err, "failed to list folder creator")
	}
	creator := creatorMap[folder.CreatorID]
	if creator == nil {
		return nil, errors.Errorf("note folder creator %d not found", folder.CreatorID)
	}
	return &v1pb.NoteFolder{
		Name:       fmt.Sprintf("%s%s", NoteFolderNamePrefix, folder.UID),
		Creator:    BuildUserName(creator.Username),
		CreateTime: timestamppb.New(time.Unix(folder.CreatedTs, 0)),
		UpdateTime: timestamppb.New(time.Unix(folder.UpdatedTs, 0)),
		Parent:     parentName,
		Title:      folder.Name,
		Shared:     folder.Shared,
	}, nil
}

// folderNameFromID returns the resource name of the folder, or nil when it
// is not found in the map.
func folderNameFromID(folderID *int32, foldersMap map[int32]*store.NoteFolder) *string {
	if folderID == nil {
		return nil
	}
	folder, ok := foldersMap[*folderID]
	if !ok {
		return nil
	}
	name := fmt.Sprintf("%s%s", NoteFolderNamePrefix, folder.UID)
	return &name
}
