package v1

import (
	"context"
	"fmt"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

// defaultNoteFolderUIDPrefix is reserved for the system default folder of each
// user, e.g. "inbox-1". Custom folders may not use this prefix.
const defaultNoteFolderUIDPrefix = "inbox-"

// ensureDefaultNoteFolder creates the system default folder for the user if it
// does not already exist. It is idempotent.
func (s *APIV1Service) ensureDefaultNoteFolder(ctx context.Context, userID int32) (*store.NoteFolder, error) {
	isDefault := true
	folder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{CreatorID: &userID, IsDefault: &isDefault})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get default note folder")
	}
	if folder != nil {
		return folder, nil
	}
	return s.Store.CreateNoteFolder(ctx, &store.NoteFolder{
		UID:       fmt.Sprintf("%s%d", defaultNoteFolderUIDPrefix, userID),
		CreatorID: userID,
		Name:      "My Notes",
		IsDefault: true,
	})
}

// CreateNoteFolder creates a note folder.
func (s *APIV1Service) CreateNoteFolder(ctx context.Context, request *v1pb.CreateNoteFolderRequest) (*v1pb.NoteFolder, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	folderUID, err := ValidateAndGenerateUID(request.NoteFolderId)
	if err != nil {
		return nil, err
	}
	if strings.HasPrefix(folderUID, defaultNoteFolderUIDPrefix) {
		return nil, status.Errorf(codes.InvalidArgument, "note folder ID %q is reserved for the system default folder", folderUID)
	}
	title := strings.TrimSpace(request.NoteFolder.Title)
	if title == "" {
		return nil, status.Errorf(codes.InvalidArgument, "title is required")
	}

	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}

	create := &store.NoteFolder{
		UID:       folderUID,
		CreatorID: user.ID,
		Name:      title,
		Shared:    request.NoteFolder.Shared,
	}
	if parent := request.NoteFolder.GetParent(); parent != "" {
		parentUID, err := ExtractNoteFolderUIDFromName(parent)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid parent name: %v", err)
		}
		parentFolder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{UID: &parentUID})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get parent folder")
		}
		if parentFolder == nil {
			return nil, status.Errorf(codes.NotFound, "parent folder not found")
		}
		if err := s.checkNoteFolderWriteAccess(ctx, parentFolder); err != nil {
			return nil, err
		}
		create.ParentID = &parentFolder.ID
	}

	folder, err := s.Store.CreateNoteFolder(ctx, create)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, status.Errorf(codes.AlreadyExists, "note folder with ID %q already exists", folderUID)
		}
		return nil, status.Errorf(codes.Internal, "failed to create note folder: %v", err)
	}

	return s.convertNoteFolderFromStore(ctx, folder, folderNameFromID(folder.ParentID, foldersMap))
}

// ListNoteFolders lists note folders visible to the current user.
func (s *APIV1Service) ListNoteFolders(ctx context.Context, request *v1pb.ListNoteFoldersRequest) (*v1pb.ListNoteFoldersResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}

	accessible := make([]*store.NoteFolder, 0, len(foldersMap))
	for _, folder := range foldersMap {
		if folder.CreatorID == user.ID || noteFolderIsInSharedWorkspace(&folder.ID, foldersMap) {
			accessible = append(accessible, folder)
		}
	}
	sortNoteFoldersByCreatedTs(accessible)

	// Optional parent filter.
	if request.Parent != "" {
		filtered := make([]*store.NoteFolder, 0, len(accessible))
		if request.Parent == "-" {
			for _, folder := range accessible {
				if folder.ParentID == nil {
					filtered = append(filtered, folder)
				}
			}
		} else {
			parentUID, err := ExtractNoteFolderUIDFromName(request.Parent)
			if err != nil {
				return nil, status.Errorf(codes.InvalidArgument, "invalid parent name: %v", err)
			}
			for _, folder := range accessible {
				if folder.ParentID == nil {
					continue
				}
				parent, ok := foldersMap[*folder.ParentID]
				if ok && parent.UID == parentUID {
					filtered = append(filtered, folder)
				}
			}
		}
		accessible = filtered
	}

	folderMessages := make([]*v1pb.NoteFolder, 0, len(accessible))
	for _, folder := range accessible {
		folderMessage, err := s.convertNoteFolderFromStore(ctx, folder, folderNameFromID(folder.ParentID, foldersMap))
		if err != nil {
			return nil, errors.Wrap(err, "failed to convert note folder")
		}
		folderMessages = append(folderMessages, folderMessage)
	}
	return &v1pb.ListNoteFoldersResponse{NoteFolders: folderMessages}, nil
}

// UpdateNoteFolder updates a note folder.
func (s *APIV1Service) UpdateNoteFolder(ctx context.Context, request *v1pb.UpdateNoteFolderRequest) (*v1pb.NoteFolder, error) {
	folderUID, err := ExtractNoteFolderUIDFromName(request.NoteFolder.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note folder name: %v", err)
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "update mask is required")
	}

	folder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note folder")
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "note folder not found")
	}
	if err := s.checkNoteFolderWriteAccess(ctx, folder); err != nil {
		return nil, err
	}
	if folder.IsDefault {
		return nil, status.Errorf(codes.InvalidArgument, "the default note folder cannot be modified")
	}
	foldersMap, err := s.listNoteFoldersMap(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list note folders")
	}

	update := &store.UpdateNoteFolder{ID: folder.ID}
	for _, path := range request.UpdateMask.Paths {
		switch path {
		case "title":
			title := strings.TrimSpace(request.NoteFolder.Title)
			if title == "" {
				return nil, status.Errorf(codes.InvalidArgument, "title is required")
			}
			update.Name = &title
		case "shared":
			shared := request.NoteFolder.Shared
			update.Shared = &shared
		case "parent":
			parentName := request.NoteFolder.GetParent()
			if parentName == "" {
				update.MoveToRoot = true
			} else {
				parentUID, err := ExtractNoteFolderUIDFromName(parentName)
				if err != nil {
					return nil, status.Errorf(codes.InvalidArgument, "invalid parent name: %v", err)
				}
				parentFolder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{UID: &parentUID})
				if err != nil {
					return nil, status.Errorf(codes.Internal, "failed to get parent folder")
				}
				if parentFolder == nil {
					return nil, status.Errorf(codes.NotFound, "parent folder not found")
				}
				if parentFolder.ID == folder.ID {
					return nil, status.Errorf(codes.InvalidArgument, "a folder cannot be its own parent")
				}
				// 校验目标父文件夹的可写权限，与 CreateNoteFolder 保持一致。
				if err := s.checkNoteFolderWriteAccess(ctx, parentFolder); err != nil {
					return nil, err
				}
				// 防止循环引用：目标不能是当前文件夹自身或其后代。
				visited := make(map[int32]bool)
				for curID := parentFolder.ID; curID != 0; {
					if visited[curID] {
						break
					}
					visited[curID] = true
					if curID == folder.ID {
						return nil, status.Errorf(codes.InvalidArgument, "a folder cannot be moved under its own descendant")
					}
					cur := foldersMap[curID]
					if cur == nil || cur.ParentID == nil {
						break
					}
					curID = *cur.ParentID
				}
				update.ParentID = &parentFolder.ID
			}
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported update path %q", path)
		}
	}

	now := timeNowUnix()
	update.UpdatedTs = &now
	if err := s.Store.UpdateNoteFolder(ctx, update); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update note folder: %v", err)
	}

	updated, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{ID: &folder.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get updated note folder")
	}
	return s.convertNoteFolderFromStore(ctx, updated, folderNameFromID(updated.ParentID, foldersMap))
}

// DeleteNoteFolder deletes a note folder and everything under it.
func (s *APIV1Service) DeleteNoteFolder(ctx context.Context, request *v1pb.DeleteNoteFolderRequest) (*emptypb.Empty, error) {
	folderUID, err := ExtractNoteFolderUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid note folder name: %v", err)
	}
	folder, err := s.Store.GetNoteFolder(ctx, &store.FindNoteFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get note folder")
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "note folder not found")
	}
	if err := s.checkNoteFolderWriteAccess(ctx, folder); err != nil {
		return nil, err
	}
	if folder.IsDefault {
		return nil, status.Errorf(codes.InvalidArgument, "the default note folder cannot be deleted")
	}
	if err := s.Store.DeleteNoteFolder(ctx, &store.DeleteNoteFolder{ID: folder.ID}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete note folder: %v", err)
	}
	return &emptypb.Empty{}, nil
}
