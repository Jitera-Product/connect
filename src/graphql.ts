export class GraphqlError extends Error {
  override readonly name = "GraphqlError";
  readonly errors: readonly string[];

  constructor(operation: string, errors: readonly string[]) {
    super(
      errors.length
        ? `${operation} failed: ${errors.join("; ")}`
        : `${operation} returned no data and no error`
    );
    this.errors = errors;
  }
}

export interface GraphqlTransport {
  readonly automationUrl: string;
  readonly accessToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

interface GraphqlResponse<T> {
  readonly data?: T;
  readonly errors?: readonly { readonly message?: string }[];
}

export async function query<T>(
  operation: string,
  document: string,
  variables: Record<string, unknown>,
  { automationUrl, accessToken, fetchImpl = fetch, timeoutMs = 20_000 }: GraphqlTransport
): Promise<T> {
  const url = `${automationUrl.replace(/\/$/, "")}/graphql`;

  let response: Response;
  let raw: string;
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
  } catch (error) {
    throw new GraphqlError(operation, [`could not reach ${url}: ${(error as Error).message}`]);
  }

  if (response.status === 401) {
    throw new GraphqlError(operation, ["the access token was rejected. Sign in again."]);
  }

  let payload: GraphqlResponse<T>;
  try {
    payload = JSON.parse(raw) as GraphqlResponse<T>;
  } catch {
    throw new GraphqlError(operation, [`HTTP ${response.status} with an unreadable body`]);
  }

  if (payload.errors?.length) {
    throw new GraphqlError(
      operation,
      payload.errors.map((e) => e.message ?? "unknown error")
    );
  }
  if (payload.data === undefined || payload.data === null) {
    throw new GraphqlError(operation, []);
  }
  return payload.data;
}

export interface ProjectSummary {
  readonly uuid: string;
  readonly name: string;
  readonly canManageApiKey: boolean;
}

export interface Organisation {
  readonly slug: string;
  readonly name: string | null;
  readonly personal: boolean;
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

interface TeamsPayload {
  readonly teams:
    | readonly {
        readonly slug: string | null;
        readonly name: string | null;
        readonly type: string | null;
      }[]
    | null;
}

export async function listOrganisations(transport: GraphqlTransport): Promise<Organisation[]> {
  try {
    const data = await query<TeamsPayload>("ConnectTeams", TEAMS_DOCUMENT, {}, transport);
    return (data.teams ?? [])
      .filter((team): team is { slug: string; name: string | null; type: string | null } =>
        Boolean(team.slug)
      )
      .map((team) => ({ slug: team.slug, name: team.name, personal: team.type === "personal" }));
  } catch {
    return [];
  }
}

interface ProjectsPayload {
  readonly projects: {
    readonly projects: readonly ProjectSummary[] | null;
    readonly errors: MutationErrors;
  } | null;
}

const PROJECT_PAGE_SIZE = 100;

async function projectsForScope(
  scope: Record<string, unknown>,
  transport: GraphqlTransport
): Promise<ProjectSummary[]> {
  const data = await query<ProjectsPayload>(
    "ConnectProjects",
    PROJECTS_DOCUMENT,
    { project: { ...scope, per: PROJECT_PAGE_SIZE } },
    transport
  );

  const messages = toErrorMessages(data.projects?.errors);
  if (messages.length) throw new GraphqlError("ConnectProjects", messages);

  return [...(data.projects?.projects ?? [])];
}

function scopesFor(organisation?: Organisation): Record<string, unknown>[] {
  if (organisation && !organisation.personal) {
    return [{ organisationSlug: organisation.slug }];
  }
  const scopes: Record<string, unknown>[] = [{}, { onlySharedProjects: true }];
  if (organisation) scopes.push({ organisationSlug: organisation.slug });
  return scopes;
}

export async function listProjects(
  transport: GraphqlTransport,
  organisation?: Organisation
): Promise<ProjectSummary[]> {
  const scopes = scopesFor(organisation);

  const results = await Promise.all(
    scopes.map((scope, index) =>
      projectsForScope(scope, transport).catch((error: unknown) => {
        if (index === 0) throw error;
        return [] as ProjectSummary[];
      })
    )
  );

  const seen = new Map<string, ProjectSummary>();
  for (const project of results.flat()) {
    if (project.uuid && !seen.has(project.uuid)) seen.set(project.uuid, project);
  }
  return [...seen.values()];
}

export type McpAccess = "read" | "read_write";

export interface CreatedApiKey {
  readonly rawKey: string;
  readonly maskedKey: string;
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

type MutationErrors = string | readonly string[] | null | undefined;

interface CreateApiKeyPayload {
  readonly createApiKey: {
    readonly rawKey?: string | null;
    readonly errors?: MutationErrors;
    readonly success?: boolean | null;
    readonly apiKey?: { readonly maskedKey: string } | null;
  } | null;
}

export function toErrorMessages(errors: MutationErrors): string[] {
  if (errors === null || errors === undefined) return [];
  if (Array.isArray(errors)) return errors.map((error) => String(error)).filter(Boolean);
  const single = String(errors).trim();
  return single ? [single] : [];
}

export async function createApiKey(
  options: { readonly projectUuid: string; readonly name: string; readonly mcpAccess: McpAccess },
  transport: GraphqlTransport
): Promise<CreatedApiKey> {
  const data = await query<CreateApiKeyPayload>(
    "ConnectCreateApiKey",
    CREATE_KEY_DOCUMENT,
    {
      params: {
        projectUuid: options.projectUuid,
        name: options.name,
        mcpAccess: options.mcpAccess,
      },
    },
    transport
  );

  const result = data.createApiKey;
  if (!result) throw new GraphqlError("ConnectCreateApiKey", ["the mutation returned no payload"]);

  const messages = toErrorMessages(result.errors);
  if (messages.length) throw new GraphqlError("ConnectCreateApiKey", messages);
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
