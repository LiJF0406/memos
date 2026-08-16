package postgres

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateNote(ctx context.Context, create *store.Note) (*store.Note, error) {
	fields := []string{"uid", "creator_id", "title", "content"}
	args := []any{create.UID, create.CreatorID, create.Title, create.Content}
	if create.FolderID != nil {
		fields = append(fields, "folder_id")
		args = append(args, *create.FolderID)
	}
	if create.CreatedTs != 0 {
		fields = append(fields, "created_ts")
		args = append(args, create.CreatedTs)
	}
	if create.UpdatedTs != 0 {
		fields = append(fields, "updated_ts")
		args = append(args, create.UpdatedTs)
	}

	stmt := "INSERT INTO note (" + strings.Join(fields, ", ") + ") VALUES (" + placeholders(len(args)) + ") RETURNING id, created_ts, updated_ts, row_status"
	if err := d.db.QueryRowContext(ctx, stmt, args...).Scan(
		&create.ID,
		&create.CreatedTs,
		&create.UpdatedTs,
		&create.RowStatus,
	); err != nil {
		return nil, err
	}
	return create, nil
}

func (d *DB) ListNotes(ctx context.Context, find *store.FindNote) ([]*store.Note, error) {
	join := []string{}
	joinArgs := []any{}
	where, args := []string{"1 = 1"}, []any{}

	if find.Tag != nil {
		join = append(join, "JOIN note_tag ON note_tag.note_id = note.id AND note_tag.tag = "+placeholder(len(joinArgs)+1))
		joinArgs = append(joinArgs, *find.Tag)
	}

	if v := find.ID; v != nil {
		where, args = append(where, "note.id = "+placeholder(len(joinArgs)+len(args)+1)), append(args, *v)
	}
	if len(find.IDList) > 0 {
		holders := make([]string, 0, len(find.IDList))
		for _, id := range find.IDList {
			holders = append(holders, placeholder(len(joinArgs)+len(args)+1))
			args = append(args, id)
		}
		where = append(where, "note.id IN ("+strings.Join(holders, ", ")+")")
	}
	if v := find.UID; v != nil {
		where, args = append(where, "note.uid = "+placeholder(len(joinArgs)+len(args)+1)), append(args, *v)
	}
	if len(find.UIDList) > 0 {
		holders := make([]string, 0, len(find.UIDList))
		for _, uid := range find.UIDList {
			holders = append(holders, placeholder(len(joinArgs)+len(args)+1))
			args = append(args, uid)
		}
		where = append(where, "note.uid IN ("+strings.Join(holders, ", ")+")")
	}
	if v := find.RowStatus; v != nil {
		where, args = append(where, "note.row_status = "+placeholder(len(joinArgs)+len(args)+1)), append(args, *v)
	}

	switch {
	case find.CreatorID != nil && len(find.AccessibleFolderIDList) > 0:
		args = append(args, *find.CreatorID)
		creatorPlaceholder := placeholder(len(joinArgs) + len(args))
		holders := make([]string, 0, len(find.AccessibleFolderIDList))
		for _, folderID := range find.AccessibleFolderIDList {
			holders = append(holders, placeholder(len(joinArgs)+len(args)+1))
			args = append(args, folderID)
		}
		where = append(where, fmt.Sprintf("(note.creator_id = %s OR note.folder_id IN (%s))", creatorPlaceholder, strings.Join(holders, ", ")))
	case find.CreatorID != nil:
		where, args = append(where, "note.creator_id = "+placeholder(len(joinArgs)+len(args)+1)), append(args, *find.CreatorID)
	case len(find.AccessibleFolderIDList) > 0:
		holders := make([]string, 0, len(find.AccessibleFolderIDList))
		for _, folderID := range find.AccessibleFolderIDList {
			holders = append(holders, placeholder(len(joinArgs)+len(args)+1))
			args = append(args, folderID)
		}
		where = append(where, "note.folder_id IN ("+strings.Join(holders, ", ")+")")
	default:
		// No access filter applied.
	}

	if find.FolderIDSet {
		if find.FolderID == nil {
			where = append(where, "note.folder_id IS NULL")
		} else {
			where, args = append(where, "note.folder_id = "+placeholder(len(joinArgs)+len(args)+1)), append(args, *find.FolderID)
		}
	}
	if len(find.FolderIDList) > 0 {
		holders := make([]string, 0, len(find.FolderIDList))
		for _, folderID := range find.FolderIDList {
			holders = append(holders, placeholder(len(joinArgs)+len(args)+1))
			args = append(args, folderID)
		}
		where = append(where, "note.folder_id IN ("+strings.Join(holders, ", ")+")")
	}
	if v := find.Title; v != nil {
		where, args = append(where, "note.title = "+placeholder(len(joinArgs)+len(args)+1)), append(args, *v)
	}
	if len(find.TitleList) > 0 {
		holders := make([]string, 0, len(find.TitleList))
		for _, title := range find.TitleList {
			holders = append(holders, placeholder(len(joinArgs)+len(args)+1))
			args = append(args, title)
		}
		where = append(where, "note.title IN ("+strings.Join(holders, ", ")+")")
	}
	if v := find.TitleSearch; v != nil {
		where, args = append(where, "note.title ILIKE "+placeholder(len(joinArgs)+len(args)+1)), append(args, "%"+*v+"%")
	}

	order := "DESC"
	if find.OrderByTimeAsc {
		order = "ASC"
	}
	orderBy := []string{}
	if find.OrderByUpdatedTs {
		orderBy = append(orderBy, "note.updated_ts "+order)
	} else {
		orderBy = append(orderBy, "note.created_ts "+order)
	}
	orderBy = append(orderBy, "note.id DESC")

	fields := []string{
		"note.id AS id",
		"note.uid AS uid",
		"note.creator_id AS creator_id",
		"note.folder_id AS folder_id",
		"note.title AS title",
		"note.content AS content",
		"note.row_status AS row_status",
		"note.created_ts AS created_ts",
		"note.updated_ts AS updated_ts",
	}

	query := "SELECT " + strings.Join(fields, ", ") + " FROM note " +
		strings.Join(join, " ") +
		" WHERE " + strings.Join(where, " AND ") +
		" ORDER BY " + strings.Join(orderBy, ", ")
	if find.Limit != nil {
		query = fmt.Sprintf("%s LIMIT %d", query, *find.Limit)
		if find.Offset != nil {
			query = fmt.Sprintf("%s OFFSET %d", query, *find.Offset)
		}
	}

	finalArgs := slices.Concat(joinArgs, args)
	rows, err := d.db.QueryContext(ctx, query, finalArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*store.Note, 0)
	for rows.Next() {
		note := &store.Note{}
		if err := rows.Scan(
			&note.ID,
			&note.UID,
			&note.CreatorID,
			&note.FolderID,
			&note.Title,
			&note.Content,
			&note.RowStatus,
			&note.CreatedTs,
			&note.UpdatedTs,
		); err != nil {
			return nil, err
		}
		list = append(list, note)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) UpdateNote(ctx context.Context, update *store.UpdateNote) error {
	set, args := []string{}, []any{}
	if v := update.Title; v != nil {
		set, args = append(set, "title = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := update.Content; v != nil {
		set, args = append(set, "content = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := update.RowStatus; v != nil {
		set, args = append(set, "row_status = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := update.UpdatedTs; v != nil {
		set, args = append(set, "updated_ts = "+placeholder(len(args)+1)), append(args, *v)
	}
	if update.MoveToRoot {
		set = append(set, "folder_id = NULL")
	} else if update.FolderID != nil {
		set, args = append(set, "folder_id = "+placeholder(len(args)+1)), append(args, *update.FolderID)
	}
	if len(set) == 0 {
		return nil
	}
	args = append(args, update.ID)

	stmt := "UPDATE note SET " + strings.Join(set, ", ") + " WHERE id = " + placeholder(len(args))
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) DeleteNote(ctx context.Context, delete *store.DeleteNote) error {
	return d.DeleteNoteWithRelations(ctx, delete.ID)
}

// DeleteNoteWithRelations deletes a note and its link/tag relations atomically.
func (d *DB) DeleteNoteWithRelations(ctx context.Context, noteID int32) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Degrade incoming links that point to the deleted note.
	if _, err := tx.ExecContext(ctx, "UPDATE note_link SET target_type = "+placeholder(1)+", target_id = NULL WHERE target_type = "+placeholder(2)+" AND target_id = "+placeholder(3), store.NoteLinkTargetUnresolved, store.NoteLinkTargetNote, noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM note_link WHERE note_id = "+placeholder(1), noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM note_tag WHERE note_id = "+placeholder(1), noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM note WHERE id = "+placeholder(1), noteID); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteNoteFoldersAndNotes deletes the given note folders and notes atomically.
func (d *DB) DeleteNoteFoldersAndNotes(ctx context.Context, folderIDs []int32, noteIDs []int32) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if len(noteIDs) > 0 {
		args := []any{store.NoteLinkTargetUnresolved, store.NoteLinkTargetNote}
		noteHolders := make([]string, 0, len(noteIDs))
		for _, id := range noteIDs {
			args = append(args, id)
			noteHolders = append(noteHolders, placeholder(len(args)))
		}
		notePlaceholders := strings.Join(noteHolders, ", ")

		// Degrade incoming links that point to the deleted notes.
		stmt := "UPDATE note_link SET target_type = " + placeholder(1) + ", target_id = NULL WHERE target_type = " + placeholder(2) + " AND target_id IN (" + notePlaceholders + ")"
		if _, err := tx.ExecContext(ctx, stmt, args...); err != nil {
			return err
		}
		noteIDArgs := args[2:]
		if _, err := tx.ExecContext(ctx, "DELETE FROM note_link WHERE note_id IN ("+placeholders(len(noteIDs))+")", noteIDArgs...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM note_tag WHERE note_id IN ("+placeholders(len(noteIDs))+")", noteIDArgs...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM note WHERE id IN ("+placeholders(len(noteIDs))+")", noteIDArgs...); err != nil {
			return err
		}
	}
	if len(folderIDs) > 0 {
		folderArgs := make([]any, 0, len(folderIDs))
		for _, id := range folderIDs {
			folderArgs = append(folderArgs, id)
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM note_folder WHERE id IN ("+placeholders(len(folderIDs))+")", folderArgs...); err != nil {
			return err
		}
	}
	return tx.Commit()
}
