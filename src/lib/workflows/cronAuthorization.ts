export function getWorkflowBearerToken(request: Request) {
  return request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
}

export function isAuthorisedWorkflowCronRequest(request: Request) {
  const configuredSecrets = [
    process.env.CRON_SECRET,
    process.env.WORKFLOW_CRON_SECRET,
  ].flatMap((value) => value?.trim() ? [value.trim()] : []);

  if (!configuredSecrets.length) return false;

  const bearerToken = getWorkflowBearerToken(request);
  return Boolean(bearerToken && configuredSecrets.includes(bearerToken));
}
