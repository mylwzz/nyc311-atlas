"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import type { TractFeature } from "@/lib/artifacts";
import { searchTracts, type TractSearchResult } from "@/lib/map";

import styles from "./TractSearch.module.css";

export interface TractSearchProps {
  features: readonly TractFeature[];
  onSelect: (result: TractSearchResult) => void;
  placeholder?: string;
  className?: string;
}

export function TractSearch({
  features,
  onSelect,
  placeholder = "Search tract, GEOID, or borough",
  className,
}: TractSearchProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(
    () => searchTracts(features, query),
    [features, query],
  );
  const listId = `${id}-results`;
  const activeResult = results[activeIndex];

  const choose = (result: TractSearchResult) => {
    onSelect(result);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && activeResult) {
      event.preventDefault();
      choose(activeResult);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={[styles.search, className].filter(Boolean).join(" ")}
      onBlur={onBlur}
    >
      <label className={styles.label} htmlFor={`${id}-input`}>
        Search by tract number, GEOID, or borough
      </label>
      <div className={styles.inputWrap}>
        <svg
          aria-hidden="true"
          className={styles.icon}
          viewBox="0 0 20 20"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m12.5 12.5 4 4" />
        </svg>
        <input
          id={`${id}-input`}
          className={styles.input}
          value={query}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && results.length > 0}
          aria-activedescendant={
            open && activeResult ? `${id}-result-${activeIndex}` : undefined
          }
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && query.trim() && (
        <ul className={styles.results} id={listId} role="listbox">
          {results.length === 0 ? (
            <li className={styles.empty} role="option" aria-selected="false">
              No matching tract
            </li>
          ) : (
            results.map((result, index) => (
              <li
                id={`${id}-result-${index}`}
                key={result.geoid}
                className={
                  index === activeIndex
                    ? `${styles.result} ${styles.active}`
                    : styles.result
                }
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(result)}
              >
                <span>{result.label}</span>
                <span className={styles.geoid}>GEOID {result.geoid}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
