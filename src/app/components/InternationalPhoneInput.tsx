"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CountryCode } from "libphonenumber-js";
import {
  composeInternationalPhoneInput,
  defaultPhoneCountry,
  getCallingCode,
  getSupportedPhoneCountries,
  parseInternationalPhone,
} from "@/lib/phone";

type InternationalPhoneInputProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
  "data-booking-field"?: string;
  disabled?: boolean;
  id?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
};

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryFlag(country: CountryCode) {
  return country
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

function getInitialState(value: string) {
  const parsed = parseInternationalPhone(value);

  if (parsed.valid) {
    return {
      country: parsed.country,
      nationalInput: parsed.nationalDisplay,
    };
  }

  return {
    country: defaultPhoneCountry,
    nationalInput: value,
  };
}

export default function InternationalPhoneInput({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className = "",
  "data-booking-field": dataBookingField,
  disabled = false,
  id,
  onBlur,
  onChange,
  required = false,
  value,
}: InternationalPhoneInputProps) {
  const initial = getInitialState(value);
  const [country, setCountry] = useState<CountryCode>(initial.country);
  const [nationalInput, setNationalInput] = useState(initial.nationalInput);
  const lastEmittedValue = useRef(value);
  const countries = useMemo(
    () =>
      getSupportedPhoneCountries()
        .map((code) => ({
          code,
          label: countryNames.of(code) ?? code,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [],
  );

  useEffect(() => {
    if (value === lastEmittedValue.current) return;

    const next = getInitialState(value);
    setCountry(next.country);
    setNationalInput(next.nationalInput);
    lastEmittedValue.current = value;
  }, [value]);

  function emit(nextCountry: CountryCode, nextNationalInput: string) {
    const nextValue = composeInternationalPhoneInput(
      nextCountry,
      nextNationalInput,
    );
    lastEmittedValue.current = nextValue;
    onChange(nextValue);
  }

  function handleBlur() {
    const parsed = parseInternationalPhone(
      composeInternationalPhoneInput(country, nationalInput),
      country,
    );

    if (parsed.valid) {
      setNationalInput(parsed.nationalDisplay);
      lastEmittedValue.current = parsed.e164;
      onChange(parsed.e164);
    }

    onBlur?.();
  }

  return (
    <div className={`grid min-w-0 grid-cols-[minmax(7.5rem,0.85fr)_minmax(0,1.5fr)] gap-2 ${className}`}>
      <select
        aria-label="Country calling code"
        disabled={disabled}
        value={country}
        onChange={(event) => {
          const nextCountry = event.target.value as CountryCode;
          setCountry(nextCountry);
          emit(nextCountry, nationalInput);
        }}
        className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-2.5 text-sm text-white outline-none focus:border-[#D8C36A] disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:py-3"
      >
        {countries.map(({ code, label }) => (
          <option key={code} value={code}>
            {countryFlag(code)} +{getCallingCode(code)} {label}
          </option>
        ))}
      </select>
      <input
        id={id}
        data-booking-field={dataBookingField}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        autoComplete="tel-national"
        disabled={disabled}
        inputMode="tel"
        type="tel"
        value={nationalInput}
        onBlur={handleBlur}
        onChange={(event) => {
          setNationalInput(event.target.value);
          emit(country, event.target.value);
        }}
        placeholder={country === "ZA" ? "82 123 4567" : "Mobile number"}
        className="min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#D8C36A] aria-[invalid=true]:border-red-400 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl sm:p-3 sm:text-base"
      />
    </div>
  );
}
