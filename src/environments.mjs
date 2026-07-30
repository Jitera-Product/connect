const PRODUCTION_GATEWAY = "https://gateway-proxy.jitera.app";
const STAGE_GATEWAY = "https://jitera-stage-pilot.jitera.app";
const PILOT_GATEWAY = "https://kong-proxy-pilot.jitera.app";

const PILOT_PATTERN = /^studio-(\d{1,2})$/;

export const SUPPORTED_ENVIRONMENTS = ["studio", "studio-stage", "studio-01", "studio-06"];

export class UnknownEnvironmentError extends Error {
  constructor(value) {
    super(
      `unknown environment "${value}". Supported: omit the flag for production, ` +
        `--env=studio-stage for staging, or --env=studio-NN for a numbered pilot ` +
        `such as --env=studio-06.`
    );
    this.name = "UnknownEnvironmentError";
    this.value = value;
  }
}

function resolveBase(environment) {
  const name = String(environment ?? "").trim().toLowerCase();

  if (name === "" || name === "studio" || name === "production") {
    return `${PRODUCTION_GATEWAY}/gateway/boost`;
  }

  if (name === "studio-stage") {
    return `${STAGE_GATEWAY}/gateway/boost`;
  }

  const pilot = PILOT_PATTERN.exec(name);
  if (pilot) {
    return `${PILOT_GATEWAY}/gateway/boost-${pilot[1].padStart(2, "0")}`;
  }

  throw new UnknownEnvironmentError(environment);
}

export function resolveMcpUrl(environment) {
  return `${resolveBase(environment)}/mcp`;
}

export function resolveApiBaseUrl(environment) {
  return `${resolveBase(environment)}/v1`;
}
