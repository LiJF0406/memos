import { useSearchParams } from "react-router-dom";
import SearchBar from "@/components/SearchBar";
import useCurrentUser from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import type { StatisticsData } from "@/types/statistics";
import StatisticsView from "../StatisticsView";
import NotesSection from "./NotesSection";
import ShortcutsSection from "./ShortcutsSection";
import TagsSection from "./TagsSection";

export type MemoExplorerContext = "home" | "explore" | "archived" | "profile" | "notes";

export const NOTE_DATE_QUERY_PARAM = "date";
export const NOTE_TAG_QUERY_PARAM = "tag";

export interface MemoExplorerFeatures {
  search?: boolean;
  statistics?: boolean;
  shortcuts?: boolean;
  tags?: boolean;
  notes?: boolean;
}

interface Props {
  className?: string;
  context?: MemoExplorerContext;
  features?: MemoExplorerFeatures;
  statisticsData: StatisticsData;
  tagCount: Record<string, number>;
}

const getDefaultFeatures = (context: MemoExplorerContext): MemoExplorerFeatures => {
  switch (context) {
    case "explore":
      return {
        search: true,
        statistics: true,
        shortcuts: false, // Global explore doesn't use shortcuts
        tags: true,
      };
    case "archived":
      return {
        search: true,
        statistics: true,
        shortcuts: false, // Archived doesn't typically use shortcuts
        tags: true,
      };
    case "profile":
      return {
        search: true,
        statistics: true,
        shortcuts: false, // Profile view doesn't use shortcuts
        tags: true,
      };
    case "notes":
      return {
        search: true,
        statistics: true,
        shortcuts: false, // Notes page doesn't use shortcuts
        tags: true,
        notes: true,
      };
    case "home":
    default:
      return {
        search: true,
        statistics: true,
        shortcuts: true,
        tags: true,
      };
  }
};

const MemoExplorer = (props: Props) => {
  const { className, context = "home", features: featureOverrides = {}, statisticsData, tagCount } = props;
  const currentUser = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNotes = context === "notes";
  const selectedDate = isNotes ? (searchParams.get(NOTE_DATE_QUERY_PARAM) ?? undefined) : undefined;
  const activeTag = isNotes ? (searchParams.get(NOTE_TAG_QUERY_PARAM) ?? undefined) : undefined;

  // Merge default features with overrides
  const features = {
    ...getDefaultFeatures(context),
    ...featureOverrides,
  };

  // Notes: toggle the selected date in the URL. Clicking the same date clears it.
  const handleDateClick = (date: string) => {
    const params = new URLSearchParams(searchParams);
    if (params.get(NOTE_DATE_QUERY_PARAM) === date) {
      params.delete(NOTE_DATE_QUERY_PARAM);
    } else {
      params.set(NOTE_DATE_QUERY_PARAM, date);
    }
    setSearchParams(params);
  };

  // Notes: toggle the selected tag in the URL. Clicking the same tag clears it.
  const handleTagClick = (tag: string) => {
    const params = new URLSearchParams(searchParams);
    if (params.get(NOTE_TAG_QUERY_PARAM) === tag) {
      params.delete(NOTE_TAG_QUERY_PARAM);
    } else {
      params.set(NOTE_TAG_QUERY_PARAM, tag);
    }
    setSearchParams(params);
  };

  return (
    <aside
      className={cn(
        "relative w-full h-full overflow-auto flex flex-col justify-start items-start bg-background text-sidebar-foreground",
        className,
      )}
    >
      {features.search && <SearchBar />}
      <div className="mt-1 px-1 w-full">
        {features.statistics && (
          <StatisticsView statisticsData={statisticsData} onDateClick={isNotes ? handleDateClick : undefined} selectedDate={selectedDate} />
        )}
        {features.notes && <NotesSection />}
        {features.shortcuts && currentUser && <ShortcutsSection />}
        {features.tags && (
          <TagsSection
            readonly={context === "explore"}
            tagCount={tagCount}
            onTagClick={isNotes ? handleTagClick : undefined}
            activeTag={activeTag}
          />
        )}
      </div>
    </aside>
  );
};

export default MemoExplorer;
