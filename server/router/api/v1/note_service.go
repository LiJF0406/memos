package v1

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

// isUniqueViolation reports whether the error is a unique-constraint violation.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "Duplicate entry")
}

// parseNoteOrderBy maps the order_by string to FindNote ordering flags.
func parseNoteOrderBy(orderBy string, find *store.FindNote) {
	lower := strings.ToLower(orderBy)
	if strings.Contains(lower, "update_time") {
		find.OrderByUpdatedTs = true
	}
	if strings.HasSuffix(lower, "asc") {
		find.OrderByTimeAsc = true
	}
}

// rebuildNoteRelations re-extracts tags and wiki links from the content and
// atomically replaces the note's relations.
func (s *APIV1Service) rebuildNoteRelations(ctx context.Context, noteID int32, content string, user *store.User) error {
	data, err := s.MarkdownService.ExtractAll([]byte(content))
	if err != nil {
		return status.Errorf(codes.Internal, "failed to extract markdown metadata: %v", err)
	}
	links, err := s.resolveNoteLinkTargets(ctx, data.WikiLinks, user)
	if err != nil {
		return err
	}
	tags := make([]*store.NoteTag, 0, len(data.Tags))
	for _, tag := range data.Tags {
		tags = append(tags, &store.NoteTag{Tag: tag})
	}
	if err := s.Store.SetNoteRelations(ctx, noteID, links, tags); err != nil {
		return status.Errorf(codes.Internal, "failed to set note relations: %v", err)
	}
	return nil
}

// loadNoteMessage loads a note's full state and converts it to the API message.
func (s *APIV1Service) loadNoteMessage(ctx context.Context, note *store.Note, foldersMap map[int32]*store.NoteFolder) (*v1pb.Note, error) {
	folderName := folderNameFromID(note.FolderID, foldersMap)
	shared := noteFolderIsInSharedWorkspace(note.FolderID, foldersMap)

	outgoing, err := s.Store.ListNoteLinks(ctx, &store.FindNoteLink{NoteID: &note.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note links")
	}
	targetType := store.NoteLinkTargetNote
	incoming, err := s.Store.ListNoteLinks(ctx, &store.FindNoteLink{TargetType: &targetType, TargetID: &note.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note backlinks")
	}
	tags, err := s.Store.ListNoteTags(ctx, &store.FindNoteTag{NoteID: &note.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note tags")
	}

	outgoingMessages, err := s.convertOutgoingNoteLinks(ctx, outgoing)
	if err != nil {
		return nil, err
	}
	incomingMessages, err := s.convertIncomingNoteLinks(ctx, incoming, foldersMap)
	if err != nil {
		return nil, err
	}
	tagStrings := make([]string, 0, len(tags))
	for _, tag := range tags {
		tagStrings = append(tagStrings, tag.Tag)
	}

	return s.convertNoteFromStore(ctx, note, folderName, shared, tagStrings, outgoingMessages, incomingMessages)
}

// resolveFolderIDFromRequest resolves an optional folder resource name to a
// folder ID, verifying access. A nil return means the note stays at the root.
func (s *APIV1Service) resolveFolderIDFromRequest(ctx context.Context, folderName string, foldersMap map[int32]*store.NoteFolder) (*int32, error) {
	if folderName == "" {
		return nil, nil
	}
	folderUID, err := ExtractNoteFolderUIDFromName(folderName)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid folder name: %v", err)
	}
	folder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note folder")
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "note folder not found")
	}
	if err := s.checkNoteFolderReadAccess(ctx, folder, foldersMap); err != nil {
		return nil, err
	}
	return &folder.ID, nil
}

// CreateNote creates a note.
func (s *APIV1Service) CreateNote(ctx context.Context, request *v1pb.CreateNoteRequest) (*v1pb.Note, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	noteUID, err := ValidateAndGenerateUID(request.NoteId)
	if err != nil {
		return nil, err
	}

	title := strings.TrimSpace(request.Note.Title)
	if title == "" {
		return nil, status.Errorf(codes.InvalidArgument, "title is required")
	}

	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	folderID, err := s.resolveFolderIDFromRequest(ctx, request.Note.GetFolder(), foldersMap)
	if err != nil {
		return nil, err
	}

	note, err := s.Store.CreateNote(ctx, &store.Note{
		UID:       noteUID,
		CreatorID: user.ID,
		FolderID:  folderID,
		Title:     title,
		Content:   request.Note.Content,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, status.Errorf(codes.AlreadyExists, "note with ID %q already exists", noteUID)
		}
		return nil, status.Errorf(codes.Internal, "failed to create note: %v", err)
	}

	if err := s.rebuildNoteRelations(ctx, note.ID, note.Content, user); err != nil {
		return nil, err
	}

	return s.loadNoteMessage(ctx, note, foldersMap)
}

// ListNotes lists notes.
func (s *APIV1Service) ListNotes(ctx context.Context, request *v1pb.ListNotesRequest) (*v1pb.ListNotesResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	sharedFolderIDs, err := s.Store.ListSharedNoteFolderIDs(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list shared note folders")
	}

	rowStatus := store.Normal
	find := &store.FindNote{
		RowStatus:              &rowStatus,
		CreatorID:              &user.ID,
		AccessibleFolderIDList: sharedFolderIDs,
	}

	if request.Folder != "" {
		if request.Folder == "-" {
			find.FolderIDSet = true
		} else {
			folderUID, err := ExtractNoteFolderUIDFromName(request.Folder)
			if err != nil {
				return nil, status.Errorf(codes.InvalidArgument, "invalid folder name: %v", err)
			}
			folder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{UID: &folderUID})
			if err != nil {
				return nil, status.Errorf(codes.Internal, "failed to get note folder")
			}
			if folder == nil {
				return nil, status.Errorf(codes.NotFound, "note folder not found")
			}
			find.FolderIDSet = true
			find.FolderID = &folder.ID
		}
	}
	if request.TitleSearch != "" {
		titleSearch := request.TitleSearch
		find.TitleSearch = &titleSearch
	}
	if request.Tag != "" {
		tag := request.Tag
		find.Tag = &tag
	}
	if request.OrderBy != "" {
		parseNoteOrderBy(request.OrderBy, find)
	}
	if request.CreatedTsAfter != nil {
		createdTsAfter := request.CreatedTsAfter.AsTime().Unix()
		find.CreatedTsAfter = &createdTsAfter
	}
	if request.CreatedTsBefore != nil {
		createdTsBefore := request.CreatedTsBefore.AsTime().Unix()
		find.CreatedTsBefore = &createdTsBefore
	}

	var limit, offset int
	if request.PageToken != "" {
		var pageToken v1pb.PageToken
		if err := unmarshalPageToken(request.PageToken, &pageToken); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
		}
		limit = normalizePageSize(pageToken.Limit)
		offset = int(pageToken.Offset)
		if offset < 0 {
			offset = 0
		}
	} else {
		limit = normalizePageSize(request.PageSize)
	}
	limit = min(limit, MaxPageSize)
	limitPlusOne := limit + 1
	find.Limit = &limitPlusOne
	find.Offset = &offset

	notes, err := s.Store.ListNotes(ctx, find)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list notes: %v", err)
	}

	nextPageToken := ""
	if len(notes) == limitPlusOne {
		notes = notes[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get next page token: %v", err)
		}
	}

	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}

	noteIDs := make([]int32, 0, len(notes))
	creatorIDs := make([]int32, 0, len(notes))
	for _, note := range notes {
		noteIDs = append(noteIDs, note.ID)
		creatorIDs = append(creatorIDs, note.CreatorID)
	}

	tagsByNote := map[int32][]string{}
	if len(noteIDs) > 0 {
		tags, err := s.Store.ListNoteTags(ctx, &store.FindNoteTag{NoteIDList: noteIDs})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to list note tags")
		}
		for _, tag := range tags {
			tagsByNote[tag.NoteID] = append(tagsByNote[tag.NoteID], tag.Tag)
		}
	}
	creatorMap, err := s.listUsersByID(ctx, creatorIDs)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note creators")
	}

	noteMessages := make([]*v1pb.Note, 0, len(notes))
	for _, note := range notes {
		folderName := folderNameFromID(note.FolderID, foldersMap)
		shared := noteFolderIsInSharedWorkspace(note.FolderID, foldersMap)
		tags := tagsByNote[note.ID]
		if tags == nil {
			tags = []string{}
		}
		noteMessage, err := convertNoteFromStoreWithCreators(note, folderName, shared, tags, []*v1pb.NoteLink{}, []*v1pb.NoteLink{}, creatorMap)
		if err != nil {
			return nil, errors.Wrap(err, "failed to convert note")
		}
		noteMessages = append(noteMessages, noteMessage)
	}

	return &v1pb.ListNotesResponse{
		Notes:         noteMessages,
		NextPageToken: nextPageToken,
	}, nil
}

// ListNoteStats lists the creation timestamps of all notes accessible to the current user.
func (s *APIV1Service) ListNoteStats(ctx context.Context, _ *v1pb.ListNoteStatsRequest) (*v1pb.ListNoteStatsResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	sharedFolderIDs, err := s.Store.ListSharedNoteFolderIDs(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list shared note folders")
	}

	rowStatus := store.Normal
	createdTsList, err := s.Store.ListNoteCreatedTs(ctx, &store.FindNote{
		RowStatus:              &rowStatus,
		CreatorID:              &user.ID,
		AccessibleFolderIDList: sharedFolderIDs,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note stats: %v", err)
	}

	createdTs := make([]*timestamppb.Timestamp, 0, len(createdTsList))
	for _, ts := range createdTsList {
		createdTs = append(createdTs, timestamppb.New(time.Unix(ts, 0)))
	}
	return &v1pb.ListNoteStatsResponse{CreatedTs: createdTs}, nil
}

// GetNote gets a note.
func (s *APIV1Service) GetNote(ctx context.Context, request *v1pb.GetNoteRequest) (*v1pb.Note, error) {
	noteUID, err := ExtractNoteUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note name: %v", err)
	}
	note, err := s.Store.GetNote(ctx, &store.FindNote{UID: &noteUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note: %v", err)
	}
	if note == nil {
		return nil, status.Errorf(codes.NotFound, "note not found")
	}
	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	if err := s.checkNoteAccess(ctx, note, foldersMap); err != nil {
		return nil, err
	}
	return s.loadNoteMessage(ctx, note, foldersMap)
}

// UpdateNote updates a note.
func (s *APIV1Service) UpdateNote(ctx context.Context, request *v1pb.UpdateNoteRequest) (*v1pb.Note, error) {
	noteUID, err := ExtractNoteUIDFromName(request.Note.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note name: %v", err)
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "update mask is required")
	}

	note, err := s.Store.GetNote(ctx, &store.FindNote{UID: &noteUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note: %v", err)
	}
	if note == nil {
		return nil, status.Errorf(codes.NotFound, "note not found")
	}
	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	if err := s.checkNoteAccess(ctx, note, foldersMap); err != nil {
		return nil, err
	}
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}

	update := &store.UpdateNote{ID: note.ID}
	contentUpdated := false
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "title":
			title := strings.TrimSpace(request.Note.Title)
			if title == "" {
				return nil, status.Errorf(codes.InvalidArgument, "title is required")
			}
			update.Title = &title
		case "content":
			contentUpdated = true
			content := request.Note.Content
			update.Content = &content
		case "folder":
			folderID, err := s.resolveFolderIDFromRequest(ctx, request.Note.GetFolder(), foldersMap)
			if err != nil {
				return nil, err
			}
			if folderID == nil {
				update.MoveToRoot = true
			} else {
				update.FolderID = folderID
			}
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported update path %q", path)
		}
	}

	now := timeNowUnix()
	update.UpdatedTs = &now
	if err := s.Store.UpdateNote(ctx, update); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update note: %v", err)
	}

	if contentUpdated {
		updated, err := s.Store.GetNote(ctx, &store.FindNote{ID: &note.ID})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get updated note")
		}
		if err := s.rebuildNoteRelations(ctx, note.ID, updated.Content, user); err != nil {
			return nil, err
		}
	}

	updatedNote, err := s.Store.GetNote(ctx, &store.FindNote{ID: &note.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get updated note")
	}
	return s.loadNoteMessage(ctx, updatedNote, foldersMap)
}

// DeleteNote deletes a note.
func (s *APIV1Service) DeleteNote(ctx context.Context, request *v1pb.DeleteNoteRequest) (*emptypb.Empty, error) {
	noteUID, err := ExtractNoteUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note name: %v", err)
	}
	note, err := s.Store.GetNote(ctx, &store.FindNote{UID: &noteUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note: %v", err)
	}
	if note == nil {
		return nil, status.Errorf(codes.NotFound, "note not found")
	}
	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	if err := s.checkNoteAccess(ctx, note, foldersMap); err != nil {
		return nil, err
	}
	if err := s.Store.DeleteNote(ctx, &store.DeleteNote{ID: note.ID}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete note: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// ListNoteLinks lists outgoing links and backlinks for a note.
func (s *APIV1Service) ListNoteLinks(ctx context.Context, request *v1pb.ListNoteLinksRequest) (*v1pb.ListNoteLinksResponse, error) {
	noteUID, err := ExtractNoteUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note name: %v", err)
	}
	note, err := s.Store.GetNote(ctx, &store.FindNote{UID: &noteUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note: %v", err)
	}
	if note == nil {
		return nil, status.Errorf(codes.NotFound, "note not found")
	}
	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	if err := s.checkNoteAccess(ctx, note, foldersMap); err != nil {
		return nil, err
	}

	outgoing, err := s.Store.ListNoteLinks(ctx, &store.FindNoteLink{NoteID: &note.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note links")
	}
	targetType := store.NoteLinkTargetNote
	incoming, err := s.Store.ListNoteLinks(ctx, &store.FindNoteLink{TargetType: &targetType, TargetID: &note.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note backlinks")
	}

	links, err := s.convertOutgoingNoteLinks(ctx, outgoing)
	if err != nil {
		return nil, err
	}
	backlinks, err := s.convertIncomingNoteLinks(ctx, incoming, foldersMap)
	if err != nil {
		return nil, err
	}
	return &v1pb.ListNoteLinksResponse{
		Links:     links,
		Backlinks: backlinks,
	}, nil
}

// ExportNote exports a note as Markdown.
func (s *APIV1Service) ExportNote(ctx context.Context, request *v1pb.ExportNoteRequest) (*v1pb.ExportNoteResponse, error) {
	noteUID, err := ExtractNoteUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note name: %v", err)
	}
	note, err := s.Store.GetNote(ctx, &store.FindNote{UID: &noteUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note: %v", err)
	}
	if note == nil {
		return nil, status.Errorf(codes.NotFound, "note not found")
	}
	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	if err := s.checkNoteAccess(ctx, note, foldersMap); err != nil {
		return nil, err
	}
	return &v1pb.ExportNoteResponse{
		Title:   note.Title,
		Content: note.Content,
	}, nil
}

// uniqueNoteTitle returns a title that does not collide with the user's
// existing note titles, appending " (1)", " (2)", ... as needed.
func (s *APIV1Service) uniqueNoteTitle(ctx context.Context, user *store.User, title string) (string, error) {
	existing, err := s.Store.ListNotes(ctx, &store.FindNote{CreatorID: &user.ID, TitleList: []string{title}})
	if err != nil {
		return "", err
	}
	titles := make(map[string]struct{}, len(existing))
	for _, note := range existing {
		titles[note.Title] = struct{}{}
	}
	if _, ok := titles[title]; !ok {
		return title, nil
	}
	for i := 1; ; i++ {
		candidate := fmt.Sprintf("%s (%d)", title, i)
		if _, ok := titles[candidate]; !ok {
			return candidate, nil
		}
	}
}

// ImportNote imports Markdown text as a note.
func (s *APIV1Service) ImportNote(ctx context.Context, request *v1pb.ImportNoteRequest) (*v1pb.Note, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	title := strings.TrimSpace(request.Title)
	if title == "" {
		return nil, status.Errorf(codes.InvalidArgument, "title is required")
	}
	title, err = s.uniqueNoteTitle(ctx, user, title)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to resolve note title")
	}

	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}
	folderID, err := s.resolveFolderIDFromRequest(ctx, request.GetFolder(), foldersMap)
	if err != nil {
		return nil, err
	}

	noteUID, err := ValidateAndGenerateUID("")
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate note ID: %v", err)
	}
	note, err := s.Store.CreateNote(ctx, &store.Note{
		UID:       noteUID,
		CreatorID: user.ID,
		FolderID:  folderID,
		Title:     title,
		Content:   request.Content,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create note: %v", err)
	}
	if err := s.rebuildNoteRelations(ctx, note.ID, note.Content, user); err != nil {
		return nil, err
	}
	return s.loadNoteMessage(ctx, note, foldersMap)
}

// timeNowUnix returns the current unix time in seconds.
func timeNowUnix() int64 {
	return time.Now().Unix()
}

// sortNoteFoldersByCreatedTs sorts folders in stable ascending creation order.
func sortNoteFoldersByCreatedTs(folders []*store.NoteFolder) {
	slices.SortFunc(folders, func(a, b *store.NoteFolder) int {
		if a.CreatedTs != b.CreatedTs {
			if a.CreatedTs < b.CreatedTs {
				return -1
			}
			return 1
		}
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
}
