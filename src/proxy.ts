import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const cookieName = "zingara_preview_access";
const cookieMaxAge = 60 * 60 * 24 * 30;

function getExpectedCookieValue(password: string) {
  return createHash("sha256")
    .update(`zingara-private-preview:${password}`)
    .digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function passwordPage(request: NextRequest, error = false) {
  const action = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const errorMarkup = error
    ? '<p class="error" role="alert">Incorrect password</p>'
    : "";

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Private Preview | The Royal Countess Zingara</title>
    <style>
      :root {
        color-scheme: dark;
        --gold: #d8c36a;
        --gold-soft: rgba(216, 195, 106, 0.28);
        --panel: rgba(10, 10, 10, 0.86);
        --line: rgba(216, 195, 106, 0.28);
        --text: #fffaf0;
        --muted: rgba(255, 250, 240, 0.72);
      }
      * {
        box-sizing: border-box;
      }
      body {
        min-height: 100vh;
        margin: 0;
        background:
          radial-gradient(circle at 50% 18%, rgba(216, 195, 106, 0.12), transparent 28rem),
          #000;
        color: var(--text);
        font-family: Arial, Helvetica, sans-serif;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
      }
      section {
        width: min(100%, 29rem);
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(20, 18, 12, 0.9), var(--panel));
        padding: clamp(2rem, 6vw, 3rem);
        text-align: center;
        box-shadow: 0 1.25rem 4rem rgba(0, 0, 0, 0.52);
      }
      img {
        display: block;
        width: min(13rem, 70%);
        height: auto;
        margin: 0 auto 2rem;
      }
      h1 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(1.125rem, 4vw, 1.775rem);
        font-weight: 400;
        letter-spacing: 0.035em;
        line-height: 0.95;
        text-transform: uppercase;
      }
      p {
        margin: 1rem auto 0;
        color: var(--muted);
        font-size: 0.96rem;
        line-height: 1.55;
      }
      form {
        margin-top: 2rem;
      }
      label {
        display: block;
        margin-bottom: 0.65rem;
        color: rgba(255, 250, 240, 0.78);
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }
      input {
        width: 100%;
        border: 1px solid rgba(216, 195, 106, 0.36);
        background: rgba(0, 0, 0, 0.72);
        color: var(--text);
        padding: 0.95rem 1rem;
        border-radius: 0;
        font: inherit;
        outline: none;
      }
      input:focus {
        border-color: var(--gold);
        box-shadow: 0 0 0 3px var(--gold-soft);
      }
      button {
        width: 100%;
        margin-top: 1rem;
        border: 1px solid rgba(216, 195, 106, 0.7);
        background: linear-gradient(180deg, #f0dc82, #b99c3d);
        color: #0b0803;
        padding: 0.95rem 1rem;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        cursor: pointer;
        transition: transform 180ms ease, filter 180ms ease;
      }
      button:hover {
        filter: brightness(1.05);
        transform: translateY(-1px);
      }
      .error {
        margin-top: 1rem;
        color: #ffb4a8;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <img src="/brand/zingara-logo-landing.svg" alt="Zingara" />
        <h1>Private Preview</h1>
        <form method="post" action="${escapeHtml(action)}">
          <label for="site-password">Password</label>
          <input id="site-password" name="password" type="password" autocomplete="current-password" autofocus required />
          <button type="submit">Enter</button>
          ${errorMarkup}
        </form>
      </section>
    </main>
  </body>
</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
      status: error ? 401 : 200,
    },
  );
}

export async function proxy(request: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;

  if (!sitePassword) {
    return NextResponse.next();
  }

  const expectedCookieValue = getExpectedCookieValue(sitePassword);
  const currentCookieValue = request.cookies.get(cookieName)?.value;

  if (currentCookieValue === expectedCookieValue) {
    return NextResponse.next();
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const password = formData.get("password");

    if (typeof password === "string" && password === sitePassword) {
      const response = NextResponse.redirect(request.nextUrl, 303);
      response.cookies.set(cookieName, expectedCookieValue, {
        httpOnly: true,
        maxAge: cookieMaxAge,
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
      return response;
    }

    return passwordPage(request, true);
  }

  return passwordPage(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:avif|bmp|css|gif|ico|jpg|jpeg|js|json|map|png|svg|ttf|txt|webmanifest|webp|woff|woff2)$|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
