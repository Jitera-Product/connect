// Ending a command by calling process.exit() aborts the process on Windows when
// a handle opened by a network call is still closing: libuv asserts in
// async.c and the shell sees a crash code even though the command had already
// printed the right answer. Unwinding to the entry point and letting Node end
// on its own keeps the exit code the command actually meant.
export class ProcessExit extends Error {
  override readonly name = "ProcessExit";
  readonly code: number;

  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

export function endWith(code: number): never {
  throw new ProcessExit(code);
}

// Runs a command body and settles the exit code without tearing the loop down
// mid-close. Anything that is not a ProcessExit keeps its stack and is rethrown.
export async function runCommand(body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    process.exitCode = 0;
  } catch (error) {
    if (error instanceof ProcessExit) {
      process.exitCode = error.code;
      return;
    }
    throw error;
  }
}
