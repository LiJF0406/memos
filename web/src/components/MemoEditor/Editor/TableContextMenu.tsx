import type { Editor } from "@tiptap/core";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useTranslate } from "@/utils/i18n";

interface TableContextMenuProps {
  editor: Editor;
}

/**
 * 表格行/列管理的右键菜单。光标停在表格里打字时不再被悬浮气泡打扰，
 * 需要增删行列/删除表格时在表格上右键即可。
 *
 * Radix ContextMenu 的定位锚点在触发元素内部，只有触发元素自己收到
 * contextmenu 事件才会更新到正确坐标。这里把触发元素以隐藏 span 形态
 * portal 到 body，并在编辑器 DOM 上监听 contextmenu：命中表格时才把该
 * 事件以合成事件重新派发给触发元素（坐标随之落到菜单），并把光标移入
 * 命中的单元格，使 addRowBefore 等 tiptap 命令作用于目标行/列（空单元
 * 格也无需先输入文本）。非表格区域不拦截，保留默认右键菜单。
 */
const TableContextMenu = ({ editor }: TableContextMenuProps) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const { view } = editor;
    const el = view.dom;

    const handleContextMenu = (event: MouseEvent) => {
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!coords) {
        return;
      }
      const { pos } = coords;
      const $pos = view.state.doc.resolve(pos);
      let inTable = false;
      for (let depth = $pos.depth; depth >= 0; depth--) {
        if ($pos.node(depth).type.name === "table") {
          inTable = true;
          break;
        }
      }
      if (!inTable || !triggerRef.current) {
        return;
      }
      // 光标放入命中的单元格，让表格命令作用于目标行列。
      editor.commands.setTextSelection(pos);
      // 阻止默认右键菜单，并把真实坐标交给隐藏触发元素来弹出表格菜单。
      event.preventDefault();
      triggerRef.current.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: event.clientX, clientY: event.clientY }));
    };

    // 滚动时关闭菜单（捕获阶段可同时捕获文档与任意滚动容器的滚动）。
    const handleScroll = () => setOpen(false);

    el.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      el.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [editor]);

  return (
    <ContextMenu open={open} onOpenChange={setOpen}>
      <ContextMenuTrigger
        ref={triggerRef}
        // 隐藏触发元素：不占布局、不拦截鼠标，仅承载 Radix 的坐标锚点。
        className="pointer-events-none fixed left-0 top-0 z-[-1] size-0 opacity-0"
      />
      <ContextMenuContent alignOffset={4}>
        <ContextMenuItem onClick={() => editor.chain().focus().addRowBefore().run()}>
          <ArrowUpIcon className="size-4" />
          {t("editor.bubble-toolbar.add-row-above")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
          <ArrowDownIcon className="size-4" />
          {t("editor.bubble-toolbar.add-row-below")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().deleteRow().run()}>
          <Trash2Icon className="size-4" />
          {t("editor.bubble-toolbar.delete-row")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => editor.chain().focus().addColumnBefore().run()}>
          <ArrowLeftIcon className="size-4" />
          {t("editor.bubble-toolbar.add-column-before")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
          <ArrowRightIcon className="size-4" />
          {t("editor.bubble-toolbar.add-column-after")}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => editor.chain().focus().deleteColumn().run()}>
          <Trash2Icon className="size-4" />
          {t("editor.bubble-toolbar.delete-column")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => editor.chain().focus().deleteTable().run()}>
          <Trash2Icon className="size-4" />
          {t("editor.bubble-toolbar.delete-table")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default TableContextMenu;
