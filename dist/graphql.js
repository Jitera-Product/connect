export class GraphqlError extends Error {
    name = "GraphqlError";
    errors;
    constructor(operation, errors) {
        super(errors.length
            ? `${operation} failed: ${errors.join("; ")}`
            : `${operation} returned no data and no error`);
        this.errors = errors;
    }
}
export async function query(operation, document, variables, { automationUrl, accessToken, fetchImpl = fetch, timeoutMs = 20_000 }) {
    const url = `${automationUrl.replace(/\/$/, "")}/graphql`;
    let response;
    let raw;
    try {
        response = await fetchImpl(url, {
            method: "POST",
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ query: document, variables, operationName: operation }),
        });
        raw = await response.text();
    }
    catch (error) {
        throw new GraphqlError(operation, [`could not reach ${url}: ${error.message}`]);
    }
    if (response.status === 401) {
        throw new GraphqlError(operation, ["the access token was rejected. Sign in again."]);
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        throw new GraphqlError(operation, [`HTTP ${response.status} with an unreadable body`]);
    }
    if (payload.errors?.length) {
        throw new GraphqlError(operation, payload.errors.map((e) => e.message ?? "unknown error"));
    }
    if (payload.data === undefined || payload.data === null) {
        throw new GraphqlError(operation, []);
    }
    return payload.data;
}
const PROJECTS_DOCUMENT = `query ConnectProjects($project: ProjectParams) {
  projects(project: $project) {
    projects {
      uuid
      name
      canManageApiKey
    }
    errors
  }
}`;
const TEAMS_DOCUMENT = `query ConnectTeams {
  teams {
    slug
    name
    type
  }
}`;
export async function listOrganisations(transport) {
    try {
        const data = await query("ConnectTeams", TEAMS_DOCUMENT, {}, transport);
        return (data.teams ?? [])
            .filter((team) => Boolean(team.slug))
            .map((team) => ({ slug: team.slug, name: team.name, personal: team.type === "personal" }));
    }
    catch {
        return [];
    }
}
const PROJECT_PAGE_SIZE = 100;
async function projectsForScope(scope, transport) {
    const data = await query("ConnectProjects", PROJECTS_DOCUMENT, { project: { ...scope, per: PROJECT_PAGE_SIZE } }, transport);
    const messages = toErrorMessages(data.projects?.errors);
    if (messages.length)
        throw new GraphqlError("ConnectProjects", messages);
    return [...(data.projects?.projects ?? [])];
}
function scopesFor(organisation) {
    if (organisation && !organisation.personal) {
        return [{ organisationSlug: organisation.slug }];
    }
    const scopes = [{}, { onlySharedProjects: true }];
    if (organisation)
        scopes.push({ organisationSlug: organisation.slug });
    return scopes;
}
export async function listProjects(transport, organisation) {
    const scopes = scopesFor(organisation);
    const results = await Promise.all(scopes.map((scope, index) => projectsForScope(scope, transport).catch((error) => {
        if (index === 0)
            throw error;
        return [];
    })));
    const seen = new Map();
    for (const project of results.flat()) {
        if (project.uuid && !seen.has(project.uuid))
            seen.set(project.uuid, project);
    }
    return [...seen.values()];
}
const CREATE_KEY_DOCUMENT = `mutation ConnectCreateApiKey($params: CreateApiKeyInput!) {
  createApiKey(params: $params) {
    rawKey
    errors
    apiKey {
      maskedKey
    }
  }
}`;
export function toErrorMessages(errors) {
    if (errors === null || errors === undefined)
        return [];
    if (Array.isArray(errors))
        return errors.map((error) => String(error)).filter(Boolean);
    const single = String(errors).trim();
    return single ? [single] : [];
}
async function runCreateApiKey(params, noKeyReason, transport) {
    const data = await query("ConnectCreateApiKey", CREATE_KEY_DOCUMENT, { params }, transport);
    const result = data.createApiKey;
    if (!result)
        throw new GraphqlError("ConnectCreateApiKey", ["the mutation returned no payload"]);
    const messages = toErrorMessages(result.errors);
    if (messages.length)
        throw new GraphqlError("ConnectCreateApiKey", messages);
    if (result.success === false) {
        throw new GraphqlError("ConnectCreateApiKey", ["the deployment reported the request unsuccessful"]);
    }
    if (!result.rawKey) {
        throw new GraphqlError("ConnectCreateApiKey", [noKeyReason]);
    }
    return { rawKey: result.rawKey, maskedKey: result.apiKey?.maskedKey ?? "" };
}
export async function createApiKey(options, transport) {
    return runCreateApiKey({ projectUuid: options.projectUuid, name: options.name, mcpAccess: options.mcpAccess }, "no key was returned. The account may lack permission to manage api keys for this project.", transport);
}
// A user-level key: no project in the params. Deployments that predate user
// keys reject this, and the caller falls back to the project flow.
export async function createUserApiKey(options, transport) {
    return runCreateApiKey({ name: options.name, mcpAccess: options.mcpAccess }, "no key was returned. This deployment may not support user-level keys yet.", transport);
}
export function isAuthenticationFailure(error) {
    return (error instanceof GraphqlError &&
        error.errors.some((message) => /access token was rejected/i.test(message)));
}
//# sourceMappingURL=graphql.js.map