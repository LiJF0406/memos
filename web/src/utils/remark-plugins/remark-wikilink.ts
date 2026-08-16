import type { Root, Text } from "mdast";
import type { Node as UnistNode } from "unist";
import type { WikiLinkNode, WikiLinkNodeData } from "@/types/markdown";

const MAX_WIKILINK_LENGTH = 512;

type Segment = { type: "text"; value: string } | { type: "wikiLink"; value: string };

function parseWikiLinksFromText(text: string): Segment[] {
  const segments: Segment[] = [];
  const chars = [...text];
  let i = 0;

  while (i < chars.length) {
    if (chars[i] === "[" && chars[i + 1] === "[") {
      let j = i + 2;
      while (j < chars.length && chars[j] !== "]" && chars[j] !== "[" && chars[j] !== "\n") {
        j++;
      }
      if (j < chars.length && chars[j] === "]" && chars[j + 1] === "]") {
        const title = chars
          .slice(i + 2, j)
          .join("")
          .trim();
        if (title.length > 0 && title.length <= MAX_WIKILINK_LENGTH) {
          segments.push({ type: "wikiLink", value: title });
          i = j + 2;
          continue;
        }
      }
    }

    let j = i + 1;
    while (j < chars.length && !(chars[j] === "[" && chars[j + 1] === "[")) {
      j++;
    }
    segments.push({ type: "text", value: chars.slice(i, j).join("") });
    i = j;
  }

  return segments;
}

function createWikiLinkNode(title: string): WikiLinkNode {
  const data: WikiLinkNodeData = {
    hName: "span",
    hProperties: {
      className: "wikilink",
      "data-wikilink": title,
    },
    hChildren: [{ type: "text", value: `[[${title}]]` }],
  };

  return {
    type: "wikiLinkNode",
    value: title,
    data,
  } as WikiLinkNode;
}

type ParentNode = UnistNode & { children: UnistNode[] };

function isParentNode(node: UnistNode): node is ParentNode {
  return Array.isArray((node as { children?: unknown }).children);
}

function isLinkNode(node: UnistNode): boolean {
  return node.type === "link" || node.type === "linkReference";
}

function transformWikiLinkTextNodes(parent: ParentNode, insideLink: boolean): void {
  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children[index];
    const childInsideLink = insideLink || isLinkNode(child);

    if (child.type === "text" && !childInsideLink) {
      const textNode = child as Text;
      const segments = parseWikiLinksFromText(textNode.value);

      if (segments.every((segment) => segment.type === "text")) {
        continue;
      }

      const newNodes = segments.map((segment) => {
        if (segment.type === "wikiLink") {
          return createWikiLinkNode(segment.value);
        }
        return {
          type: "text",
          value: segment.value,
        } as Text;
      });

      parent.children.splice(index, 1, ...(newNodes as UnistNode[]));
      index += newNodes.length - 1;
      continue;
    }

    if (isParentNode(child)) {
      transformWikiLinkTextNodes(child, childInsideLink);
    }
  }
}

export const remarkWikiLink = () => {
  return (tree: Root) => {
    transformWikiLinkTextNodes(tree as ParentNode, false);
  };
};
