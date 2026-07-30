export declare const KNOWN_TOKENS: Set<string>;
export declare const INSTRUCTIONS_BUDGET_CHARS = 1400;
export declare function findUnknownTokens(text: string): string[];
export interface BudgetResult {
    readonly ok: boolean;
    readonly length: number;
}
export declare function checkBudget(text: string, budget: number): BudgetResult;
export declare function collectContentFiles(root: string): string[];
export declare function validateRepository(root: string): string[];
//# sourceMappingURL=validate.d.ts.map