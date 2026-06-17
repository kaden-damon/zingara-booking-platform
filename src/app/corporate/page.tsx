"use client";

import { type FormEvent, useState } from "react";

import { getTemplates } from "../../lib/supabase/communicationTemplates";
import { syncCorporateRequestCommunications } from "../../lib/supabase/communications";
import { createCorporateRequest } from "../../lib/supabase/corporateRequests";
import {
  type CorporateRequest,
  type DemoBooking,
  createCommunicationRecord,
  getCommunicationTemplate,
  renderCommunicationTemplate,
  seatingZones,
} from "../../lib/zingaraDemo";

const occasionOptions = [
  "Year-End Function",
  "Client Entertainment",
  "Team Celebration",
  "Birthday",
  "Product Launch",
  "Corporate Hospitality",
  "Other",
];
const dietaryOptions = [
  "Vegetarian",
  "Vegan",
  "Halaal Friendly",
  "Strictly Halaal",
  "Gluten Free",
  "Nut Allergy",
  "Dairy Free",
  "Other",
];
const barTabOptions = [
  "No Bar Tab",
  "R500",
  "R1,000",
  "R2,000",
  "Open Tab",
];
const corporateAddons = [
  "Arrival Drinks",
  "Dedicated Hostess / Butler",
  "Custom Menu Cards",
  "Personalised Table Signage",
  "Face Painting",
  "Tarot Card Readings",
];
const calendarMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const calendarWeekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type CorporateFormState = {
  addons: string[];
  alternativeDate: string;
  barTab: string;
  companyName: string;
  contactName: string;
  contactNumber: string;
  dietaryRequirements: string[];
  email: string;
  guestCount: number;
  notes: string;
  occasion: string;
  otherDietaryRequirement: string;
  otherOccasion: string;
  preferredDate: string;
  seatingPreference: string;
};

const initialFormState: CorporateFormState = {
  addons: [],
  alternativeDate: "",
  barTab: "No Bar Tab",
  companyName: "",
  contactName: "",
  contactNumber: "",
  dietaryRequirements: [],
  email: "",
  guestCount: 6,
  notes: "",
  occasion: "Year-End Function",
  otherDietaryRequirement: "",
  otherOccasion: "",
  preferredDate: "",
  seatingPreference: "Golden Circle",
};

function createCorporateRequestId() {
  return `CORP-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

function toggleSelection(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function getMonthKey(dateValue: string) {
  return dateValue.slice(0, 7);
}

function getCalendarDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: Array<number | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(day);
  }

  return days;
}

function getDateDisplay(dateValue: string) {
  if (!dateValue) {
    return "Select date";
  }

  const [year, month, day] = dateValue.split("-");

  return `${day}/${month}/${year.slice(-2)}`;
}

export default function CorporateBookingPage() {
  const [form, setForm] = useState<CorporateFormState>(initialFormState);
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [openCalendarField, setOpenCalendarField] = useState<
    "alternativeDate" | "preferredDate" | null
  >(null);
  const [calendarMonth, setCalendarMonth] = useState("2026-06");
  const calendarDays = getCalendarDays(calendarMonth);

  function createRequest(
    requestType: CorporateRequest["requestType"],
  ) {
    const now = new Date().toISOString();

    return {
      ...form,
      id: createCorporateRequestId(),
      status: "corporate-tentative" as const,
      requestType,
      source: "Corporate Direct" as const,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function createCorporateTentativeCommunication(
    request: CorporateRequest,
  ) {
    const templates = await getTemplates();
    const template = getCommunicationTemplate(
      templates,
      "corporate-tentative-booking",
      "email",
    );

    if (!template) {
      return [];
    }

    const templateBooking = {
      amountPaid: 0,
      balanceDue: 0,
      bookingDate: request.preferredDate,
      communicationHistory: [],
      customer: {
        email: request.email,
        name: request.contactName,
        phone: request.contactNumber,
      },
      partySize: request.guestCount,
      reference: request.id,
      showId: undefined,
      tableNumber: "",
      ticketCode: request.id,
      totalPrice: 0,
      zoneTitle: request.seatingPreference,
    } as unknown as DemoBooking;

    return [
      createCommunicationRecord({
        booking: templateBooking,
        channel: template.channel,
        message: renderCommunicationTemplate(template.body, templateBooking),
        sentAt: request.createdAt,
        subject: renderCommunicationTemplate(
          template.subject,
          templateBooking,
        ),
        templateId: template.id,
        trigger: template.trigger,
      }),
    ];
  }

  async function persistCorporateRequest(
    requestType: CorporateRequest["requestType"],
  ) {
    const nextRequest = createRequest(requestType);
    const requestWithCommunication = {
      ...nextRequest,
      communicationHistory:
        requestType === "corporate-booking"
          ? await createCorporateTentativeCommunication(nextRequest)
          : [],
    };

    await createCorporateRequest(requestWithCommunication);
    void syncCorporateRequestCommunications(requestWithCommunication);
    setSubmissionStatus(
      requestType === "agent-contact"
        ? "Agent contact request received."
        : "Corporate booking request received.",
    );
  }

  function submitCorporateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistCorporateRequest("corporate-booking");
  }

  function openCalendar(field: "alternativeDate" | "preferredDate") {
    const fieldDate = form[field];

    setCalendarMonth(fieldDate ? getMonthKey(fieldDate) : calendarMonth);
    setOpenCalendarField((currentField) =>
      currentField === field ? null : field,
    );
  }

  function selectCalendarDate(day: number) {
    if (!openCalendarField) {
      return;
    }

    const dateValue = `${calendarMonth}-${String(day).padStart(2, "0")}`;

    setForm((currentForm) => ({
      ...currentForm,
      [openCalendarField]: dateValue,
    }));
    setOpenCalendarField(null);
  }

  function renderDatePicker(
    label: string,
    field: "alternativeDate" | "preferredDate",
    isRequired = false,
  ) {
    return (
      <div className="relative">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </span>
        <button
          type="button"
          onClick={() => openCalendar(field)}
          className="mt-2 flex w-full items-center justify-between rounded-2xl border border-white/15 bg-black px-4 py-3 text-left text-white outline-none transition hover:border-[#D8C36A]/60"
          aria-label={label}
        >
          <span>{getDateDisplay(form[field])}</span>
          <span className="text-[#F2D66C]">▾</span>
        </button>
        {isRequired && !form[field] && (
          <input
            required
            readOnly
            tabIndex={-1}
            value={form[field]}
            className="sr-only"
          />
        )}

        {openCalendarField === field && (
          <div className="absolute left-0 top-full z-30 mt-3 w-full min-w-72 rounded-[1.5rem] border border-[#D8C36A]/25 bg-zinc-950 p-4 shadow-2xl shadow-black/60">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const [year, month] = calendarMonth.split("-").map(Number);
                  const nextDate = new Date(year, month - 2, 1);

                  setCalendarMonth(
                    `${nextDate.getFullYear()}-${String(
                      nextDate.getMonth() + 1,
                    ).padStart(2, "0")}`,
                  );
                }}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white"
              >
                ‹
              </button>
              <p className="text-sm font-semibold text-white">
                {calendarMonths[Number(calendarMonth.slice(5, 7)) - 1]}{" "}
                {calendarMonth.slice(0, 4)}
              </p>
              <button
                type="button"
                onClick={() => {
                  const [year, month] = calendarMonth.split("-").map(Number);
                  const nextDate = new Date(year, month, 1);

                  setCalendarMonth(
                    `${nextDate.getFullYear()}-${String(
                      nextDate.getMonth() + 1,
                    ).padStart(2, "0")}`,
                  );
                }}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-zinc-300 transition hover:border-[#D8C36A]/50 hover:text-white"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              {calendarWeekdays.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) =>
                day ? (
                  <button
                    key={`${calendarMonth}-${day}`}
                    type="button"
                    onClick={() => selectCalendarDate(day)}
                    className={`aspect-square rounded-xl text-sm font-semibold transition ${
                      form[field] ===
                      `${calendarMonth}-${String(day).padStart(2, "0")}`
                        ? "bg-[#D8C36A] text-black"
                        : "border border-[#D8C36A]/25 bg-[#D8C36A]/10 text-[#F2D66C] hover:bg-[#D8C36A]/20"
                    }`}
                  >
                    {day}
                  </button>
                ) : (
                  <span key={`empty-${index}`} />
                ),
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 pb-16 pt-8 text-white sm:px-6 sm:py-16">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#D8C36A]">
          Corporate Booking
        </p>
        <h1 className="mt-3 text-4xl font-bold uppercase sm:text-6xl">
          Group & Event Enquiry
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400 sm:text-lg">
          Submit a premium group enquiry for The Royal Countess Zingara.
          Our team will review availability and prepare a quote for your
          preferred event date.
        </p>

        <div className="mt-8 rounded-[1.5rem] border border-[#D8C36A]/25 bg-zinc-950/80 p-5 shadow-2xl shadow-black/30 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">
                Prefer to speak to someone directly?
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                Request a call from one of our corporate booking agents.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void persistCorporateRequest("agent-contact")}
              className="rounded-full border border-[#D8C36A]/45 bg-[#D8C36A] px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black transition hover:bg-[#F2D66C]"
            >
              Request Agent Contact
            </button>
          </div>
          {submissionStatus && (
            <p className="mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-950/25 px-4 py-3 text-sm font-semibold text-emerald-200">
              {submissionStatus}
            </p>
          )}
        </div>

        <form
          onSubmit={submitCorporateRequest}
          className="mt-8 space-y-6 rounded-[2rem] border border-[#8D7A2F]/25 bg-[#080808] p-5 shadow-2xl shadow-black/35 sm:p-8"
        >
          <section>
            <h2 className="text-2xl font-bold uppercase">
              Group & Event Details
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ["Company Name", "companyName", "text"],
                ["Contact Person Full Name", "contactName", "text"],
                ["Contact Number", "contactNumber", "tel"],
                ["Email Address", "email", "email"],
              ].map(([label, key, type]) => (
                <label key={key} className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {label}
                  </span>
                  <input
                    required={key !== "alternativeDate"}
                    type={type}
                    value={String(form[key as keyof CorporateFormState])}
                    onChange={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        [key]: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
                  />
                </label>
              ))}

              {renderDatePicker(
                "Preferred Event Date",
                "preferredDate",
                true,
              )}
              {renderDatePicker(
                "Alternative Event Date",
                "alternativeDate",
              )}

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Number of Guests
                </span>
                <input
                  required
                  type="number"
                  min={1}
                  value={form.guestCount}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      guestCount: Number(event.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Preferred Seating Section
                </span>
                <select
                  value={form.seatingPreference}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      seatingPreference: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
                >
                  {seatingZones.map((zone) => (
                    <option key={zone.id} value={zone.title}>
                      {zone.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Occasion / Purpose
              </span>
              <select
                value={form.occasion}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    occasion: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
              >
                {occasionOptions.map((occasion) => (
                  <option key={occasion}>{occasion}</option>
                ))}
              </select>
            </label>

            {form.occasion === "Other" && (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Other Description
                </span>
                <input
                  value={form.otherOccasion}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      otherOccasion: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
                />
              </label>
            )}
          </section>

          <section className="border-t border-white/10 pt-6">
            <h2 className="text-2xl font-bold uppercase">
              Food & Beverage
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {dietaryOptions.map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                    form.dietaryRequirements.includes(option)
                      ? "border-[#D8C36A] bg-[#D8C36A] text-black"
                      : "border-white/15 bg-black/35 text-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.dietaryRequirements.includes(option)}
                    onChange={() =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        dietaryRequirements: toggleSelection(
                          currentForm.dietaryRequirements,
                          option,
                        ),
                      }))
                    }
                    className="sr-only"
                  />
                  {option}
                </label>
              ))}
            </div>
            <p className="mt-3 text-sm text-[#F2D66C]">
              Strictly halaal requests may incur an additional surcharge.
            </p>
            {form.dietaryRequirements.includes("Other") && (
              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Other Dietary Requirement
                </span>
                <input
                  value={form.otherDietaryRequirement}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      otherDietaryRequirement: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
                />
              </label>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Would you like a bar tab?
              </span>
              <select
                value={form.barTab}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    barTab: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
              >
                {barTabOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="border-t border-white/10 pt-6">
            <h2 className="text-2xl font-bold uppercase">
              Corporate Add-Ons
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {corporateAddons.map((addon) => (
                <label
                  key={addon}
                  className={`cursor-pointer rounded-2xl border p-4 text-sm font-semibold transition ${
                    form.addons.includes(addon)
                      ? "border-[#D8C36A] bg-[#D8C36A]/15 text-[#F2D66C]"
                      : "border-white/10 bg-black/35 text-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.addons.includes(addon)}
                    onChange={() =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        addons: toggleSelection(
                          currentForm.addons,
                          addon,
                        ),
                      }))
                    }
                    className="mr-3 accent-[#D8C36A]"
                  />
                  {addon}
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[#D8C36A]/30 bg-[#1A1208]/55 p-5">
            <h2 className="text-xl font-bold uppercase">
              Payment & Gratuity
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-200">
              <li>Full payment is required upfront to confirm the booking.</li>
              <li>A quote will be issued after submission.</li>
              <li>Once the quote is accepted an invoice will be generated.</li>
              <li>Bookings remain subject to availability.</li>
              <li>Proof of payment is required to secure the reservation.</li>
              <li>
                A gratuity of 12.5% applies to bookings of 6 guests or more.
              </li>
            </ul>
          </section>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Notes
            </span>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  notes: event.target.value,
                }))
              }
              rows={4}
              className="mt-2 w-full rounded-2xl border border-white/15 bg-black px-4 py-3 text-white outline-none transition focus:border-[#D8C36A]/70"
              placeholder="Event timing, hosting notes, access needs, or special requests."
            />
          </label>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void persistCorporateRequest("agent-contact")}
              className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-zinc-200 transition hover:bg-white hover:text-black"
            >
              Request Agent Contact
            </button>
            <button
              type="submit"
              className="rounded-full bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C]"
            >
              Submit Corporate Booking
            </button>
          </div>

          {submissionStatus && (
            <p className="rounded-2xl border border-emerald-300/30 bg-emerald-950/25 px-4 py-3 text-sm font-semibold text-emerald-200">
              {submissionStatus}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
