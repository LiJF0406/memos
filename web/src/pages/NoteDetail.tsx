import { ArrowLeftIcon, LinkIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import NoteEditor from "@/components/Notes/NoteEditor";
import { noteNamePrefix } from "@/helpers/resource-names";
import { useDeleteNote, useNote, useUpdateNote } from "@/hooks";
import useNavigateTo from "@/hooks/useNavigateTo";
import { Routes } from "@/router";
import { useTranslate } from "@/utils/i18n";

const NoteDetail = () => {
  const { noteId } = useParams();
  const t = useTranslate();
  const navigateTo = useNavigateTo();
  const noteName = `${noteNamePrefix}${noteId}`;
  const { data: note, isLoading } = useNote(noteName);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (note) {
      setTitle(note.title);
    }
  }, [note]);

  const handleTitleBlur = () => {
    if (note && title.trim() && title !== note.title) {
      updateNote.mutate({ update: { name: noteName, title: title.trim() }, updateMask: ["title"] });
    } else if (!title.trim()) {
      setTitle(note?.title ?? "");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t("note.confirm-delete-note"))) {
      return;
    }
    await deleteNote.mutateAsync(noteName);
    navigateTo(Routes.NOTES);
  };

  if (isLoading || !note) {
    return <div className="w-full p-6 text-muted-foreground">{t("message.no-data")}</div>;
  }

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => navigateTo(Routes.NOTES)}
        >
          <ArrowLeftIcon className="w-4 h-auto" />
          {t("note.back")}
        </button>
        {note.shared && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
            <LinkIcon className="w-3.5 h-auto" />
            {t("note.shared")}
          </span>
        )}
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={handleDelete}
        >
          <TrashIcon className="w-4 h-auto" />
          {t("note.delete")}
        </button>
      </div>
      <input
        className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground"
        placeholder={t("note.title")}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={handleTitleBlur}
      />
      <NoteEditor key={noteName} noteName={noteName} initialContent={note.content} />
    </div>
  );
};

export default NoteDetail;
