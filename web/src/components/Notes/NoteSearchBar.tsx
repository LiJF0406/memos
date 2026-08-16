import { SearchIcon } from "lucide-react";
import { useTranslate } from "@/utils/i18n";

interface NoteSearchBarProps {
  value: string;
  tag: string;
  onValueChange: (value: string) => void;
  onTagChange: (tag: string) => void;
}

const NoteSearchBar = ({ value, tag, onValueChange, onTagChange }: NoteSearchBarProps) => {
  const t = useTranslate();

  return (
    <div className="w-full flex items-center gap-2 rounded-lg border px-3 py-2">
      <SearchIcon className="w-4 h-auto shrink-0 text-muted-foreground" />
      <input
        className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        placeholder={t("note.search-placeholder")}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {tag && <span className="shrink-0 rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">#{tag}</span>}
      <input
        className="w-24 shrink-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        placeholder={t("note.search-tag-placeholder")}
        value={tag}
        onChange={(event) => onTagChange(event.target.value.replace(/^#/, ""))}
      />
    </div>
  );
};

export default NoteSearchBar;
