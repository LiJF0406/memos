import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TagsSection from "@/components/MemoExplorer/TagsSection";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";

vi.mock("@/contexts/MemoFilterContext", () => ({
  useMemoFilterContext: vi.fn(),
}));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
vi.mock("@/components/TagTree", () => ({ default: () => null }));

const mockFilterContext = () => {
  const getFiltersByFactor = vi.fn(() => []);
  const addFilter = vi.fn();
  const removeFilter = vi.fn();
  vi.mocked(useMemoFilterContext).mockReturnValue({
    getFiltersByFactor,
    addFilter,
    removeFilter,
  } as never);
  return { getFiltersByFactor, addFilter, removeFilter };
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("TagsSection", () => {
  it("uses MemoFilterContext when no custom handler is provided (memo contexts)", () => {
    const { addFilter, removeFilter } = mockFilterContext();

    render(<TagsSection tagCount={{ study: 2 }} />);
    fireEvent.click(screen.getByText("study"));

    expect(removeFilter).toHaveBeenCalled();
    expect(addFilter).toHaveBeenCalledWith({ factor: "tagSearch", value: "study" });
  });

  it("uses the custom handler and active tag in notes context", () => {
    mockFilterContext();
    const onTagClick = vi.fn();

    render(<TagsSection tagCount={{ study: 2, go: 1 }} activeTag="study" onTagClick={onTagClick} />);
    fireEvent.click(screen.getByText("study"));
    fireEvent.click(screen.getByText("go"));

    expect(onTagClick).toHaveBeenCalledTimes(2);
    expect(onTagClick).toHaveBeenNthCalledWith(1, "study");
    expect(onTagClick).toHaveBeenNthCalledWith(2, "go");
    // Active tag renders with text-primary, inactive with text-muted-foreground.
    expect(screen.getByText("study").closest("[class*='text-primary']")).not.toBeNull();
    expect(screen.getByText("go").closest("[class*='text-muted-foreground']")).not.toBeNull();
  });
});
