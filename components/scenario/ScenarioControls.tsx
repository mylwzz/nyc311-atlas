"use client";

import {
  ALPHA_VALUES,
  DOMAIN_CONFIG,
  DOMAIN_KEYS,
  K_VALUES,
  type AlphaValue,
  type DomainKey,
  type KValue,
  type ScalingMode,
} from "@/lib/domain";
import { InfoMarker } from "@/components/ui/InfoMarker";

import styles from "./ScenarioLab.module.css";

export interface ScenarioControlValues {
  scalingMode: ScalingMode;
  domain: DomainKey;
  k: KValue;
  alpha: AlphaValue;
}

export interface ScenarioControlsProps extends ScenarioControlValues {
  disabled?: boolean;
  onReadMethod?: () => void;
  onChange: (controls: Partial<ScenarioControlValues>) => void;
}

const SCALING_MODE_LABELS: Record<ScalingMode, string> = {
  rank_balanced: "Rank-balanced",
  magnitude_sensitive: "Magnitude-sensitive",
};

function InlineHelp({
  label,
  children,
  onReadMethod,
}: {
  label: string;
  children: React.ReactNode;
  onReadMethod?: () => void;
}) {
  return (
    <InfoMarker label={label} align="end" onReadMethod={onReadMethod}>
      {children}
    </InfoMarker>
  );
}

export function ScenarioControls({
  scalingMode,
  domain,
  k,
  alpha,
  disabled = false,
  onReadMethod,
  onChange,
}: ScenarioControlsProps) {
  const intensityWeight = Math.round(alpha * 100);
  const incomeWeight = 100 - intensityWeight;

  return (
    <div className={styles.controls} aria-label="Priority settings">
      <div className="field-stack">
        <label className="field-label" htmlFor="scenario-domain">
          Service domain
        </label>
        <select
          id="scenario-domain"
          className="select"
          value={domain}
          disabled={disabled}
          onChange={(event) =>
            onChange({ domain: event.target.value as DomainKey })
          }
        >
          {DOMAIN_KEYS.map((key) => (
            <option key={key} value={key}>
              {DOMAIN_CONFIG[key].label}
            </option>
          ))}
        </select>
      </div>

      <div className="field-stack">
        <div className={styles.labelWithHelp}>
          <span className="field-label" id="scoring-approach-label">
            Scoring approach
          </span>
          <InlineHelp
            label="About the scoring approaches"
            onReadMethod={onReadMethod}
          >
            <p>
              <strong>Rank-balanced</strong> uses percentile positions. It
              compares relative standing and limits the influence of extreme
              outliers.
            </p>
            <p>
              <strong>Magnitude-sensitive</strong> uses standard deviations
              from the tract mean. Extremely unusual complaint intensities can
              exert more influence.
            </p>
          </InlineHelp>
        </div>
        <fieldset
          className={styles.fieldset}
          disabled={disabled}
          aria-labelledby="scoring-approach-label"
        >
          <legend className={styles.srOnly}>Scoring approach</legend>
          <div className={styles.segmented}>
            {(
              [
                "rank_balanced",
                "magnitude_sensitive",
              ] as const satisfies readonly ScalingMode[]
            ).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={scalingMode === mode}
                onClick={() => onChange({ scalingMode: mode })}
              >
                {SCALING_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="field-stack">
        <label className="field-label" htmlFor="scenario-alpha">
          Priority balance
        </label>
        <input
          id="scenario-alpha"
          className={styles.range}
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={alpha}
          disabled={disabled}
          list="scenario-alpha-values"
          onChange={(event) =>
            onChange({ alpha: Number(event.target.value) as AlphaValue })
          }
        />
        <datalist id="scenario-alpha-values">
          {ALPHA_VALUES.map((value) => (
            <option key={value} value={value} label={`${value * 100}%`} />
          ))}
        </datalist>
        <div className={styles.rangeEnds} aria-hidden="true">
          <span>Lower-income priority</span>
          <span>Complaint intensity</span>
        </div>
        <output
          htmlFor="scenario-alpha"
          className={styles.balanceSentence}
          aria-live="polite"
        >
          This selection gives {intensityWeight}% weight to complaint intensity
          and {incomeWeight}% to lower-income priority.
        </output>
      </div>

      <div className="field-stack">
        <div className={styles.labelWithHelp}>
          <label className="field-label" htmlFor="scenario-k">
            Number of tracts to surface
          </label>
          <InlineHelp
            label="About the number of tracts to surface"
            onReadMethod={onReadMethod}
          >
            <p>
              The score ranks eligible tracts. This setting controls how many
              of the highest-ranked tracts appear. It does not represent
              staffing, funding, inspections, or interventions.
            </p>
          </InlineHelp>
        </div>
        <select
          id="scenario-k"
          className="select"
          value={k}
          disabled={disabled}
          onChange={(event) =>
            onChange({ k: Number(event.target.value) as KValue })
          }
        >
          {K_VALUES.map((value) => (
            <option key={value} value={value}>
              {value} tracts
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
