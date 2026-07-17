export type RoyalDecreeSection = {
  body: string[];
  heading: string;
  items?: string[];
};

export type RoyalDecree = {
  href: string;
  icon: string;
  sections: RoyalDecreeSection[];
  slug: string;
  summary: string;
  title: string;
};

export const royalDecrees: RoyalDecree[] = [
  {
    href: "/royal-decrees/terms-and-conditions",
    icon: "📜",
    sections: [
      {
        body: [
          "These Terms & Conditions guide the use of The Royal Countess by Zingara booking platform. They exist to keep the guest journey clear, fair and beautifully organised from first booking to final curtain.",
          "By using the platform, guests agree to provide accurate information, respect the booking process and follow the policies that apply to reservations, payment, cancellation, entry and communication.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "The platform allows guests to browse available experiences, request or create bookings, make payment, receive digital tickets and manage selected booking actions.",
          "All bookings remain subject to show availability, seating availability, successful payment and operational confirmation by The Royal Countess team.",
        ],
        heading: "Use Of The Platform",
      },
      {
        body: [
          "Guests are responsible for entering correct names, contact details, guest numbers, dietary notes and any special requirements before submitting a booking or enquiry.",
          "If a detail changes after submission, guests should contact the box office as soon as possible so that the team can assist before the event.",
        ],
        heading: "Guest Responsibilities",
        items: [
          "Use accurate contact details.",
          "Review the booking summary before payment.",
          "Keep the booking reference and ticket safe.",
          "Arrive with a valid ticket or booking reference.",
        ],
      },
      {
        body: [
          "A booking is only treated as confirmed once the relevant payment has been successfully received and the platform has issued the confirmation or ticket.",
          "The Royal Countess may contact a guest where additional information is needed to complete or protect the booking.",
        ],
        heading: "Booking Acceptance",
      },
      {
        body: [
          "The Royal Countess may update these terms from time to time to reflect operational, venue, payment or legal changes. The version displayed at the time of booking applies to that booking unless a change is required by law or operational necessity.",
        ],
        heading: "Updates",
      },
    ],
    slug: "terms-and-conditions",
    summary:
      "The general guest terms for using The Royal Countess by Zingara booking platform.",
    title: "Terms & Conditions",
  },
  {
    href: "/royal-decrees/booking-terms",
    icon: "🎟",
    sections: [
      {
        body: [
          "Booking Terms explain how reservations are created, confirmed, managed and presented for entry to The Royal Countess experience.",
          "The aim is to make each booking clear for the guest and practical for the venue team preparing the evening.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "Standard bookings are created through the public booking journey. Corporate bookings begin as enquiries and may be converted into confirmed bookings once the operational details are agreed.",
          "Guests should review the date, time, seating zone, party size and contact details before continuing to payment.",
        ],
        heading: "Creating A Booking",
      },
      {
        body: [
          "Seating zones and tables are allocated according to availability, party size and venue operations. Where the platform suggests a best fit, the final operational seating remains subject to the venue layout and any confirmed table changes.",
          "Guests with accessibility needs, dietary notes or special requests should add these details at booking or contact Guest Services promptly.",
        ],
        heading: "Seating And Guest Details",
      },
      {
        body: [
          "Digital tickets are issued after successful payment confirmation. Each ticket or booking reference should be kept available for admission and check-in.",
          "Where individual guest tickets are available, each guest ticket may be managed separately before the event, subject to ticket status and operational rules.",
        ],
        heading: "Tickets And Admission",
      },
      {
        body: [
          "Guests may be asked to present their booking reference, digital ticket or identification where required to protect the booking and ensure smooth entry.",
        ],
        heading: "Entry Requirements",
      },
    ],
    slug: "booking-terms",
    summary:
      "Booking-specific terms covering reservations, seating, tickets and admission.",
    title: "Booking Terms",
  },
  {
    href: "/royal-decrees/booking-and-cancellation-policy",
    icon: "↩",
    sections: [
      {
        body: [
          "This policy explains how booking changes, cancellations and refund reviews are handled for The Royal Countess experience.",
          "Hospitality planning begins well before guests arrive, so cancellation requests are managed carefully and fairly.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "Guests who need to change or cancel a booking should contact the box office with the booking reference and the reason for the request.",
          "The team will review the booking status, payment status, event date and operational impact before confirming what options are available.",
        ],
        heading: "Cancellation Requests",
      },
      {
        body: [
          "Refund eligibility depends on the timing of the request, the payment status, the booking type and any confirmed event-specific terms.",
          "Approved refunds are processed through the appropriate payment channel where possible. Processing times may depend on banks, payment providers and administrative review.",
        ],
        heading: "Refund Review",
      },
      {
        body: [
          "Corporate bookings may involve quotations, invoices, deposits, guest-number changes, menu requirements and operational planning. Cancellation or change requests for corporate bookings may therefore require additional review.",
        ],
        heading: "Corporate Bookings",
      },
      {
        body: [
          "If The Royal Countess must change, postpone or cancel an event, affected guests will be contacted using the booking details provided. The team will explain the available options as clearly as possible.",
        ],
        heading: "Event Changes",
      },
    ],
    slug: "booking-and-cancellation-policy",
    summary:
      "The policy for booking changes, cancellations and refund review.",
    title: "Booking & Cancellation Policy",
  },
  {
    href: "/royal-decrees/payment-terms",
    icon: "💳",
    sections: [
      {
        body: [
          "Payment Terms explain how payments, deposits, balances and payment confirmation work for The Royal Countess by Zingara.",
          "They are designed to keep the checkout experience secure, transparent and easy to understand.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "Standard booking payments are completed through the secure online payment flow. A booking may remain pending until payment confirmation has been received.",
          "The Royal Countess does not treat a return from a payment page alone as proof of payment. Payment confirmation is verified through the approved payment process.",
        ],
        heading: "Payment Confirmation",
      },
      {
        body: [
          "Where deposits are available, the payment summary will show the amount due today and any outstanding balance. Guests remain responsible for settling any remaining amount according to the booking terms.",
        ],
        heading: "Deposits And Balances",
      },
      {
        body: [
          "Corporate bookings may be quoted, invoiced or paid through a payment link depending on the agreed workflow. A corporate booking is confirmed only once the required payment and operational confirmation are complete.",
        ],
        heading: "Corporate Payments",
      },
      {
        body: [
          "If a payment fails, expires or is cancelled, the booking may remain pending and tickets will not be issued until successful payment is confirmed.",
        ],
        heading: "Failed Or Cancelled Payments",
      },
    ],
    slug: "payment-terms",
    summary:
      "Payment terms covering deposits, full payment, pending payment and confirmation.",
    title: "Payment Terms",
  },
  {
    href: "/royal-decrees/privacy-policy",
    icon: "🔒",
    sections: [
      {
        body: [
          "This Privacy Policy explains how The Royal Countess by Zingara handles guest, booking, staff and communication information.",
          "The platform collects only the information needed to manage bookings, provide service, issue tickets, communicate with guests and operate the venue responsibly.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "Information may include names, email addresses, mobile numbers, booking details, payment status, ticket references, seating information, dietary notes, communication records and operational preferences.",
          "Corporate enquiries may also include company details, event requirements, guest numbers, bar tab selections and add-ons.",
        ],
        heading: "Information We Collect",
      },
      {
        body: [
          "Information is used to create and manage bookings, issue tickets, send confirmations, assist with guest service, support check-in, manage corporate enquiries and improve operational readiness.",
          "The Royal Countess may also use contact details for necessary service communication connected to a booking or enquiry.",
        ],
        heading: "How Information Is Used",
      },
      {
        body: [
          "Information is shared only where required to operate the booking, payment, communication, ticketing or venue workflow, or where required by law.",
          "Guest information is not sold.",
        ],
        heading: "Information Sharing",
      },
      {
        body: [
          "Guests may request assistance with updating or reviewing their information by contacting Guest Services. Requests will be handled according to applicable South African privacy and access-to-information requirements.",
        ],
        heading: "Guest Rights",
      },
    ],
    slug: "privacy-policy",
    summary:
      "How guest, booking and communication information is handled.",
    title: "Privacy Policy",
  },
  {
    href: "/royal-decrees/cookie-policy",
    icon: "🍪",
    sections: [
      {
        body: [
          "This Cookie Policy explains how The Royal Countess platform uses cookies and browser storage to support the guest and staff experience.",
          "These tools help the platform remember practical choices, support private preview access and keep the application responsive.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "Essential cookies may be used for security, private preview access, session handling and basic platform operation. Without these, parts of the platform may not work correctly.",
        ],
        heading: "Essential Cookies",
      },
      {
        body: [
          "Browser storage may be used for preferences such as notification choices, Academy progress, favourites, recently viewed lessons and selected location context.",
          "These preferences are designed to improve convenience and do not replace official booking records.",
        ],
        heading: "Preferences",
      },
      {
        body: [
          "Guests can manage cookies through their browser settings. Blocking essential cookies may affect login, private preview access, booking continuation or app-like behaviour.",
        ],
        heading: "Managing Cookies",
      },
      {
        body: [
          "If analytics or additional preference tools are introduced in future, this policy should be reviewed and updated before those tools are used.",
        ],
        heading: "Future Updates",
      },
    ],
    slug: "cookie-policy",
    summary:
      "Information about cookies and local browser storage used by the platform.",
    title: "Cookie Policy",
  },
  {
    href: "/royal-decrees/access-to-information-paia",
    icon: "📂",
    sections: [
      {
        body: [
          "This Access to Information page sets out the PAIA framework for requesting access to records held by Zingara Productions (Pty) Ltd.",
          "It is intended to help guests, customers and authorised parties understand where requests should be directed.",
        ],
        heading: "Purpose",
      },
      {
        body: [
          "The Information Officer for PAIA-related requests is Guest Services. Requests should be directed to boxoffice@zingara.co.za with enough detail to identify the record being requested.",
        ],
        heading: "Information Officer",
      },
      {
        body: [
          "Records may relate to bookings, guest communication, company information, operational documents or other categories required by applicable law.",
          "Access may be limited where records are confidential, protected, commercially sensitive, not held by the company or restricted by law.",
        ],
        heading: "Records And Access",
      },
      {
        body: [
          "A request should include the requester’s contact details, the record requested, the reason for the request where required, and any supporting information needed to process the request.",
        ],
        heading: "Request Process",
      },
      {
        body: [
          "Any applicable fees, timeframes or additional procedural requirements will be communicated once a request has been reviewed.",
        ],
        heading: "Fees And Timeframes",
      },
    ],
    slug: "access-to-information-paia",
    summary:
      "Access-to-information guidance for PAIA requests and official records.",
    title: "Access to Information (PAIA)",
  },
  {
    href: "/royal-decrees/contact-and-company-information",
    icon: "📞",
    sections: [
      {
        body: [
          "This page provides the official contact and company information for The Royal Countess by Zingara and Zingara Productions (Pty) Ltd.",
        ],
        heading: "Guest Services",
        items: [
          "Email: boxoffice@zingara.co.za",
          "Telephone: 021 891 0448",
          "Business Hours: Monday – Friday, 08:00 – 17:00",
        ],
      },
      {
        body: [
          "For booking-related support, guests should use the contact channel most relevant to the nature of the enquiry.",
        ],
        heading: "Bookings",
        items: [
          "Bookings: bookings@zingara.co.za",
          "Corporate Bookings: corporatebookings@zingara.co.za",
        ],
      },
      {
        body: [
          "The registered business information below identifies the legal entity responsible for the platform and associated guest experience.",
        ],
        heading: "Company Information",
        items: [
          "Registered Business Name: Zingara Productions (Pty) Ltd",
          "Registration Number: 2025/603851/07",
          "VAT Number: 4450323193",
        ],
      },
      {
        body: [
          "The registered address for formal correspondence is listed below.",
        ],
        heading: "Registered Address",
        items: [
          "22 Tiverton Road",
          "Plumstead",
          "Cape Town",
          "Western Cape",
          "7800",
          "South Africa",
        ],
      },
      {
        body: [
          "PAIA and information-access enquiries should be directed to the Information Officer contact below.",
        ],
        heading: "Information Officer",
        items: [
          "Information Officer: Guest Services",
          "Email: boxoffice@zingara.co.za",
        ],
      },
    ],
    slug: "contact-and-company-information",
    summary:
      "Official guest services, booking, company and information officer details.",
    title: "Contact & Company Information",
  },
];

export function getRoyalDecree(slug: string) {
  return royalDecrees.find((decree) => decree.slug === slug) ?? null;
}
