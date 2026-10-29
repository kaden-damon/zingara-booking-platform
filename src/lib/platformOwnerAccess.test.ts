import assert from "node:assert/strict";
import test from "node:test";

import { hasPlatformOwnerBinding } from "./platformOwnerAccess.ts";

const ownerProfile = {
  active: true,
  platform_owner_bindings: {
    auth_user_id: "1f8b62f8-cac9-4cf7-927d-945d96a302ce",
    authority: "platform-owner",
  },
};

test("the immutable binding identifies the Platform Owner", () => {
  assert.equal(
    hasPlatformOwnerBinding(
      ownerProfile as never,
      { id: "1f8b62f8-cac9-4cf7-927d-945d96a302ce" },
    ),
    true,
  );
});

test("a different or inactive staff identity cannot inherit owner access", () => {
  assert.equal(
    hasPlatformOwnerBinding(
      ownerProfile as never,
      { id: "ff96887e-bed8-43ec-884d-0ef8634e9f12" },
    ),
    false,
  );
  assert.equal(
    hasPlatformOwnerBinding(
      { ...ownerProfile, active: false } as never,
      { id: "1f8b62f8-cac9-4cf7-927d-945d96a302ce" },
    ),
    false,
  );
});
