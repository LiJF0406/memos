import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildExtensions } from "@/components/MemoEditor/Editor/extensions";
import { TagSuggestion } from "@/components/MemoEditor/Editor/TagSuggestion";

let editor: Editor | null = null;

function createEditor(getTags: () => string[]) {
  editor = new Editor({
    extensions: [...buildExtensions(), TagSuggestion.configure({ getTags })],
    content: "",
    contentType: "markdown",
  });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

// The TagSuggestion plugin registers itself under the "tagSuggestion" key
// (a module-scoped PluginKey). Plugins expose their key string on `plugin.key`,
// so we locate it by name instead of re-creating a PluginKey (whose counter
// differs per instance).
function tagSuggestionState(ed: Editor) {
  const plugin = ed.state.plugins.find((p) => p.key.includes("tagSuggestion"));
  return plugin?.getState(ed.state) as { active: boolean; query: string | null } | undefined;
}

describe("notes editor tag suggestion activation", () => {
  it("activates while typing after # and collects the query", () => {
    const ed = createEditor(() => ["study", "work"]);
    ed.commands.insertContent("#st");

    const state = tagSuggestionState(ed);
    expect(state?.active).toBe(true);
    expect(state?.query).toBe("st");
  });

  it("stays inactive on plain text without #", () => {
    const ed = createEditor(() => ["study"]);
    ed.commands.insertContent("hello");

    const state = tagSuggestionState(ed);
    expect(state?.active).toBe(false);
  });

  it("activates even when the tag list is empty (menu simply renders nothing)", () => {
    const ed = createEditor(() => []);
    ed.commands.insertContent("#a");

    const state = tagSuggestionState(ed);
    expect(state?.active).toBe(true);
    expect(state?.query).toBe("a");
  });
});
