"use client";

import {
  forwardRef,
  memo,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

type AdminSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "value"
> & {
  delay?: number;
  onSearchChange: (value: string) => void;
  value: string;
};

export const AdminSearchInput = memo(
  forwardRef<HTMLInputElement, AdminSearchInputProps>(function AdminSearchInput(
    { delay = 180, onSearchChange, value, ...inputProps },
    forwardedRef,
  ) {
    const [draft, setDraft] = useState(value);
    const onSearchChangeRef = useRef(onSearchChange);
    const lastEmittedValueRef = useRef(value);

    useEffect(() => {
      onSearchChangeRef.current = onSearchChange;
    }, [onSearchChange]);

    useEffect(() => {
      if (value !== lastEmittedValueRef.current) {
        lastEmittedValueRef.current = value;
        setDraft(value);
      }
    }, [value]);

    useEffect(() => {
      if (draft === lastEmittedValueRef.current) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        lastEmittedValueRef.current = draft;
        onSearchChangeRef.current(draft);
      }, delay);

      return () => window.clearTimeout(timeoutId);
    }, [delay, draft]);

    return (
      <input
        {...inputProps}
        ref={forwardedRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }),
);
