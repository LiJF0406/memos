import { timestampDate } from "@bufbuild/protobuf/wkt";
import dayjs from "dayjs";
import { countBy } from "lodash-es";
import { useMemo } from "react";
import type { MemoExplorerContext } from "@/components/MemoExplorer";
import { type MemoTimeBasis, useView } from "@/contexts/ViewContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useNoteCreatedTs, useNotes } from "@/hooks/useNoteQueries";
import { useAllUserStats, useUserStats } from "@/hooks/useUserQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import type { UserStats } from "@/types/proto/api/v1/user_service_pb";
import type { StatisticsData } from "@/types/statistics";

export interface FilteredMemoStats {
  statistics: StatisticsData;
  tags: Record<string, number>;
  loading: boolean;
}

export interface UseFilteredMemoStatsOptions {
  userName?: string;
  context?: MemoExplorerContext;
}

const toDateString = (date: Date) => dayjs(date).format("YYYY-MM-DD");

const timestampsForBasis = (stats: UserStats, basis: MemoTimeBasis) => {
  const createdArray = stats.memoCreatedTimestamps ?? [];
  const updatedArray = stats.memoUpdatedTimestamps ?? [];
  const wantUpdated = basis === "update_time";
  const oldServerFallback = wantUpdated && updatedArray.length === 0 && createdArray.length > 0;
  if (oldServerFallback) {
    console.warn("UserStats.memo_updated_timestamps not present; falling back to memo_created_timestamps");
  }
  return wantUpdated && !oldServerFallback ? updatedArray : createdArray;
};

export const useFilteredMemoStats = (options: UseFilteredMemoStatsOptions = {}): FilteredMemoStats => {
  const { userName, context } = options;
  const currentUser = useCurrentUser();
  const { timeBasis } = useView();

  // home/profile: use backend per-user stats (full tag set, not page-limited)
  const { data: userStats, isLoading: isLoadingUserStats } = useUserStats(userName);
  // explore/archived: fetch backend grouped stats and aggregate them locally.
  // ListAllUserStats AND's the request filter with the server's auth filter, so
  // private memos are not included unless explicitly visible to the current user.
  const exploreVisibilityFilter = currentUser != null ? 'visibility in ["PUBLIC", "PROTECTED"]' : 'visibility in ["PUBLIC"]';
  const allUserStatsRequest =
    context === "explore"
      ? { state: State.NORMAL, filter: exploreVisibilityFilter }
      : context === "archived"
        ? { state: State.ARCHIVED }
        : {};
  const shouldFetchAllUserStats = context === "explore" || (context === "archived" && !!currentUser?.name);
  const { data: allUserStats = [], isLoading: isLoadingAllUserStats } = useAllUserStats(allUserStatsRequest, {
    enabled: shouldFetchAllUserStats,
  });

  // notes: aggregate note creation timestamps from the backend, and tags from
  // the loaded note list (page 1) for the sidebar tag section.
  const { data: noteCreatedTs, isLoading: isLoadingNoteStats } = useNoteCreatedTs(context === "notes");
  const { data: notesData } = useNotes({ pageSize: 200 }, { enabled: context === "notes" });

  const data = useMemo(() => {
    const loading = isLoadingUserStats || isLoadingAllUserStats || isLoadingNoteStats;
    let activityStats: Record<string, number> = {};
    let tagCount: Record<string, number> = {};

    if (context === "notes") {
      activityStats = countBy((noteCreatedTs ?? []).map((ts) => toDateString(timestampDate(ts))));
      for (const note of notesData?.notes ?? []) {
        for (const tag of note.tags ?? []) {
          tagCount[tag] = (tagCount[tag] ?? 0) + 1;
        }
      }
    } else if (context === "explore" || context === "archived") {
      const displayDates: string[] = [];
      for (const stats of allUserStats) {
        for (const [tag, count] of Object.entries(stats.tagCount ?? {})) {
          tagCount[tag] = (tagCount[tag] ?? 0) + count;
        }
        displayDates.push(
          ...timestampsForBasis(stats, timeBasis)
            .map((ts) => (ts ? timestampDate(ts) : undefined))
            .filter((date): date is Date => date !== undefined)
            .map(toDateString),
        );
      }
      activityStats = countBy(displayDates);
    } else if (userName && userStats) {
      // home/profile: use backend per-user stats.
      const sourceArray = timestampsForBasis(userStats, timeBasis);
      if (sourceArray.length > 0) {
        activityStats = countBy(
          sourceArray
            .map((ts) => (ts ? timestampDate(ts) : undefined))
            .filter((date): date is Date => date !== undefined)
            .map(toDateString),
        );
      }
      if (userStats.tagCount) {
        tagCount = userStats.tagCount;
      }
    }

    return { statistics: { activityStats, timeBasis }, tags: tagCount, loading };
  }, [
    context,
    userName,
    userStats,
    allUserStats,
    noteCreatedTs,
    notesData,
    isLoadingUserStats,
    isLoadingAllUserStats,
    isLoadingNoteStats,
    timeBasis,
  ]);

  return data;
};
