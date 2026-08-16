package mysql

import (
	"context"
	"strconv"
	"strings"

	"github.com/usememos/memos/store"
)

func (d *DB) UpsertNoteLink(ctx context.Context, create *store.NoteLink) (*store.NoteLink, error) {
	stmt := "INSERT INTO `note_link` (`note_id`, `target_type`, `target_id`, `target_title`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE `target_title` = `target_title`"
	_, err := d.db.ExecContext(ctx, stmt, create.NoteID, create.TargetType, create.TargetID, create.TargetTitle)
	if err != nil {
		return nil, err
	}
	link := &store.NoteLink{
		NoteID:      create.NoteID,
		TargetType:  create.TargetType,
		TargetID:    create.TargetID,
		TargetTitle: create.TargetTitle,
	}
	return link, nil
}

func (d *DB) ListNoteLinks(ctx context.Context, find *store.FindNoteLink) ([]*store.NoteLink, error) {
	where, args := []string{"1 = 1"}, []any{}
	if v := find.NoteID; v != nil {
		where, args = append(where, "`note_id` = ?"), append(args, *v)
	}
	if len(find.NoteIDList) > 0 {
		placeholders := make([]string, 0, len(find.NoteIDList))
		for range find.NoteIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note_id` IN ("+strings.Join(placeholders, ",")+")")
		for _, id := range find.NoteIDList {
			args = append(args, id)
		}
	}
	if v := find.TargetType; v != nil {
		where, args = append(where, "`target_type` = ?"), append(args, *v)
	}
	if v := find.TargetID; v != nil {
		where, args = append(where, "`target_id` = ?"), append(args, *v)
	}
	if v := find.TargetTitle; v != nil {
		where, args = append(where, "`target_title` = ?"), append(args, *v)
	}

	query := "SELECT `note_id`, `target_type`, `target_id`, `target_title`, UNIX_TIMESTAMP(`created_ts`) FROM `note_link` WHERE " +
		strings.Join(where, " AND ") + " ORDER BY `created_ts` DESC, `note_id` DESC"
	if find.Limit != nil {
		query += " LIMIT " + strconv.Itoa(*find.Limit)
		if find.Offset != nil {
			query += " OFFSET " + strconv.Itoa(*find.Offset)
		}
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*store.NoteLink, 0)
	for rows.Next() {
		link := &store.NoteLink{}
		if err := rows.Scan(
			&link.NoteID,
			&link.TargetType,
			&link.TargetID,
			&link.TargetTitle,
			&link.CreatedTs,
		); err != nil {
			return nil, err
		}
		list = append(list, link)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) DeleteNoteLinks(ctx context.Context, delete *store.DeleteNoteLink) error {
	where, args := []string{"1 = 1"}, []any{}
	if v := delete.NoteID; v != nil {
		where, args = append(where, "`note_id` = ?"), append(args, *v)
	}
	if v := delete.TargetType; v != nil {
		where, args = append(where, "`target_type` = ?"), append(args, *v)
	}
	if v := delete.TargetID; v != nil {
		where, args = append(where, "`target_id` = ?"), append(args, *v)
	}
	stmt := "DELETE FROM `note_link` WHERE " + strings.Join(where, " AND ")
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) UpsertNoteTag(ctx context.Context, create *store.NoteTag) (*store.NoteTag, error) {
	stmt := "INSERT INTO `note_tag` (`note_id`, `tag`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `tag` = `tag`"
	_, err := d.db.ExecContext(ctx, stmt, create.NoteID, create.Tag)
	if err != nil {
		return nil, err
	}
	tag := &store.NoteTag{NoteID: create.NoteID, Tag: create.Tag}
	return tag, nil
}

func (d *DB) ListNoteTags(ctx context.Context, find *store.FindNoteTag) ([]*store.NoteTag, error) {
	where, args := []string{"1 = 1"}, []any{}
	if v := find.NoteID; v != nil {
		where, args = append(where, "`note_id` = ?"), append(args, *v)
	}
	if len(find.NoteIDList) > 0 {
		placeholders := make([]string, 0, len(find.NoteIDList))
		for range find.NoteIDList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`note_id` IN ("+strings.Join(placeholders, ",")+")")
		for _, id := range find.NoteIDList {
			args = append(args, id)
		}
	}
	if v := find.Tag; v != nil {
		where, args = append(where, "`tag` = ?"), append(args, *v)
	}
	if len(find.TagList) > 0 {
		placeholders := make([]string, 0, len(find.TagList))
		for range find.TagList {
			placeholders = append(placeholders, "?")
		}
		where = append(where, "`tag` IN ("+strings.Join(placeholders, ",")+")")
		for _, tag := range find.TagList {
			args = append(args, tag)
		}
	}

	query := "SELECT `note_id`, `tag`, UNIX_TIMESTAMP(`created_ts`) FROM `note_tag` WHERE " +
		strings.Join(where, " AND ") + " ORDER BY `created_ts` DESC, `note_id` DESC"
	if find.Limit != nil {
		query += " LIMIT " + strconv.Itoa(*find.Limit)
		if find.Offset != nil {
			query += " OFFSET " + strconv.Itoa(*find.Offset)
		}
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*store.NoteTag, 0)
	for rows.Next() {
		tag := &store.NoteTag{}
		if err := rows.Scan(
			&tag.NoteID,
			&tag.Tag,
			&tag.CreatedTs,
		); err != nil {
			return nil, err
		}
		list = append(list, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) DeleteNoteTags(ctx context.Context, delete *store.DeleteNoteTag) error {
	where, args := []string{"1 = 1"}, []any{}
	if v := delete.NoteID; v != nil {
		where, args = append(where, "`note_id` = ?"), append(args, *v)
	}
	if v := delete.Tag; v != nil {
		where, args = append(where, "`tag` = ?"), append(args, *v)
	}
	stmt := "DELETE FROM `note_tag` WHERE " + strings.Join(where, " AND ")
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) SetNoteRelations(ctx context.Context, noteID int32, links []*store.NoteLink, tags []*store.NoteTag) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM `note_link` WHERE `note_id` = ?", noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM `note_tag` WHERE `note_id` = ?", noteID); err != nil {
		return err
	}
	for _, link := range links {
		if _, err := tx.ExecContext(ctx, "INSERT INTO `note_link` (`note_id`, `target_type`, `target_id`, `target_title`) VALUES (?, ?, ?, ?)", noteID, link.TargetType, link.TargetID, link.TargetTitle); err != nil {
			return err
		}
	}
	for _, tag := range tags {
		if _, err := tx.ExecContext(ctx, "INSERT INTO `note_tag` (`note_id`, `tag`) VALUES (?, ?)", noteID, tag.Tag); err != nil {
			return err
		}
	}
	return tx.Commit()
}
