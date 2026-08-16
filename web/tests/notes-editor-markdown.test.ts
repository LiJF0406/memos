import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildExtensions } from "@/components/MemoEditor/Editor/extensions";
import { Image } from "@/components/Notes/NoteEditor/Image";
import {
  applyLinkInputRule,
  IMAGE_INPUT_RULE,
  LINK_INPUT_RULE,
} from "@/components/Notes/NoteEditor/MarkdownInputRules";

// Headless editor with the same extension set as the notes editor (shared
// memo extensions + Image), so markdown links/images are exercised end to end.
let editor: Editor | null = null;

function createNoteEditor(content: string): Editor {
  editor = new Editor({
    extensions: [...buildExtensions(), Image],
    content,
    contentType: "markdown",
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("notes editor markdown links and images", () => {
  it("parses [text](url) into a link mark", () => {
    const ed = createNoteEditor("See [title](https://www.example.com) for details");

    expect(ed.getJSON()).toMatchObject({
      content: [
        {
          content: [
            { type: "text", text: "See " },
            {
              type: "text",
              text: "title",
              marks: [{ type: "link", attrs: { href: "https://www.example.com" } }],
            },
            { type: "text", text: " for details" },
          ],
        },
      ],
    });
    expect(ed.getMarkdown().trim()).toBe("See [title](https://www.example.com) for details");
  });

  it("parses ![alt](url) into an image node and keeps the syntax on save", () => {
    const ed = createNoteEditor("![alt text](https://book.x-zone.site/covers/30255971.jpg)");

    // A lone image line may land directly under the doc or inside a paragraph.
    const blocks = ed.getJSON().content ?? [];
    const nodes = blocks.flatMap((block) => (block.type === "paragraph" ? block.content ?? [block] : [block]));
    expect(nodes).toContainEqual(
      expect.objectContaining({
        type: "image",
        attrs: expect.objectContaining({
          src: "https://book.x-zone.site/covers/30255971.jpg",
          alt: "alt text",
        }),
      }),
    );
    // The image syntax must survive a save cycle (previously degraded to text).
    expect(ed.getMarkdown().trim()).toBe("![alt text](https://book.x-zone.site/covers/30255971.jpg)");
  });

  it("round-trips links and images together", () => {
    const ed = createNoteEditor(
      "[title](https://www.example.com)\n\n![alt text](https://book.x-zone.site/covers/30255971.jpg)",
    );

    expect(ed.getMarkdown().trim()).toBe(
      "[title](https://www.example.com)\n\n![alt text](https://book.x-zone.site/covers/30255971.jpg)",
    );
  });

  it("keeps image syntax inside paragraphs intact", () => {
    const ed = createNoteEditor("正文里的图片：![alt text](https://book.x-zone.site/covers/30255971.jpg) 以及文字");

    expect(ed.getJSON().content?.[0]?.content).toContainEqual(
      expect.objectContaining({ type: "image" }),
    );
    expect(ed.getMarkdown().trim()).toBe(
      "正文里的图片：![alt text](https://book.x-zone.site/covers/30255971.jpg) 以及文字",
    );
  });
});

describe("notes editor markdown input rules", () => {
  it("matches link syntax typed with a trailing space", () => {
    const match = "[title](https://www.example.com) ".match(LINK_INPUT_RULE);
    expect(match?.[1]).toBe("title");
    expect(match?.[2]).toBe("https://www.example.com");
  });

  it("matches image syntax typed with a trailing space", () => {
    const match = "![alt text](https://book.x-zone.site/covers/30255971.jpg) ".match(IMAGE_INPUT_RULE);
    expect(match?.[1]).toBe("alt text");
    expect(match?.[2]).toBe("https://book.x-zone.site/covers/30255971.jpg");
  });

  it("does not match incomplete syntax without a closing bracket", () => {
    expect("[title](https://www.example.com".match(LINK_INPUT_RULE)).toBeNull();
    expect("![alt](https://book.x-zone.site/covers/30255971.jpg".match(IMAGE_INPUT_RULE)).toBeNull();
  });
});

describe("notes editor link input rule conversion", () => {
  it("turns the typed [text](url) syntax into a clickable link", () => {
    const ed = createNoteEditor("placeholder");
    // Set the typed syntax as plain text (JSON parse, not markdown).
    ed.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "[title](https://www.example.com) " }] }],
    });
    const text = ed.getText();
    const match = LINK_INPUT_RULE.exec(text);
    expect(match).not.toBeNull();

    const state = ed.state;
    const tr = state.tr;
    const applied = applyLinkInputRule(tr, { from: 0, to: text.length }, match!);
    expect(applied).toBe(true);
    ed.view.dispatch(tr);

    expect(ed.getJSON().content?.[0]?.content).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: "title",
        marks: [
          expect.objectContaining({
            type: "link",
            attrs: expect.objectContaining({ href: "https://www.example.com" }),
          }),
        ],
      }),
    );
    // The original syntax must survive a save cycle for later editing.
    expect(ed.getMarkdown().trim()).toBe("[title](https://www.example.com)");
  });

  it("keeps the raw text when the URL is not allowed", () => {
    const ed = createNoteEditor("placeholder");
    ed.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "[title](javascript:alert(1)) " }] }],
    });
    const text = ed.getText();
    const match = LINK_INPUT_RULE.exec(text);
    expect(match).not.toBeNull();

    const state = ed.state;
    const tr = state.tr;
    const applied = applyLinkInputRule(tr, { from: 0, to: text.length }, match!);
    ed.view.dispatch(tr);

    expect(applied).toBe(false);
    expect(ed.getText()).toBe("[title](javascript:alert(1)) ");
  });
});
