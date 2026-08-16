import type { Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import type { EditorProps } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { EyeIcon, FileDownIcon, PencilLineIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownRenderContext, rootMarkdownRenderContext } from "@/components/MemoContent/MarkdownRenderContext";
import { buildMemoMarkdownComponents } from "@/components/MemoContent/MemoMarkdownRenderer";
import { CollapseAllSelectionAfterDelete, isPastedUrl } from "@/components/MemoEditor/Editor";
import { buildExtensions } from "@/components/MemoEditor/Editor/extensions";
import { SlashCommand } from "@/components/MemoEditor/Editor/SlashCommand";
import { TagSuggestion } from "@/components/MemoEditor/Editor/TagSuggestion";
import { uploadService } from "@/components/MemoEditor/services/uploadService";
import { useExportNote, useNoteLinks, useNotes, useUpdateNote } from "@/hooks";
import { useMemos } from "@/hooks/useMemoQueries";
import { useTagCounts } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import { isWikiLinkElement } from "@/types/markdown";
import type { NoteLink } from "@/types/proto/api/v1/note_service_pb";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";
import { remarkWikiLink } from "@/utils/remark-plugins/remark-wikilink";
import { type ResolvedWikiLink, WikiLink, WikiLinkResolutionContext } from "../WikiLink";
import { Image } from "./Image";
import { LivePreview } from "./LivePreview";
import { MarkdownInputRules } from "./MarkdownInputRules";
import { WikiLink as WikiLinkMark } from "./WikiLink";
import { WikiLinkSuggestion, type WikiLinkSuggestionItem } from "./WikiLinkSuggestion";

interface NoteEditorProps {
  noteName: string;
  initialContent: string;
}

const AUTOSAVE_DELAY_MS = 800;

function serializeMarkdown(editor: { getMarkdown?: () => string } | null): string {
  return (editor?.getMarkdown?.() ?? "").trim();
}

/**
 * A read-only markdown preview that resolves [[wiki links]] against the note's
 * resolved links (from the backend) and renders code blocks with highlight.js.
 */
function NotePreview({ content, links }: { content: string; links: NoteLink[] }) {
  const resolve = useMemo(() => {
    const map = new Map<string, ResolvedWikiLink>();
    for (const link of links) {
      map.set(link.title, { targetType: link.targetType, target: link.target || undefined });
    }
    return (title: string) => map.get(title);
  }, [links]);

  // Reuse the memo renderer's styled elements (headings, blockquotes, lists,
  // tables, ...) so the preview keeps markdown formatting, with a custom span
  // for [[wiki links]]. Task list checkboxes render read-only (notes have no
  // toggle interaction like memos).
  const components: Components = {
    ...buildMemoMarkdownComponents(new Set()),
    input: ({ node: _node, ...props }) => <input {...props} disabled />,
    span: ({ node, ...props }) => {
      if (node && isWikiLinkElement(node)) {
        const title = (node.properties?.["data-wikilink"] as string | undefined) ?? "";
        return <WikiLink {...props} node={node} data-wikilink={title} />;
      }
      return <span {...props} />;
    },
  };

  return (
    <MarkdownRenderContext.Provider value={rootMarkdownRenderContext}>
      <WikiLinkResolutionContext.Provider value={resolve}>
        <div className="note-preview w-full text-base break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkWikiLink]} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      </WikiLinkResolutionContext.Provider>
    </MarkdownRenderContext.Provider>
  );
}

/**
 * Note editor container: TipTap WYSIWYG editing with wiki-link suggestions,
 * live preview of the active line's markdown source, debounced autosave,
 * image paste/drop upload and markdown export.
 */
const NoteEditor = ({ noteName, initialContent }: NoteEditorProps) => {
  const t = useTranslate();
  const [content, setContent] = useState(initialContent);
  const [previewMode, setPreviewMode] = useState(false);
  const updateNote = useUpdateNote();
  const exportNote = useExportNote();
  const { data: linksData } = useNoteLinks(noteName);
  const { data: notesData } = useNotes({ pageSize: 100 });
  const { data: memosData } = useMemos({ pageSize: 100 });
  const { data: memoTagCount = {} } = useTagCounts(true);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const placeholderRef = useRef(t("note.editor-placeholder"));
  placeholderRef.current = t("note.editor-placeholder");

  const handleContentChange = useCallback(
    (markdown: string) => {
      setContent(markdown);
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        updateNote.mutate({ update: { name: noteName, content: markdown }, updateMask: ["content"] });
      }, AUTOSAVE_DELAY_MS);
    },
    [noteName, updateNote],
  );

  const suggestionItems = useMemo<WikiLinkSuggestionItem[]>(() => {
    const noteItems = (notesData?.notes ?? []).map((note) => ({ title: note.title, kind: "note" as const }));
    const memoItems = (memosData?.memos ?? [])
      .map((memo) => ({ title: memo.property?.title ?? "", kind: "memo" as const }))
      .filter((item) => item.title.length > 0);
    return [...noteItems, ...memoItems];
  }, [notesData, memosData]);
  const suggestionItemsRef = useRef<WikiLinkSuggestionItem[]>([]);
  suggestionItemsRef.current = suggestionItems;

  // Aggregated tags from the already-loaded notes (page 1), falling back to the
  // current user's memo tags so the # popup always has suggestions. Notes save
  // tags extracted from their content by the backend, so inserting "#tag"
  // persists it as a note tag automatically.
  const noteTags = useMemo(() => {
    const tags = new Set<string>();
    for (const note of notesData?.notes ?? []) {
      for (const tag of note.tags ?? []) {
        tags.add(tag);
      }
    }
    for (const tag of Object.keys(memoTagCount)) {
      tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [notesData, memoTagCount]);
  const noteTagsRef = useRef<string[]>([]);
  noteTagsRef.current = noteTags;

  const extensions = useMemo(
    () => [
      ...buildExtensions(),
      WikiLinkMark,
      Image,
      MarkdownInputRules,
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      WikiLinkSuggestion.configure({ getItems: () => suggestionItemsRef.current }),
      SlashCommand,
      TagSuggestion.configure({ getTags: () => noteTagsRef.current }),
      CollapseAllSelectionAfterDelete,
      LivePreview,
    ],
    [],
  );

  const editorProps = useMemo<EditorProps>(
    () => ({
      attributes: {
        class: "note-wysiwyg outline-none w-full text-base break-words min-h-40",
      },
      handlePaste: (view, event: ClipboardEvent) => {
        const clipboard = event.clipboardData;
        if (!clipboard) {
          return false;
        }
        const files = Array.from(clipboard.items ?? [])
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (files.length > 0) {
          void uploadFilesAndInsert(files, editorRef.current);
          return true;
        }
        // 富文本 HTML 粘贴保留浏览器结构；纯文本按 Markdown 重新解析。
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
      handleDrop: (_view, event: DragEvent) => {
        const dataTransfer = event.dataTransfer;
        if (!dataTransfer) {
          return false;
        }
        const files = Array.from(dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) {
          return false;
        }
        void uploadFilesAndInsert(files, editorRef.current);
        return true;
      },
    }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    contentType: "markdown",
    editorProps,
    onUpdate: ({ editor: currentEditor }) => {
      handleContentChange(serializeMarkdown(currentEditor));
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Reset the editor when switching to a different note.
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (serializeMarkdown(editor) !== initialContent.trim()) {
      editor.commands.setContent(initialContent, { contentType: "markdown", emitUpdate: false });
      setContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteName]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const handleExport = useCallback(async () => {
    const result = await exportNote.mutateAsync(noteName);
    const blob = new Blob([result.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.title || "note"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [exportNote, noteName]);

  const togglePreview = useCallback(() => {
    setPreviewMode((value) => !value);
  }, []);

  const links = linksData?.links ?? [];

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={togglePreview}
        >
          {previewMode ? <PencilLineIcon className="w-4 h-auto" /> : <EyeIcon className="w-4 h-auto" />}
          {previewMode ? t("note.edit") : t("note.preview")}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={handleExport}
        >
          <FileDownIcon className="w-4 h-auto" />
          {t("note.export")}
        </button>
      </div>
      {previewMode ? (
        <NotePreview content={content} links={links} />
      ) : (
        <div className={cn("w-full min-h-40")}>
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
};

async function uploadFilesAndInsert(files: File[], editor: Editor | null) {
  if (!editor) {
    return;
  }
  const localFiles = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
  try {
    const attachments = await uploadService.uploadFiles(localFiles);
    for (const attachment of attachments) {
      const url = getAttachmentUrl(attachment);
      editor.chain().focus().insertContent(`![](${url})`, { contentType: "markdown" }).run();
    }
  } finally {
    for (const localFile of localFiles) {
      URL.revokeObjectURL(localFile.previewUrl);
    }
  }
}

export default NoteEditor;
