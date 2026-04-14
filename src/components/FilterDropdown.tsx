"use client";

import React, { useState, useRef, useEffect, useId, useCallback } from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  shortLabel?: string;
  /** The selected option's value (e.g. cinema ID, zone string) */
  selectedValue: string;
  /** Override for what to show in the trigger (e.g. cinema name when value is an ID) */
  displayValue?: string;
  /** Placeholder shown when nothing is selected */
  placeholder?: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function FilterDropdown({
  label,
  shortLabel,
  selectedValue,
  displayValue,
  placeholder = "Todos",
  options,
  onChange,
  className = "",
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerId = useId();
  const listId = useId();

  const openDropdown = useCallback(() => {
    const idx = options.findIndex((o) => o.value === selectedValue);
    setFocusedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [options, selectedValue]);

  const closeDropdown = useCallback((returnFocus = true) => {
    setOpen(false);
    setFocusedIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const selectOption = useCallback((value: string) => {
    onChange(value);
    closeDropdown(true);
  }, [onChange, closeDropdown]);

  // Scroll focused option into view — deferred to next frame to avoid forced reflow
  useEffect(() => {
    if (open && listRef.current && focusedIndex >= 0) {
      const items = listRef.current.querySelectorAll("[role='option']");
      const el = items[focusedIndex] as HTMLElement | undefined;
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
    }
  }, [open, focusedIndex]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closeDropdown]);

  // Keyboard handler for the trigger button
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
      case "ArrowDown":
        e.preventDefault();
        openDropdown();
        break;
      case "ArrowUp":
        e.preventDefault();
        // Open to last item
        setFocusedIndex(options.length - 1);
        setOpen(true);
        break;
    }
  };

  // Keyboard handler for the list
  const handleListKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => {
          if (i <= 0) { closeDropdown(); return -1; }
          return i - 1;
        });
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0) selectOption(options[focusedIndex].value);
        break;
      case "Escape":
        e.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown(false);
        break;
    }
  };

  const shown = displayValue ?? selectedValue;
  const isEmpty = !selectedValue;
  const activeDescendantId = open && focusedIndex >= 0 ? `${listId}-opt-${focusedIndex}` : undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full flex items-center gap-1.5 px-2 md:px-4 py-1.5 md:py-2 rounded-xl border transition-colors text-left ${
          open
            ? "border-primary bg-surface-bright"
            : "bg-surface-container-highest border-outline-variant/50 hover:bg-surface-bright hover:border-outline-variant"
        }`}
      >
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[9px] md:text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
            {shortLabel ? (
              <>
                <span className="md:hidden">{shortLabel}</span>
                <span className="hidden md:inline">{label}</span>
              </>
            ) : label}
          </span>
          <span className={`text-xs md:text-base font-semibold truncate leading-tight ${isEmpty ? "text-on-surface-variant/50" : "text-on-surface"}`}>
            {isEmpty ? placeholder : shown}
          </span>
        </div>
        <span
          className="material-symbols-outlined text-on-surface-variant text-base flex-shrink-0 hidden md:inline transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={triggerId}
          aria-activedescendant={activeDescendantId}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-y-auto
            bg-surface-container border border-outline-variant/60 rounded-xl shadow-2xl shadow-black/60 py-1 outline-none"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === selectedValue;
            const isFocused = idx === focusedIndex;
            return (
              <li
                key={opt.value}
                id={`${listId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(opt.value)}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                  isFocused
                    ? "bg-surface-bright"
                    : ""
                } ${
                  isSelected
                    ? "text-primary font-semibold bg-primary/10"
                    : opt.value === ""
                    ? "text-on-surface-variant/70 italic"
                    : "text-on-surface"
                }`}
              >
                {opt.value === "" ? placeholder : opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
