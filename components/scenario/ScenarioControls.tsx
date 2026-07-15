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

import styles from "./ScenarioLab.module.css";

export interface ScenarioControlValues {
  scalingMode: ScalingMode;
  domain: DomainKey;
  k: KValue;
  alpha: AlphaValue;
}

export interface ScenarioControlsProps extends ScenarioControlValues {
  disabled?: boolean;
  onChange: (controls: Partial<ScenarioControlValues>) => void;
}

const SCALING_MODE_LABELS: Record<ScalingMode, string> = {
  rank_balanced: "Rank-balanced",
  magnitude_sensitive: "Magnitude-sensitive",
};

export function ScenarioControls({
  scalingMode,
  domain,
  k,
  alpha,
  disabled = false,
  onChange,
}: ScenarioControlsProps) {
  return (
    <div className={styles.controls} aria-label="Selection scenario controls">
      <fieldset className={styles.fieldset} disabled={disabled}>
        <legend className="field-label">Scoring method</legend>
        <div className={styles.segmented}>
          {(
            ["rank_balanced", "magnitude_sensitive"] as const satisfies readonly ScalingMode[]
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

      <div className={styles.controlGrid}>
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
          <label className="field-label" htmlFor="scenario-k">
            Priority portfolio size (K)
          </label>
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
          <span className="helper-text">
            K is the number of tracts in a deterministic selection scenario; it
            does not represent staff, funding, or other real-world resources.
          </span>
        </div>
      </div>

      <div className="field-stack">
        <div className={styles.rangeLabel}>
          <label className="field-label" htmlFor="scenario-alpha">
            Complaint-intensity weight (alpha)
          </label>
          <output htmlFor="scenario-alpha" className={styles.rangeOutput}>
            {alpha.toFixed(1)}
          </output>
        </div>
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
            <option key={value} value={value} label={value.toFixed(1)} />
          ))}
        </datalist>
        <div className={styles.rangeEnds} aria-hidden="true">
          <span>Lower-income priority</span>
          <span>Complaint intensity</span>
        </div>
      </div>
    </div>
  );
}
