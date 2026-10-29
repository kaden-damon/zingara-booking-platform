type PlatformOwnerBinding = {
  auth_user_id: string;
  authority: string;
};

export function hasPlatformOwnerBinding(
  profile: {
    active?: boolean;
    platform_owner_bindings?: PlatformOwnerBinding[] | PlatformOwnerBinding | null;
  } | null | undefined,
  user: { id: string } | null | undefined,
) {
  const bindings = Array.isArray(profile?.platform_owner_bindings)
    ? profile.platform_owner_bindings
    : profile?.platform_owner_bindings
      ? [profile.platform_owner_bindings]
      : [];

  return Boolean(
    profile?.active &&
      user?.id &&
      bindings.some(
        (binding) =>
          binding.authority === "platform-owner" &&
          binding.auth_user_id === user.id,
      ),
  );
}
