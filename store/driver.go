package store

import (
	"context"
	"database/sql"
)

// Driver is an interface for store driver.
// It contains all methods that store database driver should implement.
type Driver interface {
	GetDB() *sql.DB
	Close() error

	IsInitialized(ctx context.Context) (bool, error)

	// GetDatabaseSize returns the database size in bytes, or -1 if unavailable.
	// A non-nil error indicates a hard failure; -1 with nil error means the
	// driver cannot report a size from the underlying database.
	GetDatabaseSize(ctx context.Context) (int64, error)

	// Attachment model related methods.
	CreateAttachment(ctx context.Context, create *Attachment) (*Attachment, error)
	ListAttachments(ctx context.Context, find *FindAttachment) ([]*Attachment, error)
	UpdateAttachment(ctx context.Context, update *UpdateAttachment) error
	DeleteAttachment(ctx context.Context, delete *DeleteAttachment) error
	DeleteAttachments(ctx context.Context, deletes []*DeleteAttachment) error

	// Memo model related methods.
	CreateMemo(ctx context.Context, create *Memo) (*Memo, error)
	ListMemos(ctx context.Context, find *FindMemo) ([]*Memo, error)
	UpdateMemo(ctx context.Context, update *UpdateMemo) error
	DeleteMemo(ctx context.Context, delete *DeleteMemo) error

	// MemoRelation model related methods.
	UpsertMemoRelation(ctx context.Context, create *MemoRelation) (*MemoRelation, error)
	ListMemoRelations(ctx context.Context, find *FindMemoRelation) ([]*MemoRelation, error)
	DeleteMemoRelation(ctx context.Context, delete *DeleteMemoRelation) error

	// InstanceSetting model related methods.
	UpsertInstanceSetting(ctx context.Context, upsert *InstanceSetting) (*InstanceSetting, error)
	ListInstanceSettings(ctx context.Context, find *FindInstanceSetting) ([]*InstanceSetting, error)
	DeleteInstanceSetting(ctx context.Context, delete *DeleteInstanceSetting) error

	// User model related methods.
	CreateUser(ctx context.Context, create *User) (*User, error)
	UpdateUser(ctx context.Context, update *UpdateUser) (*User, error)
	ListUsers(ctx context.Context, find *FindUser) ([]*User, error)
	DeleteUser(ctx context.Context, delete *DeleteUser) (*DeleteUserResult, error)

	// UserSetting model related methods.
	UpsertUserSetting(ctx context.Context, upsert *UserSetting) (*UserSetting, error)
	ListUserSettings(ctx context.Context, find *FindUserSetting) ([]*UserSetting, error)
	DeleteUserSettings(ctx context.Context, delete *DeleteUserSetting) error
	GetUserByPATHash(ctx context.Context, tokenHash string) (*PATQueryResult, error)

	// IdentityProvider model related methods.
	CreateIdentityProvider(ctx context.Context, create *IdentityProvider) (*IdentityProvider, error)
	ListIdentityProviders(ctx context.Context, find *FindIdentityProvider) ([]*IdentityProvider, error)
	UpdateIdentityProvider(ctx context.Context, update *UpdateIdentityProvider) (*IdentityProvider, error)
	DeleteIdentityProvider(ctx context.Context, delete *DeleteIdentityProvider) error

	// Inbox model related methods.
	CreateInbox(ctx context.Context, create *Inbox) (*Inbox, error)
	ListInboxes(ctx context.Context, find *FindInbox) ([]*Inbox, error)
	UpdateInbox(ctx context.Context, update *UpdateInbox) (*Inbox, error)
	DeleteInbox(ctx context.Context, delete *DeleteInbox) error

	// Reaction model related methods.
	UpsertReaction(ctx context.Context, create *Reaction) (*Reaction, error)
	ListReactions(ctx context.Context, find *FindReaction) ([]*Reaction, error)
	GetReaction(ctx context.Context, find *FindReaction) (*Reaction, error)
	DeleteReaction(ctx context.Context, delete *DeleteReaction) error

	// MemoShare model related methods.
	CreateMemoShare(ctx context.Context, create *MemoShare) (*MemoShare, error)
	ListMemoShares(ctx context.Context, find *FindMemoShare) ([]*MemoShare, error)
	GetMemoShare(ctx context.Context, find *FindMemoShare) (*MemoShare, error)
	DeleteMemoShare(ctx context.Context, delete *DeleteMemoShare) error

	// UserIdentity model related methods.
	CreateUserIdentity(ctx context.Context, create *UserIdentity) (*UserIdentity, error)
	ListUserIdentities(ctx context.Context, find *FindUserIdentity) ([]*UserIdentity, error)
	DeleteUserIdentities(ctx context.Context, delete *DeleteUserIdentity) error

	// Note model related methods.
	CreateNote(ctx context.Context, create *Note) (*Note, error)
	ListNotes(ctx context.Context, find *FindNote) ([]*Note, error)
	ListNoteCreatedTs(ctx context.Context, find *FindNote) ([]int64, error)
	UpdateNote(ctx context.Context, update *UpdateNote) error
	DeleteNote(ctx context.Context, delete *DeleteNote) error

	// NoteFolder model related methods.
	CreateNoteFolder(ctx context.Context, create *NoteFolder) (*NoteFolder, error)
	ListNoteFolders(ctx context.Context, find *FindNoteFolder) ([]*NoteFolder, error)
	UpdateNoteFolder(ctx context.Context, update *UpdateNoteFolder) error
	DeleteNoteFolder(ctx context.Context, delete *DeleteNoteFolder) error

	// NoteLink model related methods.
	UpsertNoteLink(ctx context.Context, create *NoteLink) (*NoteLink, error)
	ListNoteLinks(ctx context.Context, find *FindNoteLink) ([]*NoteLink, error)
	DeleteNoteLinks(ctx context.Context, delete *DeleteNoteLink) error

	// NoteTag model related methods.
	UpsertNoteTag(ctx context.Context, create *NoteTag) (*NoteTag, error)
	ListNoteTags(ctx context.Context, find *FindNoteTag) ([]*NoteTag, error)
	DeleteNoteTags(ctx context.Context, delete *DeleteNoteTag) error

	// SetNoteRelations atomically replaces the links and tags for a note.
	SetNoteRelations(ctx context.Context, noteID int32, links []*NoteLink, tags []*NoteTag) error

	// DeleteNoteWithRelations deletes a note and its link/tag relations
	// atomically. Incoming links pointing at the note are degraded to
	// UNRESOLVED.
	DeleteNoteWithRelations(ctx context.Context, noteID int32) error

	// DeleteNoteFoldersAndNotes deletes the given note folders and notes
	// atomically, including their link/tag relations.
	DeleteNoteFoldersAndNotes(ctx context.Context, folderIDs []int32, noteIDs []int32) error
}
