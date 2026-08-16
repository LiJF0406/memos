package sqlite

import (
	"context"
	"strings"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateNoteFolder(ctx context.Context, create *store.NoteFolder) (*store.NoteFolder, error) {
	fields := []string{"`uid`", "`creator_id`", "`name`", "`shared`"}
	placeholders := []string{"?", "?", "?", "?"}
	args := []any{create.UID, create.CreatorID, create.Name, create.Shared}
	if create.ParentID != nil {
		fields = append(fields, "`parent_id`")
		placeholders = append(placeholders, "?")
		args = append(args, *create.ParentID)
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

	stmt := "INSERT INTO `note_folder` (" + strings.Join(fields, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ") RETURNING `id`, `created_ts`, `updated_ts`, `row_status`"
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

func (d *DB) ListNoteFolders(ctx context.Context, find *store.FindNoteFolder) ([]*store.NoteFolder, error) {
	where, args := []string{"1 = 1"}, []any{}
	if v := find.ID; v != nil {
		where, args = append(where, "`note_folder`.`id` = ?"), append(args, *v)
	}
	if len(find.IDList) > 0 {
		placeholders := make([]string, 0, len(find.IDList))
		for range find.IDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note_folder`.`id` IN ("+strings.Join(placeholders, ",")+")")
		for _, id := range find.IDList {
			args = append(args, id)
		}
	}
	if v := find.UID; v != nil {
		where, args = append(where, "`note_folder`.`uid` = ?"), append(args, *v)
	}
	if len(find.UIDList) > 0 {
		placeholders := make([]string, 0, len(find.UIDList))
		for range find.UIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note_folder`.`uid` IN ("+strings.Join(placeholders, ",")+")")
		for _, uid := range find.UIDList {
			args = append(args, uid)
		}
	}
	if v := find.RowStatus; v != nil {
		where, args = append(where, "`note_folder`.`row_status` = ?"), append(args, *v)
	}
	if v := find.CreatorID; v != nil {
		where, args = append(where, "`note_folder`.`creator_id` = ?"), append(args, *v)
	}
	if find.ParentIDSet {
		if find.ParentID == nil {
			where = append(where, "`note_folder`.`parent_id` IS NULL")
		} else {
			where, args = append(where, "`note_folder`.`parent_id` = ?"), append(args, *find.ParentID)
		}
	}

	query := "SELECT `note_folder`.`id`, `note_folder`.`uid`, `note_folder`.`creator_id`, `note_folder`.`parent_id`, `note_folder`.`name`, `note_folder`.`shared`, `note_folder`.`row_status`, `note_folder`.`created_ts`, `note_folder`.`updated_ts` FROM `note_folder` WHERE " +
		strings.Join(where, " AND ") + " ORDER BY `note_folder`.`created_ts` ASC, `note_folder`.`id` ASC"

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*store.NoteFolder, 0)
	for rows.Next() {
		folder := &store.NoteFolder{}
		if err := rows.Scan(
			&folder.ID,
			&folder.UID,
			&folder.CreatorID,
			&folder.ParentID,
			&folder.Name,
			&folder.Shared,
			&folder.RowStatus,
			&folder.CreatedTs,
			&folder.UpdatedTs,
		); err != nil {
			return nil, err
		}
		list = append(list, folder)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) UpdateNoteFolder(ctx context.Context, update *store.UpdateNoteFolder) error {
	set, args := []string{}, []any{}
	if v := update.Name; v != nil {
		set, args = append(set, "`name` = ?"), append(args, *v)
	}
	if v := update.Shared; v != nil {
		set, args = append(set, "`shared` = ?"), append(args, *v)
	}
	if v := update.RowStatus; v != nil {
		set, args = append(set, "`row_status` = ?"), append(args, *v)
	}
	if v := update.UpdatedTs; v != nil {
		set, args = append(set, "`updated_ts` = ?"), append(args, *v)
	}
	if update.MoveToRoot {
		set = append(set, "`parent_id` = NULL")
	} else if update.ParentID != nil {
		set, args = append(set, "`parent_id` = ?"), append(args, *update.ParentID)
	}
	if len(set) == 0 {
		return nil
	}
	args = append(args, update.ID)

	stmt := "UPDATE `note_folder` SET " + strings.Join(set, ", ") + " WHERE `id` = ?"
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) DeleteNoteFolder(ctx context.Context, delete *store.DeleteNoteFolder) error {
	stmt := "DELETE FROM `note_folder` WHERE `id` = ?"
	_, err := d.db.ExecContext(ctx, stmt, delete.ID)
	return err
}
