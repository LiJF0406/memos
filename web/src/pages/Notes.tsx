import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { FileUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { NOTE_DATE_QUERY_PARAM, NOTE_TAG_QUERY_PARAM } from "@/components/MemoExplorer";
import NoteListItem from "@/components/Notes/NoteListItem";
import NoteSearchBar from "@/components/Notes/NoteSearchBar";
import { extractNoteIdFromName } from "@/helpers/resource-names";
import { useCreateNote, useImportNote, useNoteFolders, useNotes } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNavigateTo from "@/hooks/useNavigateTo";
import type { ListNotesRequest } from "@/types/proto/api/v1/note_service_pb";
import { NoteSchema } from "@/types/proto/api/v1/note_service_pb";
import { useTranslate } from "@/utils/i18n";

const Notes = () => {
  const t = useTranslate();
  const navigateTo = useNavigateTo();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFolderId = searchParams.get("folder");
  const currentUser = useCurrentUser();
  const { data: foldersData } = useNoteFolders();
  const defaultFolder = foldersData?.noteFolders.find((folder) => folder.isDefault && folder.creator === currentUser?.name);
  const effectiveFolderId = selectedFolderId ?? defaultFolder?.name;
  const selectedDate = searchParams.get(NOTE_DATE_QUERY_PARAM);
  const tag = searchParams.get(NOTE_TAG_QUERY_PARAM) ?? "";
  const [searchValue, setSearchValue] = useState("");

  const setTagFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    const trimmed = value.replace(/^#/, "");
    if (trimmed) {
      params.set(NOTE_TAG_QUERY_PARAM, trimmed);
    } else {
      params.delete(NOTE_TAG_QUERY_PARAM);
    }
    // replace: typing in the search bar shouldn't pile up history entries.
    setSearchParams(params, { replace: true });
  };

  const listRequest = useMemo(() => {
    const request: Partial<ListNotesRequest> = {
      folder: effectiveFolderId ?? "-",
      titleSearch: searchValue || undefined,
      tag: tag || undefined,
      pageSize: 200,
    };
    if (selectedDate) {
      // Filter by the selected date in the local timezone: [00:00, next 00:00).
      request.createdTsAfter = timestampFromDate(dayjs(selectedDate).startOf("day").toDate());
      request.createdTsBefore = timestampFromDate(dayjs(selectedDate).add(1, "day").startOf("day").toDate());
    }
    return request;
  }, [effectiveFolderId, selectedDate, searchValue, tag]);
  const { data: notesData } = useNotes(listRequest);
  const notes = notesData?.notes ?? [];

  const clearDateFilter = () => {
    const params = new URLSearchParams(searchParams);
    params.delete(NOTE_DATE_QUERY_PARAM);
    setSearchParams(params);
  };

  const createNote = useCreateNote();
  const importNote = useImportNote();

  const handleCreateNote = async () => {
    const note = await createNote.mutateAsync(
      create(NoteSchema, {
        title: t("note.untitled"),
        content: "",
        folder: effectiveFolderId,
      }),
    );
    navigateTo(`/notes/${extractNoteIdFromName(note.name)}`);
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
      folder: effectiveFolderId,
    });
    navigateTo(`/notes/${extractNoteIdFromName(note.name)}`);
  };

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4 min-w-0">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{t("common.notes")}</h1>
        {selectedDate && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground transition-colors hover:bg-accent/70"
            onClick={clearDateFilter}
            title={t("common.clear")}
          >
            {selectedDate}
            <XIcon className="w-3 h-auto" />
          </button>
        )}
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
      <NoteSearchBar value={searchValue} tag={tag} onValueChange={setSearchValue} onTagChange={setTagFilter} />
      <div className="flex-1 overflow-auto flex flex-col gap-1">
        {notes.length === 0 ? (
          <div className="w-full py-16 text-center text-muted-foreground">{t("note.no-notes")}</div>
        ) : (
          notes.map((note) => (
            <NoteListItem key={note.name} note={note} onClick={() => navigateTo(`/notes/${extractNoteIdFromName(note.name)}`)} />
          ))
        )}
      </div>
    </div>
  );
};

export default Notes;
