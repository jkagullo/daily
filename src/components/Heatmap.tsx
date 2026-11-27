import { useMemo } from "react";
import type { DaySummary } from "../lib/db";
import { buildCells, HEATMAP_WEEKS } from "../lib/heatmap";

interface Props {
  today: Date;
  summaries: DaySummary[];
  weeks?: number;
  selected?: string | null;
  onSelect?: (dateKey: string) => void;
}

export function Heatmap({ today, summaries, weeks = HEATMAP_WEEKS, selected, onSelect }: Props) {
  const cells = useMemo(() => buildCells(today, summaries, weeks), [today, summaries, weeks]);

  return (
    <div className="heatmap" aria-label={`Completion over the last ${weeks} weeks`}>
      {cells.map((c) => {
        if (c.future) return <div key={c.key} className="cell future" />;
        const label = `${c.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${
          c.summary ? `${c.summary.done}/${c.summary.total} done` : "no tasks"
        }`;
        return (
          <button
            key={c.key}
            className={`cell l${c.level}${selected === c.key ? " selected" : ""}`}
            title={label}
            aria-label={label}
            onClick={() => onSelect?.(c.key)}
          />
        );
      })}
    </div>
  );
}
