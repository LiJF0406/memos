import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageNodeView } from "@/components/Notes/NoteEditor/ImageNodeView";

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

    fireEvent.click(screen.getByTitle("Edit image"));
    expect(screen.getByLabelText("Image URL")).toHaveValue("https://book.x-zone.site/covers/30255971.jpg");
    expect(screen.getByLabelText("Alt text")).toHaveValue("alt text");
  });

  it("saves edited URL and alt through updateAttributes", () => {
    const updateAttributes = renderNodeView();

    fireEvent.click(screen.getByTitle("Edit image"));
    fireEvent.change(screen.getByLabelText("Image URL"), { target: { value: "https://example.com/new.jpg" } });
    fireEvent.change(screen.getByLabelText("Alt text"), { target: { value: "new alt" } });
    fireEvent.click(screen.getByText("Save"));

    expect(updateAttributes).toHaveBeenCalledWith({ src: "https://example.com/new.jpg", alt: "new alt" });
  });
});
