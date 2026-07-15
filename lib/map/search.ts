import type { TractFeature } from "@/lib/artifacts";

import { formatTractName } from "./metrics";

export interface TractSearchResult {
  geoid: string;
  label: string;
  borough: string;
  feature: TractFeature;
}

export function searchTracts(
  features: readonly TractFeature[],
  query: string,
  limit = 8,
): TractSearchResult[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0 || limit <= 0) return [];

  return features
    .map((feature) => {
      const label = formatTractName(feature.properties);
      const geoid = feature.properties.geoid;
      const haystack = `${label} ${geoid}`.toLocaleLowerCase();
      const starts =
        geoid.startsWith(normalized) ||
        feature.properties.tractName.toLocaleLowerCase().startsWith(normalized);
      return { feature, geoid, label, borough: feature.properties.borough, haystack, starts };
    })
    .filter((result) => result.haystack.includes(normalized))
    .sort((left, right) => {
      if (left.starts !== right.starts) return left.starts ? -1 : 1;
      return left.label.localeCompare(right.label, "en-US", { numeric: true });
    })
    .slice(0, limit)
    .map((result) => ({
      feature: result.feature,
      geoid: result.geoid,
      label: result.label,
      borough: result.borough,
    }));
}
