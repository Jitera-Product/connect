export interface ProxyStreams {
    readonly input: NodeJS.ReadableStream;
    readonly output: NodeJS.WritableStream;
    readonly log: NodeJS.WritableStream;
}
export interface ProxyConfig {
    readonly url: string;
    readonly apiKey: string;
}
export declare function runProxy({ url, apiKey }: ProxyConfig, { input, output, log }: ProxyStreams): Promise<void>;
export declare function configFromEnvironment(env: NodeJS.ProcessEnv): Promise<ProxyConfig>;
//# sourceMappingURL=proxy.d.ts.map