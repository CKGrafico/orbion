import { useEffect, useState } from "react";

/**
 * Returns a human-readable, ticking label for how far in the future
 * `isoDate` is. Updates every 10 seconds to keep the countdown fresh.
 * Returns null when `isoDate` is null or already in the past.
 */
export function useNextRunCountdown(isoDate: string | null): string | null {
  const [label, setLabel] = useState<string | null>(() => computeLabel(isoDate));

  useEffect(() => {
    if (!isoDate) {
      setLabel(null);
      return;
    }

    const update = (): void => {
      setLabel(computeLabel(isoDate));
    };

    update();
    const timer = setInterval(update, 10_000);
    return () => clearInterval(timer);
  }, [isoDate]);

  return label;
}

function computeLabel(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return null;

  const totalSec = Math.floor(diff / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  if (mins < 60) return remSec > 0 ? `${mins}m${remSec}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}h${remMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
