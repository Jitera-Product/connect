export interface ProxyStreams {
    readonly input: NodeJS.ReadableStream;
    readonly output: NodeJS.WritableStream;
    readonly log: NodeJS.WritableStream;
}
export interface ProxyConfig {
    readonly url: string;
    readonly apiKey: string;
    readonly instructions?: string | undefined;
}
export declare function runProxy({ url, apiKey, instructions }: ProxyConfig, { input, output, log }: ProxyStreams): Promise<void>;
export interface ProxyEnvironment extends ProxyConfig {
    readonly brand: string;
}
export declare function configFromEnvironment(env: NodeJS.ProcessEnv): Promise<ProxyEnvironment>;
//# sourceMappingURL=proxy.d.ts.map