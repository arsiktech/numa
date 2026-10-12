import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  parsePeriodFromSearch,
  periodToSearchParams,
  rangeForSelection,
  type PeriodRange,
  type PeriodSelection
} from "@/lib/period";

export function usePeriodSelection() {
  const [params, setParams] = useSearchParams();
  const selection = useMemo(() => parsePeriodFromSearch(params), [params]);
  const setSelection = useCallback(
    (next: PeriodSelection) => {
      const nextParams = periodToSearchParams(next, params);
      setParams(nextParams, { replace: true });
    },
    [params, setParams]
  );
  return [selection, setSelection] as const;
}

export function usePeriodRange(): PeriodRange {
  const [selection] = usePeriodSelection();
  return useMemo(() => rangeForSelection(selection), [selection]);
}
