import { create } from "@bufbuild/protobuf";
import { FileUpIcon, PlusIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import NoteFolderTree from "@/components/Notes/NoteFolderTree";
import NoteListItem from "@/components/Notes/NoteListItem";
import NoteSearchBar from "@/components/Notes/NoteSearchBar";
import { extractNoteIdFromName } from "@/helpers/resource-names";
import {
  useCreateNote,
  useCreateNoteFolder,
  useDeleteNoteFolder,
  useImportNote,
  useNoteFolders,
  useNotes,
  useUpdateNoteFolder,
} from "@/hooks";
import useNavigateTo from "@/hooks/useNavigateTo";
import type { NoteFolder } from "@/types/proto/api/v1/note_service_pb";
import { NoteFolderSchema, NoteSchema } from "@/types/proto/api/v1/note_service_pb";
import { useTranslate } from "@/utils/i18n";

const Notes = () => {
  const t = useTranslate();
  const navigateTo = useNavigateTo();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [tag, setTag] = useState("");

  const { data: foldersData } = useNoteFolders();
  const folders = foldersData?.noteFolders ?? [];

  const listRequest = useMemo(
    () => ({
      folder: selectedFolderId ?? "-",
      titleSearch: searchValue || undefined,
      tag: tag || undefined,
      pageSize: 200,
    }),
    [selectedFolderId, searchValue, tag],
  );
  const { data: notesData } = useNotes(listRequest);
  const notes = notesData?.notes ?? [];

  const createNote = useCreateNote();
  const createFolder = useCreateNoteFolder();
  const updateFolder = useUpdateNoteFolder();
  const deleteFolder = useDeleteNoteFolder();
  const importNote = useImportNote();

  const handleCreateNote = async () => {
    const note = await createNote.mutateAsync(
      create(NoteSchema, {
        title: t("note.untitled"),
        content: "",
        folder: selectedFolderId ?? undefined,
      }),
    );
    navigateTo(`/notes/${extractNoteIdFromName(note.name)}`);
  };

  const handleCreateFolder = async (parentId: string | null) => {
    const title = window.prompt(t("note.new-folder"));
    if (!title) {
      return;
    }
    await createFolder.mutateAsync(
      create(NoteFolderSchema, {
        title,
        parent: parentId ?? undefined,
        shared: false,
      }),
    );
  };

  const handleRenameFolder = async (folder: NoteFolder) => {
    const title = window.prompt(t("note.rename"), folder.title);
    if (!title) {
      return;
    }
    await updateFolder.mutateAsync({
      update: { name: folder.name, title },
      updateMask: ["title"],
    });
  };

  const handleDeleteFolder = async (folder: NoteFolder) => {
    if (!window.confirm(t("note.confirm-delete-folder"))) {
      return;
    }
    await deleteFolder.mutateAsync(folder.name);
    if (selectedFolderId === folder.name) {
      setSelectedFolderId(null);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".md")) {
      return;
    }
    const title = file.name.replace(/\.md$/i, "");
    const content = await file.text();
    const note = await importNote.mutateAsync({
      title,
      content,
      folder: selectedFolderId ?? undefined,
    });
    navigateTo(`/notes/${extractNoteIdFromName(note.name)}`);
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row">
      <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r p-3">
        <NoteFolderTree
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      </aside>
      <section className="flex-1 flex flex-col gap-3 p-4 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{t("common.notes")}</h1>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".md"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportFile(file);
              }
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => fileInputRef.current?.click()}
            title={t("note.import")}
          >
            <FileUpIcon className="w-4 h-auto" />
            {t("note.import")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:opacity-90"
            onClick={handleCreateNote}
          >
            <PlusIcon className="w-4 h-auto" />
            {t("note.new-note")}
          </button>
        </div>
        <NoteSearchBar value={searchValue} tag={tag} onValueChange={setSearchValue} onTagChange={setTag} />
        <div className="flex-1 overflow-auto flex flex-col gap-1">
          {notes.length === 0 ? (
            <div className="w-full py-16 text-center text-muted-foreground">{t("note.no-notes")}</div>
          ) : (
            notes.map((note) => (
              <NoteListItem key={note.name} note={note} onClick={() => navigateTo(`/notes/${extractNoteIdFromName(note.name)}`)} />
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Notes;
