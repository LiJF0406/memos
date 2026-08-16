import { timestampDate } from "@bufbuild/protobuf/wkt";
import { FileTextIcon, LinkIcon } from "lucide-react";
import type { Note } from "@/types/proto/api/v1/note_service_pb";

interface NoteListItemProps {
  note: Note;
  onClick?: () => void;
}

const NoteListItem = ({ note, onClick }: NoteListItemProps) => {
  const updateTime = note.updateTime ? timestampDate(note.updateTime) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <div className="flex items-center gap-2 w-full">
        <FileTextIcon className="w-4 h-auto shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{note.title}</span>
        {note.shared && <LinkIcon className="w-3.5 h-auto shrink-0 text-primary" />}
      </div>
      {(note.tags.length > 0 || updateTime) && (
        <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
          {note.tags.length > 0 && <span className="truncate">#{note.tags.join(" #")}</span>}
          {updateTime && <span className="shrink-0">{updateTime.toLocaleDateString()}</span>}
        </div>
      )}
    </button>
  );
};

export default NoteListItem;
