update public.workflow_configurations
set body = $$Dear {{customerName}},

The curtain is almost ready to rise — your Zingara experience is just around the corner.

We look forward to welcoming you to {{showName}}. Please confirm your attendance below.$$
where workflow_key = 'pre_show_reminder'
  and body = $$Dear {{customerName}},

The curtain is almost ready to rise — your Zingara experience is just around the corner.

We look forward to welcoming you to {{showName}}.

Your booking details

Booking reference: {{bookingRef}}
Performance date: {{showDate}}
City and venue: {{location}}
Guests: {{guest_count}}
Seating zone: {{seatingZone}}
Grounds Open: {{groundsOpen}}
Guest Seating: {{guestSeating}}
Show Starts: {{showStarts}}

Everything you need for the evening is available on your digital ticket:

{{ticketUrl}}

Please note:

Beverages are charged separately.

A 12.5% gratuity will be applied to beverages and the dinner portion of your tickets for bookings of 6 or more.

We can't wait to welcome you into the world of Zingara.

The Zingara Team$$;
