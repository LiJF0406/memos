import dayjs from "dayjs";
import { useState } from "react";
import { calculateMaxCount, MonthCalendar } from "@/components/ActivityCalendar";
import { useDateFilterNavigation } from "@/hooks";
import type { StatisticsData } from "@/types/statistics";
import { MonthNavigator } from "./MonthNavigator";

interface Props {
  statisticsData: StatisticsData;
  onDateClick?: (date: string) => void;
  selectedDate?: string;
}

const StatisticsView = (props: Props) => {
  const { statisticsData, onDateClick, selectedDate } = props;
  const { activityStats, timeBasis } = statisticsData;
  const navigateToDateFilter = useDateFilterNavigation();
  const handleDateClick = onDateClick ?? navigateToDateFilter;
  const [visibleMonthString, setVisibleMonthString] = useState(dayjs().format("YYYY-MM"));

  return (
    <div className="group w-full mt-2 flex flex-col text-muted-foreground animate-fade-in">
      <MonthNavigator
        visibleMonth={visibleMonthString}
        onMonthChange={setVisibleMonthString}
        activityStats={activityStats}
        timeBasis={timeBasis}
      />

      <div className="w-full animate-scale-in">
        <MonthCalendar
          month={visibleMonthString}
          data={activityStats}
          maxCount={calculateMaxCount(activityStats)}
          onClick={handleDateClick}
          selectedDate={selectedDate}
          timeBasis={timeBasis}
        />
      </div>
    </div>
  );
};

export default StatisticsView;
