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
  readonly errors?: readonly {
    readonly message?: string;
    readonly extensions?: { readonly code?: string; readonly resource?: string };
  }[];
}

// The API raises Errors::ApiError, whose message is the bare code when no
// custom text is given, so "UNAUTHORIZED" is what reaches the terminal. These
// say what the code means and what to do, which matters most for the api-key
// feature toggle: an account without it fails on the ordinary login path.
function describe(code: string, resource: string | undefined): string | undefined {
  if (code === "UNAUTHORIZED" && resource === "api_key") {
    return (
      "api keys are not enabled for this account. Ask an owner to enable the " +
      "api keys feature, or sign in with an account that has it"
    );
  }
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
    return resource
      ? `your account does not have permission for this ${resource.replace(/_/g, " ")}`
      : "your account does not have permission for that";
  }
  if (code === "NOT_FOUND") {
    return resource
      ? `no ${resource.replace(/_/g, " ")} with that id, or your account cannot see it`
      : "not found, or your account cannot see it";
  }
  return undefined;
}

function readableError(error: {
  readonly message?: string;
  readonly extensions?: { readonly code?: string; readonly resource?: string };
}): string {
  const message = error.message ?? "unknown error";
  const code = error.extensions?.code;
  if (!code) return message;

  const explained = describe(code, error.extensions?.resource);
  if (!explained) return message;

  // Keep the code when the backend said more than the code itself, so nothing
  // the server chose to say is thrown away.
  return message === code ? explained : `${explained} (${message})`;
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
      payload.errors.map(readableError)
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

export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

// `status: published` matches what the studio lists: draft workflows are not
// agents anyone is working with yet.
const AGENTS_PAGE_SIZE = 200;

const AGENTS_DOCUMENT = `query ConnectAgents($projectUuid: String!, $limit: Int!) {
  boostWorkflows(
    where: { projectUuid: { _eq: $projectUuid }, status: { _eq: "published" } }
    orderBy: [{ createdAt: DESC_NULLS_LAST }]
    limit: $limit
  ) {
    id
    name
    description
  }
}`;

interface AgentsResponse {
  readonly boostWorkflows: readonly {
    readonly id?: string | null;
    readonly name?: string | null;
    readonly description?: string | null;
  }[] | null;
}

export async function listAgents(
  transport: GraphqlTransport,
  projectUuid: string
): Promise<AgentSummary[]> {
  const data = await query<AgentsResponse>(
    "ConnectAgents",
    AGENTS_DOCUMENT,
    { projectUuid, limit: AGENTS_PAGE_SIZE },
    transport
  );

  return (data.boostWorkflows ?? [])
    .filter((row): row is { id: string; name?: string | null; description?: string | null } =>
      typeof row?.id === "string" && row.id.length > 0
    )
    .map((row) => ({
      id: row.id,
      name: row.name?.trim() || row.id,
      description: row.description?.trim() || null,
    }));
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

async function runCreateApiKey(
  params: Record<string, unknown>,
  noKeyReason: string,
  transport: GraphqlTransport
): Promise<CreatedApiKey> {
  const data = await query<CreateApiKeyPayload>(
    "ConnectCreateApiKey",
    CREATE_KEY_DOCUMENT,
    { params },
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
    throw new GraphqlError("ConnectCreateApiKey", [noKeyReason]);
  }

  return { rawKey: result.rawKey, maskedKey: result.apiKey?.maskedKey ?? "" };
}

export async function createApiKey(
  options: { readonly projectUuid: string; readonly name: string; readonly mcpAccess: McpAccess },
  transport: GraphqlTransport
): Promise<CreatedApiKey> {
  return runCreateApiKey(
    { projectUuid: options.projectUuid, name: options.name, mcpAccess: options.mcpAccess },
    "no key was returned. The account may lack permission to manage api keys for this project.",
    transport
  );
}

// A user-level key: no project in the params. Deployments that predate user
// keys reject this, and the caller falls back to the project flow.
export async function createUserApiKey(
  options: { readonly name: string; readonly mcpAccess: McpAccess },
  transport: GraphqlTransport
): Promise<CreatedApiKey> {
  return runCreateApiKey(
    { name: options.name, mcpAccess: options.mcpAccess },
    "no key was returned. This deployment may not support user-level keys yet.",
    transport
  );
}

export function isAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof GraphqlError &&
    error.errors.some((message) => /access token was rejected/i.test(message))
  );
}
