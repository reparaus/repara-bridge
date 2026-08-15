import { useEffect, useState } from "react";

import { vehicleModelsRemote } from "./vehicle-data.functions";
import { modelSuggestions } from "./vehicle-data";

/**
 * Model suggestions for a make (narrowed by year when supplied).
 *
 * Starts from the offline list so the dropdown is useful instantly, then merges
 * in the remote catalog. A failed lookup is silent — the offline list stays and
 * manual typing is never blocked.
 */
export function useModelSuggestions(make: string, year: string) {
  const offline = modelSuggestions(make);
  const [remote, setRemote] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = make.trim();
    setRemote([]);
    if (trimmed.length < 2) return;

    let cancelled = false;
    // Debounced so typing a make character by character isn't one call each.
    const timer = window.setTimeout(() => {
      setLoading(true);
      void vehicleModelsRemote({
        data: { make: trimmed, year: /^\d{4}$/.test(year) ? year : undefined },
      })
        .then((result) => {
          if (!cancelled) setRemote(result.models);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setLoading(false);
      window.clearTimeout(timer);
    };
  }, [make, year]);

  // Offline entries first: they're the popular models for that make.
  const options = remote.length > 0 ? [...offline, ...remote] : offline;
  return { options, loading };
}
