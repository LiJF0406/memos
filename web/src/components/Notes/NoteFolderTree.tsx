import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePlus2Icon,
  FolderIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NoteFolder } from "@/types/proto/api/v1/note_service_pb";
import { useTranslate } from "@/utils/i18n";

interface NoteFolderTreeProps {
  folders: NoteFolder[];
  currentUserName: string | undefined;
  defaultFolder: NoteFolder | undefined;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: NoteFolder) => void;
  onDeleteFolder: (folder: NoteFolder) => void;
}

const NoteFolderTree = ({
  folders,
  currentUserName,
  defaultFolder,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: NoteFolderTreeProps) => {
  const t = useTranslate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const personalFolders = useMemo(
    () => folders.filter((folder) => currentUserName !== undefined && folder.creator === currentUserName),
    [folders, currentUserName],
  );
  const sharedFolders = useMemo(
    () => folders.filter((folder) => currentUserName !== undefined && folder.creator !== currentUserName),
    [folders, currentUserName],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, NoteFolder[]>();
    for (const folder of personalFolders) {
      const parentKey = folder.parent ?? "";
      const siblings = map.get(parentKey) ?? [];
      siblings.push(folder);
      map.set(parentKey, siblings);
    }
    for (const siblings of map.values()) {
      siblings.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [personalFolders]);

  const sharedChildrenByParent = useMemo(() => {
    const map = new Map<string, NoteFolder[]>();
    for (const folder of sharedFolders) {
      const parentKey = folder.parent ?? "";
      const siblings = map.get(parentKey) ?? [];
      siblings.push(folder);
      map.set(parentKey, siblings);
    }
    for (const siblings of map.values()) {
      siblings.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [sharedFolders]);

  // Shared subtree roots: the topmost shared folders visible to the current user.
  const sharedRoots = useMemo(() => {
    const sharedParentNames = new Set(sharedFolders.map((folder) => folder.parent));
    return sharedFolders.filter((folder) => !folder.parent || !sharedParentNames.has(folder.parent));
  }, [sharedFolders]);

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

  const renderFolderMenu = (folder: NoteFolder, writable: boolean, allowModify: boolean) => {
    if (!writable) {
      return null;
    }
    return (
      <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 hover:bg-background/60 cursor-pointer"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontalIcon className="w-3.5 h-auto text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={2}>
            <DropdownMenuItem onClick={() => onCreateFolder(folder.name)}>
              <PlusIcon />
              {t("note.new-folder")}
            </DropdownMenuItem>
            {allowModify && (
              <>
                <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
                  <PencilIcon />
                  {t("note.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDeleteFolder(folder)}>
                  <TrashIcon />
                  {t("note.delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    );
  };

  const renderFolder = (folder: NoteFolder, depth: number, childrenMap: Map<string, NoteFolder[]>, writable: boolean) => {
    const children = childrenMap.get(folder.name) ?? [];
    const isCollapsed = collapsed.has(folder.name);
    const isSelected = selectedFolderId === folder.name;

    return (
      <div key={folder.name}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
            isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => onSelectFolder(folder.name)}
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
          <span className="truncate">{folder.title}</span>
          {folder.shared && <LinkIcon className="w-3.5 h-auto shrink-0 text-primary" />}
          {renderFolderMenu(folder, writable, true)}
        </div>
        {!isCollapsed && children.map((child) => renderFolder(child, depth + 1, childrenMap, writable))}
      </div>
    );
  };

  const renderDefaultFolder = () => {
    if (defaultFolder) {
      const isSelected = selectedFolderId === defaultFolder.name;
      const rootChildren = (childrenByParent.get("") ?? []).filter((folder) => folder.name !== defaultFolder.name);
      const children = (childrenByParent.get(defaultFolder.name) ?? []).concat(rootChildren);
      return (
        <div key={defaultFolder.name}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
            )}
            style={{ paddingLeft: "8px" }}
            onClick={() => onSelectFolder(defaultFolder.name)}
          >
            {children.length > 0 ? (
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-background/60 cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(defaultFolder.name);
                }}
              >
                {collapsed.has(defaultFolder.name) ? (
                  <ChevronRightIcon className="w-3.5 h-auto" />
                ) : (
                  <ChevronDownIcon className="w-3.5 h-auto" />
                )}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <FolderIcon className="w-4 h-auto shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{t("note.my-notes")}</span>
            {renderFolderMenu(defaultFolder, true, false)}
          </div>
          {!collapsed.has(defaultFolder.name) && children.map((child) => renderFolder(child, 1, childrenByParent, true))}
        </div>
      );
    }

    // Fallback while the default folder is not available yet: render the
    // legacy "My Notes" entry which selects the root (unfiled) notes.
    return (
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors",
          selectedFolderId === null ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
        )}
        onClick={() => onSelectFolder(null)}
      >
        <span className="w-5 shrink-0" />
        <FilePlus2Icon className="w-4 h-auto shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{t("note.my-notes")}</span>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-0.5">
      {renderDefaultFolder()}
      {!defaultFolder && (childrenByParent.get("") ?? []).map((folder) => renderFolder(folder, 0, childrenByParent, true))}
      {sharedRoots.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          <div className="px-2 py-1 text-xs text-muted-foreground select-none">{t("note.shared")}</div>
          {sharedRoots.map((folder) => renderFolder(folder, 0, sharedChildrenByParent, false))}
        </div>
      )}
      {!defaultFolder && (
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => onCreateFolder(null)}
        >
          <PlusIcon className="w-4 h-auto" />
          <span>{t("note.new-folder")}</span>
        </button>
      )}
    </div>
  );
};

export default NoteFolderTree;
