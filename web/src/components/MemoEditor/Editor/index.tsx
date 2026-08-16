import type { Editor as EditorInstance } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { AllSelection, Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import type { EditorProps as ProseMirrorEditorProps } from "@tiptap/pm/view";
import { EditorContent as RichTextContent, useEditor } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { matchPath } from "react-router-dom";
import { useTagCounts } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import { ROUTES as Routes } from "@/router/routes";
import { EDITOR_HEIGHT } from "../constants";
import type { EditorController } from "../types/editorController";
import { buildExtensions } from "./extensions";
import { SlashCommand } from "./SlashCommand";
import { TagSuggestion } from "./TagSuggestion";

// Mod-Enter is the app-wide "save memo" shortcut (useKeyboard). StarterKit's
// HardBreak extension also binds Mod-Enter to insert a hard break, which would
// mutate the document right before save fires. This extension swallows the
// shortcut (returning true stops further keymap handlers) while preserving
// DOM event bubbling — preventDefault does NOT stopPropagation, so the window-
// level save listener in useKeyboard still receives and handles the keystroke.
// Priority 1000 > HardBreak's default 100, so this handler runs first.
// Shift-Enter still inserts a hard break as expected.
const SaveShortcutPassthrough = Extension.create({
  name: "saveShortcutPassthrough",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => true,
    };
  },
});

// Ctrl+A makes ProseMirror's whole-document AllSelection. Deleting it
// (Backspace / Delete / Cut) empties the document, but AllSelection.map()
// always returns another AllSelection — so the editor is left holding a
// non-empty selection spanning the now-empty paragraph, which the view paints
// as a "selected" empty block (the reported artifact). After any doc-changing
// edit that leaves an AllSelection behind, collapse it to a caret at the start,
// the same way deleting an ordinary text selection collapses to a cursor.
// The `instanceof AllSelection` guard re-evaluates against the post-collapse
// state, so the appended selection-only transaction is not re-processed.
export const CollapseAllSelectionAfterDelete = Extension.create({
  name: "collapseAllSelectionAfterDelete",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("collapseAllSelectionAfterDelete"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged) || !(newState.selection instanceof AllSelection)) {
            return null;
          }
          return newState.tr.setSelection(Selection.atStart(newState.doc));
        },
      }),
    ];
  },
});

export interface EditorProps {
  className?: string;
  initialContent: string;
  placeholder: string;
  isFocusMode?: boolean;
  onContentChange: (content: string) => void;
  onPaste: (event: React.ClipboardEvent) => void;
}

/**
 * The Document serializer joins/terminates blocks with `\n\n`, so e.g. a task
 * list serializes with a trailing blank line. Outer whitespace is meaningless
 * at the document level (the round-trip corpus compares modulo outer trim),
 * so every markdown string leaving this component is trimmed.
 */
function serializeMarkdown(editor: { getMarkdown: () => string } | null): string {
  return (editor?.getMarkdown() ?? "").trim();
}

/**
 * 对齐 @tiptap/extension-link 的 shouldAutoLink 启发式，用于粘贴路径：
 * 当整段（单个 token）文本是 Link 扩展会自动链接的链接时返回 true。
 * 用于将「URL 覆盖选区」的粘贴交还给该扩展处理，而不是当作 markdown 重新解析。
 */
export function isPastedUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }
  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const hasMaybeProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (hasProtocol || (hasMaybeProtocol && !trimmed.includes("@"))) {
    return true;
  }
  const hostname = (trimmed.includes("@") ? trimmed.split("@").pop()! : trimmed).split(/[/?#:]/)[0];
  return /\./.test(hostname) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * WYSIWYG memo editor built on ProseMirror. Markdown is the only format
 * crossing its boundary: in via setContent(contentType: "markdown"), out via
 * serializeMarkdown() on every update. IME, list continuation, input rules,
 * and auto-grow are native ProseMirror/contenteditable behavior.
 */
const Editor = forwardRef<EditorController, EditorProps>(function Editor(props, ref) {
  const { className, initialContent, placeholder, isFocusMode, onContentChange, onPaste } = props;

  // Last markdown emitted through onContentChange, so the sync effect can
  // recognize the parent echoing our own value back without re-serializing.
  const lastEmittedRef = useRef<string | null>(null);
  // Read through refs so the memoized extension/editorProps closures below
  // always see the latest props (Placeholder decorations recompute per
  // transaction; handlePaste resolves per event).
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  // 持有当前编辑器实例，使被 memoize 的 handlePaste 闭包能够派发 markdown 插入，
  // 而无需每次击键都重新创建 editorProps。
  const editorRef = useRef<EditorInstance | null>(null);

  // On the explore page suggestions include all users' tags; otherwise the
  // current user's. Same sourcing as the raw editor's TagSuggestions.
  const isExplorePage = useMemo(() => Boolean(matchPath(Routes.EXPLORE, window.location.pathname)), []);
  const { data: tagCount = {} } = useTagCounts(!isExplorePage);
  const sortedTags = useMemo(
    () =>
      Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag),
    [tagCount],
  );
  const tagsRef = useRef<string[]>([]);
  tagsRef.current = sortedTags;

  // Stable option identities so useEditor's compareOptions stays equal across
  // renders and the editor skips a needless setOptions/view.setProps pass per
  // keystroke. All dynamic values reach the closures through refs above.
  // `content` is only consumed at editor creation — later external changes
  // flow through the sync effect — so the mount-time value is frozen too.
  const mountContentRef = useRef(initialContent);
  const extensions = useMemo(
    () => [
      ...buildExtensions(),
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      TagSuggestion.configure({ getTags: () => tagsRef.current }),
      SlashCommand,
      SaveShortcutPassthrough,
      CollapseAllSelectionAfterDelete,
    ],
    [],
  );
  const editorProps = useMemo<ProseMirrorEditorProps>(
    () => ({
      attributes: {
        class: "memo-wysiwyg outline-none w-full text-base break-words min-h-6",
      },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) {
          return false;
        }
        const hasFiles = Array.from(clipboard.items ?? []).some((item) => item.kind === "file");
        if (hasFiles) {
          onPasteRef.current(event as unknown as React.ClipboardEvent);
          return true;
        }
        // 富文本 HTML 粘贴保留其浏览器结构；只有纯文本才会被当作 markdown
        // 重新解析（把 `---`、`>` 和 ``` 转成对应结构的 input rules 只对输入生效，
        // 不会作用于粘贴文本）。
        if (clipboard.getData("text/html")) {
          return false;
        }
        const text = clipboard.getData("text/plain");
        if (!text) {
          return false;
        }
        // 「URL 覆盖选区 → 链接」由 @tiptap/extension-link 的 pasteHandler 处理，
        // 它会在本 prop 之后执行；此处交给它。
        if (!view.state.selection.empty && isPastedUrl(text)) {
          return false;
        }
        return editorRef.current?.commands.insertContent(text, { contentType: "markdown" }) ?? false;
      },
    }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: mountContentRef.current,
    contentType: "markdown",
    editorProps,
    onUpdate: ({ editor: currentEditor }) => {
      const markdown = serializeMarkdown(currentEditor);
      lastEmittedRef.current = markdown;
      onContentChange(markdown);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync external content changes (e.g. reset after save, draft restore)
  // without clobbering the document the user is typing into: only apply when
  // the markdown actually differs.
  useEffect(() => {
    if (!editor) {
      return;
    }
    // Parent echo of our own emission — nothing to sync (O(1) fast path).
    // Comparing against the live document instead would race: a keystroke
    // landing between the emission and this passive effect would make the
    // echo look like an external change and clobber the keystroke/cursor.
    if (initialContent === lastEmittedRef.current) {
      return;
    }
    // Never clobber an in-progress IME composition.
    if (editor.view.composing) {
      return;
    }
    if (serializeMarkdown(editor) !== initialContent.trim()) {
      editor.commands.setContent(initialContent, { contentType: "markdown", emitUpdate: false });
      // A subsequent identical echo of this value is also a no-op.
      lastEmittedRef.current = initialContent;
    }
  }, [initialContent, editor]);

  useImperativeHandle(
    ref,
    (): EditorController => ({
      focus: () => editor?.commands.focus(),
      hasFocus: () => editor?.isFocused ?? false,
      // Contract: whitespace-only counts as empty. The editor's structural
      // `editor.isEmpty` would call a paragraph of spaces non-empty.
      isEmpty: () => serializeMarkdown(editor) === "",
      getMarkdown: () => serializeMarkdown(editor),
      setMarkdown: (markdown) => editor?.commands.setContent(markdown, { contentType: "markdown" }),
      insertMarkdown: (markdown) => editor?.chain().focus().insertContent(markdown, { contentType: "markdown" }).run(),
      scrollToCursor: () => editor?.commands.scrollIntoView(),
      selectAll: () => editor?.commands.selectAll(),
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      toggleTaskList: () => editor?.chain().focus().toggleTaskList().run(),
    }),
    [editor],
  );

  return (
    <div
      className={cn(
        "flex flex-col justify-start items-start relative w-full bg-inherit overflow-y-auto overflow-x-hidden",
        isFocusMode ? "flex-1" : `h-auto ${EDITOR_HEIGHT.normal}`,
        className,
      )}
      onClick={(event) => {
        // In focus mode the wrapper extends below the content; a click on the
        // empty area should land the caret at the end instead of doing nothing.
        if (event.target === event.currentTarget) {
          editor?.commands.focus("end");
        }
      }}
    >
      <RichTextContent editor={editor} className="w-full" />
    </div>
  );
});

export default Editor;
