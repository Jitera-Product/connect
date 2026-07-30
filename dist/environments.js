const PRODUCTION_STUDIO = "https://studio.jitera.app";
const PILOT_DOMAIN = "pilot.jitera.app";
const PILOT_PATTERN = /^studio-(\d{1,2})$/;
export const DEFAULT_ENVIRONMENT = "studio";
export const SUPPORTED_ENVIRONMENTS = [
    "studio",
    "studio-stage",
    "studio-01",
    "studio-06",
];
export class UnknownEnvironmentError extends Error {
    name = "UnknownEnvironmentError";
    value;
    constructor(value) {
        super(`unknown environment "${String(value)}". Supported: "studio" for production, ` +
            `"studio-stage" for staging, or "studio-NN" for a numbered pilot such as "studio-06".`);
        this.value = value;
    }
}
export function parseEnvironment(environment) {
    const name = String(environment ?? "").trim().toLowerCase();
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
export function resolveStudioUrl(environment) {
    const deployment = parseEnvironment(environment);
    switch (deployment.kind) {
        case "production":
            return PRODUCTION_STUDIO;
        case "stage":
            return `https://studio-stage.${PILOT_DOMAIN}`;
        case "pilot":
            return `https://studio-${deployment.instance}.${PILOT_DOMAIN}`;
    }
}
//# sourceMappingURL=environments.js.map