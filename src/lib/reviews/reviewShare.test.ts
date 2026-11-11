import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  clearAdminReviewShareTarget,
  getAdminReviewSharePath,
} from "./reviewShare.ts";

const root = process.cwd();
const reviewId = "123e4567-e89b-42d3-a456-426614174000";

test("builds an opaque Admin review link without customer or status data", () => {
  const path = getAdminReviewSharePath(reviewId);
  assert.equal(path, `/admin?reviewId=${reviewId}&section=reviews`);
  assert.doesNotMatch(path ?? "", /name|email|mobile|booking|status/i);
  assert.equal(getAdminReviewSharePath("not-a-review"), null);
});

test("clears only the review target when staff return to the queue", () => {
  assert.equal(
    clearAdminReviewShareTarget(
      new URL(`/admin?section=reviews&reviewId=${reviewId}&reviewStatus=published`, "https://book.zingara.co.za"),
    ),
    "/admin?section=reviews",
  );
});

test("direct review lookup stays authenticated, scoped, and status independent", async () => {
  const [route, workspace, returnPath] = await Promise.all([
    readFile(`${root}/src/app/api/admin/reviews/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/ReviewsAdminWorkspace.tsx`, "utf8"),
    readFile(`${root}/src/lib/adminReturnPath.ts`, "utf8"),
  ]);

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /\.in\("venue", venues\.length \? venues : \["__none__"\]\)/);
  assert.match(route, /if \(input\.reviewId\)[\s\S]*query = query\.eq\("id", input\.reviewId\)[\s\S]*else[\s\S]*query = query\.eq\("moderation_status", input\.status\)/);
  assert.match(workspace, /params\.set\("details", "true"\)/);
  assert.match(workspace, /navigator\.share/);
  assert.match(workspace, /navigator\.clipboard\.writeText/);
  assert.match(returnPath, /url\.pathname !== "\/admin"/);
});
