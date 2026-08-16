import type { Element } from "hast";
import { createContext, useContext } from "react";
import { extractMemoIdFromName, extractNoteIdFromName } from "@/helpers/resource-names";
import useNavigateTo from "@/hooks/useNavigateTo";
import { cn } from "@/lib/utils";
import { NoteLinkTargetType } from "@/types/proto/api/v1/note_service_pb";

export interface ResolvedWikiLink {
  targetType: NoteLinkTargetType;
  target?: string;
}

// Provides title -> resolved link lookup for the read-only wiki link renderer.
export const WikiLinkResolutionContext = createContext<((title: string) => ResolvedWikiLink | undefined) | undefined>(undefined);

interface WikiLinkProps extends React.HTMLAttributes<HTMLSpanElement> {
  node?: Element;
  "data-wikilink"?: string;
  children?: React.ReactNode;
}

export const WikiLink: React.FC<WikiLinkProps> = ({ "data-wikilink": title, children, className, node: _node, ...props }) => {
  const resolve = useContext(WikiLinkResolutionContext);
  const navigateTo = useNavigateTo();

  const resolved = resolve ? resolve(title || "") : undefined;
  const target = resolved?.target;
  const targetType = resolved?.targetType ?? NoteLinkTargetType.UNRESOLVED;

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!target) {
      return;
    }
    if (targetType === NoteLinkTargetType.MEMO) {
      navigateTo(`/memos/${extractMemoIdFromName(target)}`);
    } else if (targetType === NoteLinkTargetType.NOTE) {
      navigateTo(`/notes/${extractNoteIdFromName(target)}`);
    }
  };

  const resolvedClass = target ? "text-primary underline decoration-dotted underline-offset-4" : "text-muted-foreground";

  return (
    <span
      className={cn("wikilink cursor-pointer font-medium transition-opacity hover:opacity-75", resolvedClass, className)}
      data-wikilink={title}
      onClick={handleClick}
      {...props}
    >
      {children}
    </span>
  );
};
