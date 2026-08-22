import { create } from "@bufbuild/protobuf";
import { useSearchParams } from "react-router-dom";
import NoteFolderTree from "@/components/Notes/NoteFolderTree";
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

  const updateFolderParam = (folderId: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (folderId) {
      params.set(FOLDER_QUERY_PARAM, folderId);
    } else {
      params.delete(FOLDER_QUERY_PARAM);
    }
    setSearchParams(params);
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
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
      />
    </div>
  );
};

export default NotesSection;
