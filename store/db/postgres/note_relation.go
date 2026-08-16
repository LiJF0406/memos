package postgres

import (
	"context"
	"strconv"
	"strings"

	"github.com/usememos/memos/store"
)

func (d *DB) UpsertNoteLink(ctx context.Context, create *store.NoteLink) (*store.NoteLink, error) {
	stmt := `
		INSERT INTO note_link (
			note_id,
			target_type,
			target_id,
			target_title
		)
		VALUES (` + placeholders(4) + `)
		ON CONFLICT (note_id, target_type, target_id, target_title) DO UPDATE SET target_title = EXCLUDED.target_title
		RETURNING note_id, target_type, target_id, target_title
	`
	link := &store.NoteLink{}
	if err := d.db.QueryRowContext(ctx, stmt, create.NoteID, create.TargetType, create.TargetID, create.TargetTitle).Scan(
		&link.NoteID,
		&link.TargetType,
		&link.TargetID,
		&link.TargetTitle,
	); err != nil {
		return nil, err
	}
	return link, nil
}

func (d *DB) ListNoteLinks(ctx context.Context, find *store.FindNoteLink) ([]*store.NoteLink, error) {
	where, args := []string{"1 = 1"}, []any{}
	if v := find.NoteID; v != nil {
		where, args = append(where, "note_id = "+placeholder(len(args)+1)), append(args, *v)
	}
	if len(find.NoteIDList) > 0 {
		holders := make([]string, 0, len(find.NoteIDList))
		for _, id := range find.NoteIDList {
			holders = append(holders, placeholder(len(args)+1))
			args = append(args, id)
		}
		where = append(where, "note_id IN ("+strings.Join(holders, ", ")+")")
	}
	if v := find.TargetType; v != nil {
		where, args = append(where, "target_type = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := find.TargetID; v != nil {
		where, args = append(where, "target_id = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := find.TargetTitle; v != nil {
		where, args = append(where, "target_title = "+placeholder(len(args)+1)), append(args, *v)
	}

	query := "SELECT note_id, target_type, target_id, target_title, created_ts FROM note_link WHERE " +
		strings.Join(where, " AND ") + " ORDER BY created_ts DESC, note_id DESC"
	if find.Limit != nil {
		query = query + " LIMIT " + strconv.Itoa(*find.Limit)
		if find.Offset != nil {
			query = query + " OFFSET " + strconv.Itoa(*find.Offset)
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
		where, args = append(where, "note_id = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := delete.TargetType; v != nil {
		where, args = append(where, "target_type = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := delete.TargetID; v != nil {
		where, args = append(where, "target_id = "+placeholder(len(args)+1)), append(args, *v)
	}
	stmt := "DELETE FROM note_link WHERE " + strings.Join(where, " AND ")
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) UpsertNoteTag(ctx context.Context, create *store.NoteTag) (*store.NoteTag, error) {
	stmt := `
		INSERT INTO note_tag (
			note_id,
			tag
		)
		VALUES (` + placeholders(2) + `)
		ON CONFLICT (note_id, tag) DO UPDATE SET tag = EXCLUDED.tag
		RETURNING note_id, tag
	`
	tag := &store.NoteTag{}
	if err := d.db.QueryRowContext(ctx, stmt, create.NoteID, create.Tag).Scan(
		&tag.NoteID,
		&tag.Tag,
	); err != nil {
		return nil, err
	}
	return tag, nil
}

func (d *DB) ListNoteTags(ctx context.Context, find *store.FindNoteTag) ([]*store.NoteTag, error) {
	where, args := []string{"1 = 1"}, []any{}
	if v := find.NoteID; v != nil {
		where, args = append(where, "note_id = "+placeholder(len(args)+1)), append(args, *v)
	}
	if len(find.NoteIDList) > 0 {
		holders := make([]string, 0, len(find.NoteIDList))
		for _, id := range find.NoteIDList {
			holders = append(holders, placeholder(len(args)+1))
			args = append(args, id)
		}
		where = append(where, "note_id IN ("+strings.Join(holders, ", ")+")")
	}
	if v := find.Tag; v != nil {
		where, args = append(where, "tag = "+placeholder(len(args)+1)), append(args, *v)
	}
	if len(find.TagList) > 0 {
		holders := make([]string, 0, len(find.TagList))
		for _, tag := range find.TagList {
			holders = append(holders, placeholder(len(args)+1))
			args = append(args, tag)
		}
		where = append(where, "tag IN ("+strings.Join(holders, ", ")+")")
	}

	query := "SELECT note_id, tag, created_ts FROM note_tag WHERE " +
		strings.Join(where, " AND ") + " ORDER BY created_ts DESC, note_id DESC"
	if find.Limit != nil {
		query = query + " LIMIT " + strconv.Itoa(*find.Limit)
		if find.Offset != nil {
			query = query + " OFFSET " + strconv.Itoa(*find.Offset)
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
		where, args = append(where, "note_id = "+placeholder(len(args)+1)), append(args, *v)
	}
	if v := delete.Tag; v != nil {
		where, args = append(where, "tag = "+placeholder(len(args)+1)), append(args, *v)
	}
	stmt := "DELETE FROM note_tag WHERE " + strings.Join(where, " AND ")
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) SetNoteRelations(ctx context.Context, noteID int32, links []*store.NoteLink, tags []*store.NoteTag) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM note_link WHERE note_id = $1", noteID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM note_tag WHERE note_id = $1", noteID); err != nil {
		return err
	}
	for _, link := range links {
		if _, err := tx.ExecContext(ctx, "INSERT INTO note_link (note_id, target_type, target_id, target_title) VALUES ($1, $2, $3, $4)", noteID, link.TargetType, link.TargetID, link.TargetTitle); err != nil {
			return err
		}
	}
	for _, tag := range tags {
		if _, err := tx.ExecContext(ctx, "INSERT INTO note_tag (note_id, tag) VALUES ($1, $2)", noteID, tag.Tag); err != nil {
			return err
		}
	}
	return tx.Commit()
}
