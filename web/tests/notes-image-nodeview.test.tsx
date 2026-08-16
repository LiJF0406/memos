import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageNodeView } from "@/components/Notes/NoteEditor/ImageNodeView";

// useTranslate returns the i18n key directly (no i18next backend in tests);
// otherwise t() falls back to the key only when the async resources happen to
// have loaded in this worker, making the assertions order-dependent.
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

const node = {
  attrs: { src: "https://book.x-zone.site/covers/30255971.jpg", alt: "alt text" },
} as never;

function renderNodeView(updateAttributes = vi.fn()) {
  render(<ImageNodeView node={node} updateAttributes={updateAttributes} />);
  return updateAttributes;
}

describe("ImageNodeView", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the image with src and alt", () => {
    renderNodeView();

    const img = screen.getByAltText("alt text");
    expect(img).toHaveAttribute("src", "https://book.x-zone.site/covers/30255971.jpg");
  });

  it("opens the edit dialog from the hover button", () => {
    renderNodeView();

    fireEvent.click(screen.getByTitle("note.edit-image"));
    expect(screen.getByLabelText("note.image-url")).toHaveValue("https://book.x-zone.site/covers/30255971.jpg");
    expect(screen.getByLabelText("note.image-alt")).toHaveValue("alt text");
  });

  it("saves edited URL and alt through updateAttributes", () => {
    const updateAttributes = renderNodeView();

    fireEvent.click(screen.getByTitle("note.edit-image"));
    fireEvent.change(screen.getByLabelText("note.image-url"), { target: { value: "https://example.com/new.jpg" } });
    fireEvent.change(screen.getByLabelText("note.image-alt"), { target: { value: "new alt" } });
    fireEvent.click(screen.getByText("note.save"));

    expect(updateAttributes).toHaveBeenCalledWith({ src: "https://example.com/new.jpg", alt: "new alt" });
  });
});
