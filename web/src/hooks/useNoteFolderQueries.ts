import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteFolderServiceClient } from "@/connect";
import type { ListNoteFoldersRequest, NoteFolder } from "@/types/proto/api/v1/note_service_pb";
import { ListNoteFoldersRequestSchema, NoteFolderSchema } from "@/types/proto/api/v1/note_service_pb";

// Query keys factory for consistent cache management.
export const noteFolderKeys = {
  all: ["noteFolders"] as const,
  lists: () => [...noteFolderKeys.all, "list"] as const,
  list: (filters: Partial<ListNoteFoldersRequest>) => [...noteFolderKeys.lists(), filters] as const,
};

export function useNoteFolders(request: Partial<ListNoteFoldersRequest> = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: noteFolderKeys.list(request),
    queryFn: async () => {
      const response = await noteFolderServiceClient.listNoteFolders(
        create(ListNoteFoldersRequestSchema, request as Record<string, unknown>),
      );
      return response;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCreateNoteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderToCreate: NoteFolder) => {
      const folder = await noteFolderServiceClient.createNoteFolder({ noteFolder: folderToCreate });
      return folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteFolderKeys.lists() });
    },
  });
}

export function useUpdateNoteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ update, updateMask }: { update: Partial<NoteFolder>; updateMask: string[] }) => {
      const folder = await noteFolderServiceClient.updateNoteFolder({
        noteFolder: create(NoteFolderSchema, update as Record<string, unknown>),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      });
      return folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteFolderKeys.lists() });
    },
  });
}

export function useDeleteNoteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      await noteFolderServiceClient.deleteNoteFolder({ name });
      return name;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: noteFolderKeys.lists() });
    },
  });
}
