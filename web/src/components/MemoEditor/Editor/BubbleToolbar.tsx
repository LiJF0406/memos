import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import { BoldIcon, ItalicIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type HeadingLevel } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

// 与 SuggestionMenu 弹窗风格保持一致。
const TOOLBAR_STYLES = {
  container: "z-50 flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md",
  button:
    "inline-flex size-7 cursor-pointer select-none items-center justify-center rounded-md text-xs font-semibold transition-colors hover:bg-accent hover:text-accent-foreground",
};

const HEADING_LEVELS: HeadingLevel[] = [1, 2, 3];

// Mod in TipTap keymaps is Cmd on Apple platforms, Ctrl elsewhere.
const IS_APPLE = navigator.userAgent.includes("Mac");
// 快捷键提示：macOS 用符号连写（⌘B / ⌘⌥1），其他平台用加号连接（Ctrl+B / Ctrl+Alt+1）。
const formatHeadingShortcut = (level: number) => (IS_APPLE ? `\u2318\u2325${level}` : `Ctrl+Alt+${level}`);
const formatSimpleShortcut = (key: string) => (IS_APPLE ? `\u2318${key}` : `Ctrl+${key}`);

function BubbleButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          // Keep focus on the contenteditable so the selection (and thus the
          // toolbar's anchor) survives the click.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(TOOLBAR_STYLES.button, active && "bg-accent text-accent-foreground")}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface BubbleToolbarProps {
  editor: Editor;
}

/**
 * 选中文本时浮动出现的格式工具栏（TipTap 官方 BubbleMenu 组件）。让用户切换
 * 标题级别或退回正文 —— markdown input rules 触发后块类型存在节点属性里，
 * 行内不再有 "#" 前缀可编辑。
 */
const BubbleToolbar = ({ editor }: BubbleToolbarProps) => {
  const t = useTranslate();

  return (
    <BubbleMenu
      editor={editor}
      className={TOOLBAR_STYLES.container}
      updateDelay={100}
      // 自定义 shouldShow 会完全替换官方默认逻辑，因此复刻其条件
      // （聚焦 + 可编辑 + 非空选区 + 选区内有实际文本）并追加排除项。
      shouldShow={({ editor: ed, state, view, from, to }) => {
        const { selection } = state;
        if (!view.hasFocus() || !ed.isEditable || selection.empty) {
          return false;
        }
        // 排除图片 NodeSelection 等非文本选区。
        if (!(selection instanceof TextSelection)) {
          return false;
        }
        if (!state.doc.textBetween(from, to).trim()) {
          return false;
        }
        // 代码块内 mark 无法生效，不弹工具栏。
        return !ed.isActive("codeBlock");
      }}
    >
      {HEADING_LEVELS.map((level) => (
        <BubbleButton
          key={level}
          active={editor.isActive("heading", { level })}
          // 对当前级别再次点击即退回正文 —— 也是取消标题的方式之一。
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          label={`${t("editor.bubble-toolbar.heading", { level })} (${formatHeadingShortcut(level)})`}
        >
          H{level}
        </BubbleButton>
      ))}
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <BubbleButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label={`${t("editor.bubble-toolbar.bold")} (${formatSimpleShortcut("B")})`}
      >
        <BoldIcon className="size-4" strokeWidth={2.5} />
      </BubbleButton>
      <BubbleButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label={`${t("editor.bubble-toolbar.italic")} (${formatSimpleShortcut("I")})`}
      >
        <ItalicIcon className="size-4" strokeWidth={2.5} />
      </BubbleButton>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <BubbleButton
        active={!editor.isActive("heading") && !editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().setParagraph().run()}
        label={t("editor.bubble-toolbar.text")}
      >
        T
      </BubbleButton>
    </BubbleMenu>
  );
};

export default BubbleToolbar;
