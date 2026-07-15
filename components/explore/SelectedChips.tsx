"use client";

import type { TractFeature } from "@/lib/artifacts/schemas";

export function SelectedChips({
  features,
  selectedGeoids,
  activeGeoid,
  onActivate,
  onRemove,
}: {
  features: readonly TractFeature[];
  selectedGeoids: readonly string[];
  activeGeoid: string | null;
  onActivate: (geoid: string) => void;
  onRemove: (geoid: string) => void;
}) {
  const byGeoid = new Map(
    features.map((feature) => [feature.properties.geoid, feature] as const),
  );
  return (
    <div className="chip-list" aria-label="Selected census tracts">
      {selectedGeoids.map((geoid, index) => {
        const feature = byGeoid.get(geoid);
        if (!feature) return null;
        return (
          <div className="tract-chip" key={geoid} data-active={activeGeoid === geoid}>
            <button
              type="button"
              className="text-button"
              onClick={() => onActivate(geoid)}
              aria-label={`Make Census Tract ${feature.properties.tractName}, ${feature.properties.borough} active`}
            >
              <span className="chip-index" aria-hidden="true">
                {index + 1}
              </span>{" "}
              Tract {feature.properties.tractName}
            </button>
            <button
              type="button"
              className="text-button"
              aria-label={`Remove Census Tract ${feature.properties.tractName}`}
              onClick={() => onRemove(geoid)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
