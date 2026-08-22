import { tableStyles } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { NestedMarkdownRenderContext } from "./MarkdownRenderContext";
import type { ReactMarkdownProps } from "./markdown/types";

interface TableProps extends React.HTMLAttributes<HTMLTableElement>, ReactMarkdownProps {
  children: React.ReactNode;
}

export const Table = ({ children, className, node: _node, ...props }: TableProps) => {
  return (
    <div className={tableStyles.wrapper}>
      <table className={cn(tableStyles.table, className)} {...props}>
        {children}
      </table>
    </div>
  );
};

interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement>, ReactMarkdownProps {
  children: React.ReactNode;
}

export const TableHead = ({ children, className, node: _node, ...props }: TableHeadProps) => {
  return (
    <thead className={cn(tableStyles.thead, className)} {...props}>
      {children}
    </thead>
  );
};

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement>, ReactMarkdownProps {
  children: React.ReactNode;
}

export const TableBody = ({ children, className, node: _node, ...props }: TableBodyProps) => {
  return (
    <tbody className={cn(tableStyles.tbody, className)} {...props}>
      {children}
    </tbody>
  );
};

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement>, ReactMarkdownProps {
  children: React.ReactNode;
}

export const TableRow = ({ children, className, node: _node, ...props }: TableRowProps) => {
  return (
    <tr className={cn(tableStyles.row, className)} {...props}>
      {children}
    </tr>
  );
};

interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement>, ReactMarkdownProps {
  children: React.ReactNode;
}

export const TableHeaderCell = ({ children, className, node: _node, ...props }: TableHeaderCellProps) => {
  return (
    <th className={cn(tableStyles.headerCell, className)} {...props}>
      <NestedMarkdownRenderContext>{children}</NestedMarkdownRenderContext>
    </th>
  );
};

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement>, ReactMarkdownProps {
  children: React.ReactNode;
}

export const TableCell = ({ children, className, node: _node, ...props }: TableCellProps) => {
  return (
    <td className={cn(tableStyles.cell, className)} {...props}>
      <NestedMarkdownRenderContext>{children}</NestedMarkdownRenderContext>
    </td>
  );
};
