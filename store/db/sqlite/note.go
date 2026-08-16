package sqlite

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateNote(ctx context.Context, create *store.Note) (*store.Note, error) {
	fields := []string{"`uid`", "`creator_id`", "`title`", "`content`"}
	placeholders := []string{"?", "?", "?", "?"}
	args := []any{create.UID, create.CreatorID, create.Title, create.Content}
	if create.FolderID != nil {
		fields = append(fields, "`folder_id`")
		placeholders = append(placeholders, "?")
		args = append(args, *create.FolderID)
	}
	if create.CreatedTs != 0 {
		fields = append(fields, "`created_ts`")
		placeholders = append(placeholders, "?")
		args = append(args, create.CreatedTs)
	}
	if create.UpdatedTs != 0 {
		fields = append(fields, "`updated_ts`")
		placeholders = append(placeholders, "?")
		args = append(args, create.UpdatedTs)
	}

	stmt := "INSERT INTO `note` (" + strings.Join(fields, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ") RETURNING `id`, `created_ts`, `updated_ts`, `row_status`"
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

// buildNoteQuery builds the shared JOIN/WHERE parts for note queries.
func buildNoteQuery(find *store.FindNote) (join []string, joinArgs []any, where []string, args []any) {
	join, joinArgs = []string{}, []any{}
	where, args = []string{"1 = 1"}, []any{}

	if find.Tag != nil {
		join = append(join, "JOIN `note_tag` ON `note_tag`.`note_id` = `note`.`id` AND `note_tag`.`tag` = ?")
		joinArgs = append(joinArgs, *find.Tag)
	}

	if v := find.ID; v != nil {
		where, args = append(where, "`note`.`id` = ?"), append(args, *v)
	}
	if len(find.IDList) > 0 {
		placeholders := make([]string, 0, len(find.IDList))
		for range find.IDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note`.`id` IN ("+strings.Join(placeholders, ",")+")")
		for _, id := range find.IDList {
			args = append(args, id)
		}
	}
	if v := find.UID; v != nil {
		where, args = append(where, "`note`.`uid` = ?"), append(args, *v)
	}
	if len(find.UIDList) > 0 {
		placeholders := make([]string, 0, len(find.UIDList))
		for range find.UIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note`.`uid` IN ("+strings.Join(placeholders, ",")+")")
		for _, uid := range find.UIDList {
			args = append(args, uid)
		}
	}
	if v := find.RowStatus; v != nil {
		where, args = append(where, "`note`.`row_status` = ?"), append(args, *v)
	}

	// Access filter: creator_id = ? OR folder_id IN (...).
	switch {
	case find.CreatorID != nil && len(find.AccessibleFolderIDList) > 0:
		placeholders := make([]string, 0, len(find.AccessibleFolderIDList))
		for range find.AccessibleFolderIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, fmt.Sprintf("(`note`.`creator_id` = ? OR `note`.`folder_id` IN (%s))", strings.Join(placeholders, ",")))
		args = append(args, *find.CreatorID)
		for _, folderID := range find.AccessibleFolderIDList {
			args = append(args, folderID)
		}
	case find.CreatorID != nil:
		where, args = append(where, "`note`.`creator_id` = ?"), append(args, *find.CreatorID)
	case len(find.AccessibleFolderIDList) > 0:
		placeholders := make([]string, 0, len(find.AccessibleFolderIDList))
		for range find.AccessibleFolderIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note`.`folder_id` IN ("+strings.Join(placeholders, ",")+")")
		for _, folderID := range find.AccessibleFolderIDList {
			args = append(args, folderID)
		}
	default:
		// No access filter applied.
	}

	if find.FolderIDSet {
		if find.FolderID == nil {
			where = append(where, "`note`.`folder_id` IS NULL")
		} else {
			where, args = append(where, "`note`.`folder_id` = ?"), append(args, *find.FolderID)
		}
	}
	if len(find.FolderIDList) > 0 {
		placeholders := make([]string, 0, len(find.FolderIDList))
		for range find.FolderIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note`.`folder_id` IN ("+strings.Join(placeholders, ",")+")")
		for _, folderID := range find.FolderIDList {
			args = append(args, folderID)
		}
	}
	if v := find.Title; v != nil {
		where, args = append(where, "`note`.`title` = ?"), append(args, *v)
	}
	if len(find.TitleList) > 0 {
		placeholders := make([]string, 0, len(find.TitleList))
		for range find.TitleList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note`.`title` IN ("+strings.Join(placeholders, ",")+")")
		for _, title := range find.TitleList {
			args = append(args, title)
		}
	}
	if v := find.TitleSearch; v != nil {
		where, args = append(where, "`note`.`title` LIKE ?"), append(args, "%"+*v+"%")
	}
	if v := find.CreatedTsAfter; v != nil {
		where, args = append(where, "`note`.`created_ts` >= ?"), append(args, *v)
	}
	if v := find.CreatedTsBefore; v != nil {
		where, args = append(where, "`note`.`created_ts` < ?"), append(args, *v)
	}

	return join, joinArgs, where, args
}

func (d *DB) ListNotes(ctx context.Context, find *store.FindNote) ([]*store.Note, error) {
	join, joinArgs, where, args := buildNoteQuery(find)

	order := "DESC"
	if find.OrderByTimeAsc {
		order = "ASC"
	}
	orderBy := []string{}
	if find.OrderByUpdatedTs {
		orderBy = append(orderBy, "`note`.`updated_ts` "+order)
	} else {
		orderBy = append(orderBy, "`note`.`created_ts` "+order)
	}
	orderBy = append(orderBy, "`note`.`id` DESC")

	fields := []string{
		"`note`.`id` AS `id`",
		"`note`.`uid` AS `uid`",
		"`note`.`creator_id` AS `creator_id`",
		"`note`.`folder_id` AS `folder_id`",
		"`note`.`title` AS `title`",
		"`note`.`content` AS `content`",
		"`note`.`row_status` AS `row_status`",
		"`note`.`created_ts` AS `created_ts`",
		"`note`.`updated_ts` AS `updated_ts`",
	}

	query := "SELECT " + strings.Join(fields, ", ") + " FROM `note` " +
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

// ListNoteCreatedTs lists the creation timestamps of notes matching the filter.
func (d *DB) ListNoteCreatedTs(ctx context.Context, find *store.FindNote) ([]int64, error) {
	join, joinArgs, where, args := buildNoteQuery(find)

	query := "SELECT `note`.`created_ts` FROM `note` " +
		strings.Join(join, " ") +
		" WHERE " + strings.Join(where, " AND ") +
		" ORDER BY `note`.`created_ts` ASC"

	finalArgs := slices.Concat(joinArgs, args)
	rows, err := d.db.QueryContext(ctx, query, finalArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]int64, 0)
	for rows.Next() {
		var ts int64
		if err := rows.Scan(&ts); err != nil {
			return nil, err
		}
		list = append(list, ts)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) UpdateNote(ctx context.Context, update *store.UpdateNote) error {
	set, args := []string{}, []any{}
	if v := update.Title; v != nil {
		set, args = append(set, "`title` = ?"), append(args, *v)
	}
	if v := update.Content; v != nil {
		set, args = append(set, "`content` = ?"), append(args, *v)
	}
	if v := update.RowStatus; v != nil {
		set, args = append(set, "`row_status` = ?"), append(args, *v)
	}
	if v := update.UpdatedTs; v != nil {
		set, args = append(set, "`updated_ts` = ?"), append(args, *v)
	}
	if update.MoveToRoot {
		set = append(set, "`folder_id` = NULL")
	} else if update.FolderID != nil {
		set, args = append(set, "`folder_id` = ?"), append(args, *update.FolderID)
	}
	if len(set) == 0 {
		return nil
	}
	args = append(args, update.ID)

	stmt := "UPDATE `note` SET " + strings.Join(set, ", ") + " WHERE `id` = ?"
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
	if _, err := tx.ExecContext(ctx, "UPDATE `note_link` SET `target_type` = ?, `target_id` = NULL WHERE `target_type` = ? AND `target_id` = ?", store.NoteLinkTargetUnresolved, store.NoteLinkTargetNote, noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM `note_link` WHERE `note_id` = ?", noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM `note_tag` WHERE `note_id` = ?", noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM `note` WHERE `id` = ?", noteID); err != nil {
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
		notePlaceholders := strings.TrimSuffix(strings.Repeat("?,", len(noteIDs)), ",")
		noteArgs := make([]any, 0, len(noteIDs))
		for _, id := range noteIDs {
			noteArgs = append(noteArgs, id)
		}
		// Degrade incoming links that point to the deleted notes.
		stmt := "UPDATE `note_link` SET `target_type` = ?, `target_id` = NULL WHERE `target_type` = ? AND `target_id` IN (" + notePlaceholders + ")"
		args := append([]any{store.NoteLinkTargetUnresolved, store.NoteLinkTargetNote}, noteArgs...)
		if _, err := tx.ExecContext(ctx, stmt, args...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM `note_link` WHERE `note_id` IN ("+notePlaceholders+")", noteArgs...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM `note_tag` WHERE `note_id` IN ("+notePlaceholders+")", noteArgs...); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM `note` WHERE `id` IN ("+notePlaceholders+")", noteArgs...); err != nil {
			return err
		}
	}
	if len(folderIDs) > 0 {
		folderPlaceholders := strings.TrimSuffix(strings.Repeat("?,", len(folderIDs)), ",")
		folderArgs := make([]any, 0, len(folderIDs))
		for _, id := range folderIDs {
			folderArgs = append(folderArgs, id)
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM `note_folder` WHERE `id` IN ("+folderPlaceholders+")", folderArgs...); err != nil {
			return err
		}
	}
	return tx.Commit()
}
