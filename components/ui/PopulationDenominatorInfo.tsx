"use client";

import { InfoMarker } from "./InfoMarker";

const COMPACT_COPY =
  "Rate = complaints ÷ fixed ACS 2012–2016 tract population × 1,000. It does not adjust for visitors, commuters, or domain-specific exposure.";

export function PopulationDenominatorInfo({
  onReadMethod,
  align = "end",
}: {
  onReadMethod?: () => void;
  passive?: boolean;
  align?: "start" | "end";
}) {
  return (
    <InfoMarker
      label="How the per-1,000 rate is calculated"
      align={align}
      onReadMethod={onReadMethod}
    >
      <p>{COMPACT_COPY}</p>
    </InfoMarker>
  );
}
