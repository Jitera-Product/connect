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
const PROJECTS_DOCUMENT = `query ConnectProjects {
  projects {
    projects {
      uuid
      name
    }
    errors
  }
}`;
export async function listProjects(transport) {
    const data = await query("ConnectProjects", PROJECTS_DOCUMENT, {}, transport);
    const messages = toErrorMessages(data.projects?.errors);
    if (messages.length)
        throw new GraphqlError("ConnectProjects", messages);
    return [...(data.projects?.projects ?? [])];
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
export async function createApiKey(options, transport) {
    const data = await query("ConnectCreateApiKey", CREATE_KEY_DOCUMENT, {
        params: {
            projectUuid: options.projectUuid,
            name: options.name,
            mcpAccess: options.mcpAccess,
        },
    }, transport);
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
        throw new GraphqlError("ConnectCreateApiKey", [
            "no key was returned. The account may lack permission to manage api keys for this project.",
        ]);
    }
    return { rawKey: result.rawKey, maskedKey: result.apiKey?.maskedKey ?? "" };
}
//# sourceMappingURL=graphql.js.map