export type HookEventName = "SessionStart" | "UserPromptSubmit" | "Stop" | "PreCompact" | "SessionEnd";
export interface HookInputBase {
    readonly hook_event_name?: HookEventName;
    readonly session_id?: string;
    readonly transcript_path?: string;
    readonly cwd?: string;
}
export interface SessionStartInput extends HookInputBase {
    readonly source?: "startup" | "resume" | "clear" | "compact" | "fork";
}
export interface UserPromptSubmitInput extends HookInputBase {
    readonly prompt_text?: string;
}
export interface StopInput extends HookInputBase {
    readonly turn_number?: number;
    readonly stop_reason?: string;
    readonly last_assistant_message?: string;
}
export type HookInput = SessionStartInput & UserPromptSubmitInput & StopInput;
export declare function readHookInput(fd?: number): HookInput;
export declare function emitContext(event: HookEventName, additionalContext: string): void;
//# sourceMappingURL=hook-io.d.ts.map