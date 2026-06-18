import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpIcon } from "lucide-react";
import { lazy, type ReactElement, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MentionResolutionProvider } from "@/components/MemoContent/MentionResolutionContext";
import { Button } from "@/components/ui/button";
import { userServiceClient } from "@/connect";
import type { MemoFilter } from "@/contexts/MemoFilterContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { DEFAULT_LIST_MEMOS_PAGE_SIZE } from "@/helpers/consts";
import { useInfiniteMemos } from "@/hooks/useMemoQueries";
import { userKeys } from "@/hooks/useUserQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import MemoFilters from "../MemoFilters";
import Placeholder from "../Placeholder";
import Skeleton from "../Skeleton";

const MemoEditor = lazy(() => import("../MemoEditor"));

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function deriveDefaultCreateTimeFromFilters(filters: MemoFilter[], now: Date = new Date()): Date | undefined {
  const dateFilter = filters.find((f) => f.factor === "displayTime");
  if (!dateFilter) return undefined;
  const match = DATE_RE.exec(dateFilter.value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return undefined;
  }
  return candidate;
}

interface Props {
  renderer: (memo: Memo) => ReactElement;
  listSort?: (list: Memo[]) => Memo[];
  state?: State;
  orderBy?: string;
  filter?: string;
  pageSize?: number;
  showCreator?: boolean;
  enabled?: boolean;
  /** When true, render the inline MemoEditor above the list (e.g. on the Home page). */
  showMemoEditor?: boolean;
}

function useAutoFetchWhenNotScrollable({
  hasNextPage,
  isFetchingNextPage,
  memoCount,
  onFetchNext,
}: {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  memoCount: number;
  onFetchNext: () => Promise<unknown>;
}) {
  const autoFetchTimeoutRef = useRef<number | null>(null);

  const isPageScrollable = useCallback(() => {
    const documentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    return documentHeight > window.innerHeight + 100;
  }, []);

  const checkAndFetchIfNeeded = useCallback(async () => {
    if (autoFetchTimeoutRef.current) {
      clearTimeout(autoFetchTimeoutRef.current);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    const shouldFetch = !isPageScrollable() && hasNextPage && !isFetchingNextPage && memoCount > 0;

    if (shouldFetch) {
      await onFetchNext();

      autoFetchTimeoutRef.current = window.setTimeout(() => {
        void checkAndFetchIfNeeded();
      }, 500);
    }
  }, [hasNextPage, isFetchingNextPage, memoCount, isPageScrollable, onFetchNext]);

  useEffect(() => {
    if (!isFetchingNextPage && memoCount > 0) {
      void checkAndFetchIfNeeded();
    }
  }, [memoCount, isFetchingNextPage, checkAndFetchIfNeeded]);

  useEffect(() => {
    return () => {
      if (autoFetchTimeoutRef.current) {
        clearTimeout(autoFetchTimeoutRef.current);
      }
    };
  }, []);
}

const PagedMemoList = (props: Props) => {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const { filters } = useMemoFilterContext();

  const showMemoEditor = props.showMemoEditor ?? false;
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteMemos(
    {
      state: props.state || State.NORMAL,
      orderBy: props.orderBy || "create_time desc",
      filter: props.filter,
      pageSize: props.pageSize || DEFAULT_LIST_MEMOS_PAGE_SIZE,
    },
    { enabled: props.enabled ?? true },
  );

  // Flatten pages into a single array of memos
  const memos = useMemo(() => data?.pages.flatMap((page) => page.memos) || [], [data]);

  // Apply custom sorting if provided, otherwise use memos directly
  const sortedMemoList = useMemo(() => (props.listSort ? props.listSort(memos) : memos), [memos, props.listSort]);

  // Prefetch creators when new data arrives to improve performance
  useEffect(() => {
    if (!data?.pages || !props.showCreator) return;

    const lastPage = data.pages[data.pages.length - 1];
    if (!lastPage?.memos) return;

    const uniqueCreators = Array.from(new Set(lastPage.memos.map((memo) => memo.creator)));
    for (const creator of uniqueCreators) {
      void queryClient.prefetchQuery({
        queryKey: userKeys.detail(creator),
        queryFn: async () => {
          const user = await userServiceClient.getUser({ name: creator });
          return user;
        },
        staleTime: 1000 * 60 * 5,
      });
    }
  }, [data?.pages, props.showCreator, queryClient]);

  // Auto-fetch hook: fetches more content when page isn't scrollable
  useAutoFetchWhenNotScrollable({
    hasNextPage,
    isFetchingNextPage,
    memoCount: sortedMemoList.length,
    onFetchNext: fetchNextPage,
  });

  // Infinite scroll: fetch more when user scrolls near bottom
  useEffect(() => {
    if (!hasNextPage) return;

    const handleScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
      if (nearBottom && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const children = (
    <MentionResolutionProvider contents={sortedMemoList.map((memo) => memo.content)}>
      <div className="flex flex-col justify-start w-full max-w-2xl mx-auto">
        {/* Show skeleton loader during initial load */}
        {isLoading ? (
          <Skeleton showCreator={props.showCreator} count={4} />
        ) : (
          <>
            {showMemoEditor ? (
              <Suspense fallback={null}>
                <MemoEditor
                  className="mb-2"
                  cacheKey="home-memo-editor"
                  placeholder={t("editor.any-thoughts")}
                  defaultCreateTime={defaultCreateTime}
                />
              </Suspense>
            ) : null}
            <MemoFilters />
            {sortedMemoList.map((memo) => props.renderer(memo))}

            {/* Loading indicator for pagination */}
            {isFetchingNextPage && <Skeleton showCreator={props.showCreator} count={2} />}

            {/* Empty state or back-to-top button */}
            {!isFetchingNextPage && (
              <>
                {!hasNextPage && sortedMemoList.length === 0 ? (
                  <Placeholder variant="empty" message={t("message.no-data")} />
                ) : (
                  <div className="w-full opacity-70 flex flex-row justify-center items-center my-4">
                    <BackToTop />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </MentionResolutionProvider>
  );

  return children;
};

const BackToTop = () => {
  const t = useTranslate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 400;
      setIsVisible(shouldShow);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <Button variant="ghost" onClick={scrollToTop}>
      {t("router.back-to-top")}
      <ArrowUpIcon className="ml-1 w-4 h-auto" />
    </Button>
  );
};

export default PagedMemoList;
