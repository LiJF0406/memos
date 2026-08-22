import { create } from "@bufbuild/protobuf";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import NoteFolderTree from "@/components/Notes/NoteFolderTree";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateNoteFolder, useDeleteNoteFolder, useNoteFolders, useUpdateNoteFolder } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import type { NoteFolder } from "@/types/proto/api/v1/note_service_pb";
import { NoteFolderSchema } from "@/types/proto/api/v1/note_service_pb";
import { useTranslate } from "@/utils/i18n";

const FOLDER_QUERY_PARAM = "folder";

const NotesSection = () => {
  const t = useTranslate();
  const currentUser = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFolderId = searchParams.get(FOLDER_QUERY_PARAM);

  const { data: foldersData } = useNoteFolders();
  const folders = foldersData?.noteFolders ?? [];
  const defaultFolder = folders.find((folder) => folder.isDefault && folder.creator === currentUser?.name);

  const createFolder = useCreateNoteFolder();
  const updateFolder = useUpdateNoteFolder();
  const deleteFolder = useDeleteNoteFolder();

  // Folder name dialog (shared by create and rename).
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename">("create");
  const [folderDialogParent, setFolderDialogParent] = useState<string | null>(null);
  const [folderDialogTarget, setFolderDialogTarget] = useState<NoteFolder | null>(null);
  const [folderTitle, setFolderTitle] = useState("");
  const [folderDialogSubmitting, setFolderDialogSubmitting] = useState(false);
  // Delete confirmation.
  const [deleteTarget, setDeleteTarget] = useState<NoteFolder | null>(null);

  const updateFolderParam = (folderId: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (folderId) {
      params.set(FOLDER_QUERY_PARAM, folderId);
    } else {
      params.delete(FOLDER_QUERY_PARAM);
    }
    setSearchParams(params);
  };

  const openCreateFolderDialog = (parentId: string | null) => {
    setFolderDialogMode("create");
    setFolderDialogParent(parentId);
    setFolderDialogTarget(null);
    setFolderTitle("");
    setFolderDialogOpen(true);
  };

  const openRenameFolderDialog = (folder: NoteFolder) => {
    setFolderDialogMode("rename");
    setFolderDialogTarget(folder);
    setFolderTitle(folder.title);
    setFolderDialogOpen(true);
  };

  const handleSubmitFolder = async () => {
    const title = folderTitle.trim();
    if (!title) {
      return;
    }
    setFolderDialogSubmitting(true);
    try {
      if (folderDialogMode === "create") {
        await createFolder.mutateAsync(
          create(NoteFolderSchema, {
            title,
            parent: folderDialogParent ?? undefined,
            shared: false,
          }),
        );
      } else if (folderDialogTarget) {
        await updateFolder.mutateAsync({
          update: { name: folderDialogTarget.name, title },
          updateMask: ["title"],
        });
      }
      setFolderDialogOpen(false);
    } finally {
      setFolderDialogSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    await deleteFolder.mutateAsync(deleteTarget.name);
    if (selectedFolderId === deleteTarget.name) {
      updateFolderParam(null);
    }
  };

  return (
    <div className="w-full flex flex-col justify-start items-start mt-3 px-1 h-auto shrink-0 flex-nowrap">
      <div className="flex flex-row justify-between items-center w-full gap-1 mb-1 text-sm leading-6 text-muted-foreground select-none">
        <span>{t("common.notes")}</span>
      </div>
      <NoteFolderTree
        folders={folders}
        currentUserName={currentUser?.name}
        defaultFolder={defaultFolder}
        selectedFolderId={selectedFolderId ?? defaultFolder?.name ?? null}
        onSelectFolder={updateFolderParam}
        onCreateFolder={openCreateFolderDialog}
        onRenameFolder={openRenameFolderDialog}
        onDeleteFolder={setDeleteTarget}
      />

      <Dialog open={folderDialogOpen} onOpenChange={(open) => !folderDialogSubmitting && setFolderDialogOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{folderDialogMode === "create" ? t("note.new-folder") : t("note.rename")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={folderTitle}
            placeholder={t("note.folder-name")}
            onChange={(event) => setFolderTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSubmitFolder();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" disabled={folderDialogSubmitting} onClick={() => setFolderDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={!folderTitle.trim() || folderDialogSubmitting} onClick={handleSubmitFolder}>
              {folderDialogMode === "create" ? t("common.create") : t("note.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("note.delete")}
        description={t("note.confirm-delete-folder")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        confirmVariant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default NotesSection;
