import { type AnyExtension, mergeAttributes } from "@tiptap/core";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { tableStyles } from "@/lib/markdownStyles";

/**
 * Table nodes for the WYSIWYG editors, sharing the read-only table rendering
 * (MemoContent/Table.tsx via tableStyles): rounded bordered wrapper, border-
 * collapse table, muted header row and divide-y separators.
 *
 * The default @tiptap TableView node enforces a fixed pixel table width (for
 * resizable tables), which would override `w-full`. Instead we render via
 * renderHTML (no node view) so the wrapper/table carry the shared classes and
 * the table can flow full-width — and since resizable is disabled, the column
 * resize plugin/colgroup are not needed. prosemirror-tables' cell selection /
 * row-column commands are driven by the schema, not the view, so editing still
 * works.
 */
const StyledTable = Table.extend({
  addNodeView() {
    return null;
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: tableStyles.wrapper },
      [
        "table",
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: tableStyles.table }),
        // prosemirror-tables has no separate <thead>; the header row's <th>
        // cells carry the muted border/background (thead look) below.
        ["tbody", { class: tableStyles.tbody }, 0],
      ],
    ];
  },
}).configure({ resizable: false });

export const styledTableExtensions: AnyExtension[] = [
  StyledTable,
  TableRow.configure({ HTMLAttributes: { class: tableStyles.row } }),
  TableHeader.configure({ HTMLAttributes: { class: `${tableStyles.headerCell} ${tableStyles.thead}` } }),
  TableCell.configure({ HTMLAttributes: { class: tableStyles.cell } }),
];
