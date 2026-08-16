import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { PencilIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslate } from "@/utils/i18n";
import { IMAGE_CLASS } from "./Image";

interface ImageEditFormProps {
  initialSrc: string;
  initialAlt: string;
  onCancel: () => void;
  onSave: (src: string, alt: string) => void;
}

function ImageEditForm({ initialSrc, initialAlt, onCancel, onSave }: ImageEditFormProps) {
  const t = useTranslate();
  const [src, setSrc] = useState(initialSrc);
  const [alt, setAlt] = useState(initialAlt);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedSrc = src.trim();
    if (!trimmedSrc) {
      return;
    }
    onSave(trimmedSrc, alt.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="note-image-url">{t("note.image-url")}</Label>
        <Input id="note-image-url" value={src} onChange={(event) => setSrc(event.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note-image-alt">{t("note.image-alt")}</Label>
        <Input id="note-image-alt" value={alt} onChange={(event) => setAlt(event.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("note.cancel")}
        </Button>
        <Button type="submit">{t("note.save")}</Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Editor NodeView for image nodes: renders the <img> plus a hover edit button
 * that opens a dialog to change the URL/alt text. Once saved the node attrs
 * update and the markdown serializes back to `![alt](url)`.
 */
export function ImageNodeView({ node, updateAttributes }: ReactNodeViewProps) {
  const t = useTranslate();
  const [editing, setEditing] = useState(false);

  return (
    <NodeViewWrapper className="inline-flex align-middle" data-drag-handle>
      <span className="group relative inline-flex">
        <img src={node.attrs.src} alt={node.attrs.alt} className={IMAGE_CLASS} draggable={false} />
        <button
          type="button"
          title={t("note.edit-image")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(true);
          }}
          className="absolute -top-2 -right-2 rounded-full bg-background p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
        >
          <PencilIcon className="w-3.5 h-auto" />
        </button>
      </span>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("note.edit-image")}</DialogTitle>
            <DialogDescription>{t("note.edit-image-description")}</DialogDescription>
          </DialogHeader>
          <ImageEditForm
            initialSrc={node.attrs.src ?? ""}
            initialAlt={node.attrs.alt ?? ""}
            onCancel={() => setEditing(false)}
            onSave={(src, alt) => {
              updateAttributes({ src, alt });
              setEditing(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}
