import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { NoteFolder } from "@/types/proto/api/v1/note_service_pb";
import { useTranslate } from "@/utils/i18n";

interface MoveFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: NoteFolder[];
  currentUserName: string;
  movingFolder: NoteFolder;
  onConfirm: (parent: string | null) => Promise<void>;
}

export const MoveFolderDialog = ({ open, onOpenChange, folders, currentUserName, movingFolder, onConfirm }: MoveFolderDialogProps) => {
  const t = useTranslate();
  const defaultFolder = folders.find((folder) => folder.isDefault && folder.creator === currentUserName);

  const getInitialParent = (): string | null => {
    if (movingFolder.parent && folders.some((folder) => folder.name === movingFolder.parent && folder.creator === currentUserName)) {
      return movingFolder.parent;
    }
    return defaultFolder?.name ?? null;
  };

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedParent, setSelectedParent] = useState<string | null>(getInitialParent);

  // Reset selection whenever the dialog opens for a new folder.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelectedParent(getInitialParent());
      setCollapsed(new Set());
    }
    onOpenChange(next);
  };

  // Rebuild the destination tree when the dialog opens.
  const tree = useMemo(() => {
    if (!open) {
      return {
        roots: [] as NoteFolder[],
        childrenByParent: new Map<string, NoteFolder[]>(),
        defaultFolder: undefined as NoteFolder | undefined,
      };
    }

    const personal = folders.filter((folder) => folder.creator === currentUserName);

    // Exclude the moving folder and all of its descendants to prevent cycles.
    const excluded = new Set<string>([movingFolder.name]);
    const queue = [movingFolder.name];
    while (queue.length > 0) {
      const parentName = queue.shift() as string;
      for (const folder of personal) {
        if (folder.parent === parentName && !excluded.has(folder.name)) {
          excluded.add(folder.name);
          queue.push(folder.name);
        }
      }
    }

    const available = personal.filter((folder) => !excluded.has(folder.name));
    const childrenByParent = new Map<string, NoteFolder[]>();
    for (const folder of available) {
      const parentKey = folder.parent ?? "";
      const siblings = childrenByParent.get(parentKey) ?? [];
      siblings.push(folder);
      childrenByParent.set(parentKey, siblings);
    }
    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => a.title.localeCompare(b.title));
    }

    const defaultFolder = available.find((folder) => folder.isDefault);
    const availableNames = new Set(available.map((folder) => folder.name));
    const roots = available.filter((folder) => !folder.parent || !availableNames.has(folder.parent));

    return { roots, childrenByParent, defaultFolder };
  }, [open, folders, currentUserName, movingFolder]);

  const toggle = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const renderRow = (folder: NoteFolder, depth: number) => {
    const children = tree.childrenByParent.get(folder.name) ?? [];
    const isCollapsed = collapsed.has(folder.name);
    const isSelected = selectedParent === folder.name;

    return (
      <div key={folder.name}>
        <div
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 hover:text-accent-foreground",
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => setSelectedParent(folder.name)}
        >
          {children.length > 0 ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 hover:bg-background/60 cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                toggle(folder.name);
              }}
            >
              {isCollapsed ? <ChevronRightIcon className="w-3.5 h-auto" /> : <ChevronDownIcon className="w-3.5 h-auto" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <FolderIcon className="w-4 h-auto shrink-0 text-muted-foreground" />
          <span className="truncate">{folder.isDefault ? t("note.my-notes") : folder.title}</span>
        </div>
        {!isCollapsed && children.map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  // The default folder ("My Notes") is the personal root; root-level folders
  // are shown beneath it, matching the sidebar tree.
  const renderDefaultRow = () => {
    const def = tree.defaultFolder;
    if (!def) {
      return null;
    }
    const rootLevel = (tree.childrenByParent.get("") ?? []).filter((folder) => folder.name !== def.name);
    const children = [...(tree.childrenByParent.get(def.name) ?? []), ...rootLevel];
    const isCollapsed = collapsed.has(def.name);
    const isSelected = selectedParent === def.name;

    return (
      <div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50 hover:text-accent-foreground",
          )}
          style={{ paddingLeft: "8px" }}
          onClick={() => setSelectedParent(def.name)}
        >
          {children.length > 0 ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 hover:bg-background/60 cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                toggle(def.name);
              }}
            >
              {isCollapsed ? <ChevronRightIcon className="w-3.5 h-auto" /> : <ChevronDownIcon className="w-3.5 h-auto" />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <FolderIcon className="w-4 h-auto shrink-0 text-muted-foreground" />
          <span className="truncate">{t("note.my-notes")}</span>
        </div>
        {!isCollapsed && children.map((child) => renderRow(child, 1))}
      </div>
    );
  };

  const handleConfirm = async () => {
    await onConfirm(selectedParent);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("note.move-folder")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[320px] overflow-y-auto">
          {tree.defaultFolder ? renderDefaultRow() : tree.roots.map((folder) => renderRow(folder, 0))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm}>{t("note.move")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
