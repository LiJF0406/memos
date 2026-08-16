import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteServiceClient } from "@/connect";
import type { ListNotesRequest, Note } from "@/types/proto/api/v1/note_service_pb";
import { ImportNoteRequestSchema, ListNotesRequestSchema, NoteSchema } from "@/types/proto/api/v1/note_service_pb";

// Query keys factory for consistent cache management.
export const noteKeys = {
  all: ["notes"] as const,
  lists: () => [...noteKeys.all, "list"] as const,
  list: (filters: Partial<ListNotesRequest>) => [...noteKeys.lists(), filters] as const,
  details: () => [...noteKeys.all, "detail"] as const,
  detail: (name: string) => [...noteKeys.details(), name] as const,
  links: (name: string) => [...noteKeys.all, "links", name] as const,
  stats: () => [...noteKeys.all, "stats"] as const,
};

export function useNotes(request: Partial<ListNotesRequest> = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: noteKeys.list(request),
    queryFn: async () => {
      const response = await noteServiceClient.listNotes(create(ListNotesRequestSchema, request as Record<string, unknown>));
      return response;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useNote(name: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: noteKeys.detail(name),
    queryFn: async () => {
      const note = await noteServiceClient.getNote({ name });
      return note;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useNoteCreatedTs(enabled?: boolean) {
  return useQuery({
    queryKey: noteKeys.stats(),
    queryFn: async () => {
      const response = await noteServiceClient.listNoteStats({});
      return response.createdTs;
    },
    enabled,
  });
}

export function useNoteLinks(name: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: noteKeys.links(name),
    queryFn: async () => {
      const response = await noteServiceClient.listNoteLinks({ name });
      return response;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteToCreate: Note) => {
      const note = await noteServiceClient.createNote({ note: noteToCreate });
      return note;
    },
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() });
      queryClient.setQueryData(noteKeys.detail(newNote.name), newNote);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ update, updateMask }: { update: Partial<Note>; updateMask: string[] }) => {
      const note = await noteServiceClient.updateNote({
        note: create(NoteSchema, update as Record<string, unknown>),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      });
      return note;
    },
    onSuccess: (updatedNote) => {
      queryClient.setQueryData(noteKeys.detail(updatedNote.name), updatedNote);
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      await noteServiceClient.deleteNote({ name });
      return name;
    },
    onSuccess: (name) => {
      queryClient.removeQueries({ queryKey: noteKeys.detail(name) });
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() });
    },
  });
}

export function useExportNote() {
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await noteServiceClient.exportNote({ name });
      return response;
    },
  });
}

export function useImportNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: { title: string; content: string; folder?: string }) => {
      const note = await noteServiceClient.importNote(create(ImportNoteRequestSchema, request as Record<string, unknown>));
      return note;
    },
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.lists() });
      queryClient.setQueryData(noteKeys.detail(newNote.name), newNote);
    },
  });
}
