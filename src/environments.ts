const PRODUCTION_STUDIO = "https://studio.jitera.app";
const PILOT_DOMAIN = "pilot.jitera.app";

const PILOT_PATTERN = /^studio-(\d{1,2})$/;
const URL_PATTERN = /^https?:\/\/\S+$/i;

export const DEFAULT_ENVIRONMENT = "studio";

export const SUPPORTED_ENVIRONMENTS = [
  "studio",
  "studio-stage",
  "studio-01",
  "studio-06",
] as const;

export type Deployment =
  | { readonly kind: "production" }
  | { readonly kind: "stage" }
  | { readonly kind: "pilot"; readonly instance: string }
  | { readonly kind: "url"; readonly url: string };

export class UnknownEnvironmentError extends Error {
  override readonly name = "UnknownEnvironmentError";
  readonly value: unknown;

  constructor(value: unknown) {
    super(
      `unknown environment "${String(value)}". Supported: "studio" for production, ` +
        `"studio-stage" for staging, "studio-NN" for a numbered pilot such as "studio-06", ` +
        `or the https:// address of the deployment.`
    );
    this.value = value;
  }
}

export function parseEnvironment(environment?: string | null): Deployment {
  const raw = String(environment ?? "").trim();
  // A deployment can be named by its own address, which is how installs
  // from a regional or self-hosted deployment find their way back to it.
  if (URL_PATTERN.test(raw)) {
    return { kind: "url", url: raw.replace(/\/+$/, "") };
  }

  const name = raw.toLowerCase();
  if (name === "" || name === DEFAULT_ENVIRONMENT || name === "production") {
    return { kind: "production" };
  }
  if (name === "studio-stage") {
    return { kind: "stage" };
  }

  const pilot = PILOT_PATTERN.exec(name);
  if (pilot?.[1] !== undefined) {
    return { kind: "pilot", instance: pilot[1].padStart(2, "0") };
  }

  throw new UnknownEnvironmentError(environment);
}

export function resolveStudioUrl(environment?: string | null): string {
  const deployment = parseEnvironment(environment);
  switch (deployment.kind) {
    case "production":
      return PRODUCTION_STUDIO;
    case "stage":
      return `https://studio-stage.${PILOT_DOMAIN}`;
    case "pilot":
      return `https://studio-${deployment.instance}.${PILOT_DOMAIN}`;
    case "url":
      return deployment.url;
  }
}
