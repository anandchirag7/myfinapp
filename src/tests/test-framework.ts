/**
 * Lightweight Zero-Dependency TypeScript Test Framework
 * Designed for ultra-fast, standalone regression & invariant test suites.
 */

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: Error;
}

export interface SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResult[];
}

type TestFn = () => void | Promise<void>;
type HookFn = () => void | Promise<void>;

let currentSuite = "Default Suite";
const testsToRun: Array<{ suite: string; name: string; fn: TestFn }> = [];
const beforeHooks: Array<{ suite: string; fn: HookFn }> = [];
const afterHooks: Array<{ suite: string; fn: HookFn }> = [];

export function describe(name: string, fn: () => void) {
  const previousSuite = currentSuite;
  currentSuite = name;
  try {
    fn();
  } finally {
    currentSuite = previousSuite;
  }
}

export function it(name: string, fn: TestFn) {
  testsToRun.push({ suite: currentSuite, name, fn });
}

export const test = it;

export function beforeEach(fn: HookFn) {
  beforeHooks.push({ suite: currentSuite, fn });
}

export function afterEach(fn: HookFn) {
  afterHooks.push({ suite: currentSuite, fn });
}

function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

export function expect(actual: any) {
  const matchers = (isNot: boolean = false) => ({
    toBe(expected: any) {
      const pass = Object.is(actual, expected);
      if (isNot ? pass : !pass) {
        throw new Error(
          `Expected ${JSON.stringify(actual)} ${isNot ? "NOT to be" : "to be"} ${JSON.stringify(expected)}`,
        );
      }
    },
    toEqual(expected: any) {
      const pass = deepEqual(actual, expected);
      if (isNot ? pass : !pass) {
        throw new Error(
          `Expected ${JSON.stringify(actual)} ${isNot ? "NOT to deeply equal" : "to deeply equal"} ${JSON.stringify(expected)}`,
        );
      }
    },
    toBeTruthy() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? "NOT to be truthy" : "to be truthy"}`);
      }
    },
    toBeFalsy() {
      const pass = !actual;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? "NOT to be falsy" : "to be falsy"}`);
      }
    },
    toBeNull() {
      const pass = actual === null;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? "NOT to be null" : "to be null"}`);
      }
    },
    toBeDefined() {
      const pass = actual !== undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected value ${isNot ? "to be undefined" : "to be defined"}`);
      }
    },
    toBeUndefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? "NOT to be undefined" : "to be undefined"}`);
      }
    },
    toContain(expected: any) {
      let pass = false;
      if (typeof actual === "string" || Array.isArray(actual)) {
        pass = actual.includes(expected);
      } else if (actual instanceof Set) {
        pass = actual.has(expected);
      }
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? "NOT to contain" : "to contain"} ${JSON.stringify(expected)}`);
      }
    },
    toBeGreaterThan(expected: number) {
      const pass = actual > expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "NOT to be >" : "to be >"} ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      const pass = actual >= expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "NOT to be >=" : "to be >="} ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      const pass = actual < expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "NOT to be <" : "to be <"} ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      const pass = actual <= expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "NOT to be <=" : "to be <="} ${expected}`);
      }
    },
    toBeCloseTo(expected: number, delta: number = 0.001) {
      const pass = Math.abs(actual - expected) <= delta;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? "NOT to be close to" : "to be close to"} ${expected} within delta ${delta}`);
      }
    },
    toThrow(expectedMsgOrRegex?: string | RegExp) {
      let threw = false;
      let error: any;
      if (typeof actual !== "function") {
        throw new Error("Target of toThrow must be a function");
      }
      try {
        actual();
      } catch (e) {
        threw = true;
        error = e;
      }
      if (isNot ? threw : !threw) {
        throw new Error(`Expected function ${isNot ? "NOT to throw" : "to throw an error"}`);
      }
      if (threw && expectedMsgOrRegex) {
        const msg = error instanceof Error ? error.message : String(error);
        if (typeof expectedMsgOrRegex === "string" && !msg.includes(expectedMsgOrRegex)) {
          throw new Error(`Expected error message "${msg}" to contain "${expectedMsgOrRegex}"`);
        }
        if (expectedMsgOrRegex instanceof RegExp && !expectedMsgOrRegex.test(msg)) {
          throw new Error(`Expected error message "${msg}" to match ${expectedMsgOrRegex}`);
        }
      }
    },
  });

  return {
    ...matchers(false),
    not: matchers(true),
  };
}

/** Execute all registered tests and produce summary */
export async function runTests(): Promise<SuiteSummary> {
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  const startTime = performance.now();

  for (const t of testsToRun) {
    // Run matching before hooks
    for (const b of beforeHooks) {
      if (b.suite === t.suite) await b.fn();
    }

    const testStart = performance.now();
    try {
      await t.fn();
      const durationMs = Number((performance.now() - testStart).toFixed(2));
      results.push({ suite: t.suite, name: t.name, passed: true, durationMs });
      passed++;
    } catch (err: any) {
      const durationMs = Number((performance.now() - testStart).toFixed(2));
      results.push({
        suite: t.suite,
        name: t.name,
        passed: false,
        durationMs,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      failed++;
    }

    // Run matching after hooks
    for (const a of afterHooks) {
      if (a.suite === t.suite) await a.fn();
    }
  }

  const durationMs = Number((performance.now() - startTime).toFixed(2));
  return {
    total: testsToRun.length,
    passed,
    failed,
    durationMs,
    results,
  };
}

export function clearTests() {
  testsToRun.length = 0;
  beforeHooks.length = 0;
  afterHooks.length = 0;
}
