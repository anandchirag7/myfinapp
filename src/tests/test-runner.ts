/**
 * Main Test Runner for Paisa Regression & Validation Test Suite
 */

import { runTests, clearTests } from "./test-framework";
import { registerFormatTests } from "./format.test";
import { registerStatementDetectTests } from "./statement-detect.test";
import { registerStatementNormalizeTests } from "./statement-normalize.test";
import { registerQueryKeysTests } from "./query-keys.test";
import { registerFinanceMathTests } from "./finance-math.test";
import { registerObservabilityTests } from "./observability.test";
import { registerInvestmentsCalcTests } from "./investments-calc.test";
import { registerOllamaTests } from "./ollama.test";
import { registerStatementReleaseBTests } from "./statement-release-b.test";
import { registerStatementReleaseCTests } from "./statement-release-c.test";
import { registerStatementReleaseDTests } from "./statement-release-d.test";
import { registerStatementReleaseETests } from "./statement-release-e.test";
import { registerBatchRecoveryTests } from "./batch-recovery.test";
import { registerRulesEngineTests } from "./rules-engine.test";
import { registerCategoryTypeTests } from "./category-type.test";
import { registerTransactionEditTests } from "./transaction-edit.test";
import { registerStatementCategorizationRemediationTests } from "./statement-categorization-remediation.test";
import { registerAiSpendingProfileTests } from "./ai-spending-profile.test";
import { registerStatementTransferTests } from "./statement-transfers.test";

async function main() {
  console.log("\n🧪 Running Paisa Regression & Verification Test Suite (Phase 4)\n");

  clearTests();
  registerFormatTests();
  registerStatementDetectTests();
  registerStatementNormalizeTests();
  registerQueryKeysTests();
  registerFinanceMathTests();
  registerObservabilityTests();
  registerInvestmentsCalcTests();
  registerOllamaTests();
  registerStatementReleaseBTests();
  registerStatementReleaseCTests();
  registerStatementReleaseDTests();
  registerStatementReleaseETests();
  registerBatchRecoveryTests();
  registerRulesEngineTests();
  registerCategoryTypeTests();
  registerTransactionEditTests();
  registerStatementCategorizationRemediationTests();
  registerAiSpendingProfileTests();
  registerStatementTransferTests();

  const summary = await runTests();

  let currentSuite = "";
  for (const res of summary.results) {
    if (res.suite !== currentSuite) {
      currentSuite = res.suite;
      console.log(`\n📦 ${currentSuite}`);
    }
    if (res.passed) {
      console.log(`  ✅ ${res.name} (${res.durationMs}ms)`);
    } else {
      console.log(`  ❌ ${res.name} (${res.durationMs}ms)`);
      if (res.error) {
        console.error(`     Error: ${res.error.message}`);
        if (res.error.stack) {
          console.error(`     ${res.error.stack.split("\n").slice(1, 4).join("\n     ")}`);
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `Total Tests: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed} | Time: ${summary.durationMs}ms`,
  );
  console.log("=".repeat(60) + "\n");

  if (summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner execution error:", err);
  process.exit(1);
});
