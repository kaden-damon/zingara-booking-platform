# Phase 50.14 — Guided Training Preview Loading Fix

Verified 22 October 2026 SAST.

The preview's module interface was gated behind a client-only bootstrap, so a
development runtime/origin failure left the server-rendered loading message on
screen indefinitely. The preview now receives its authorised synthetic
bootstrap from the server page and renders the module cards immediately. The
authenticated Academy route keeps its existing permissions and API loading.

The local server was restarted on `192.168.1.78:3000`, matching the Mac's Wi-Fi
interface. Mac Chrome and physical iPhone Safari both rendered the preview over
the LAN. Standard Booking, Corporate Booking, and Buyout were each completed
through their synthetic confirmation states, including a 390px mobile run.

No Production business data was read or changed by the workflows. No migration,
commit, push, or deployment was performed. The local server remains running.
