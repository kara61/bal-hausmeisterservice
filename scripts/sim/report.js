import { writeFileSync } from 'fs';

export class Report {
  constructor() {
    this.scenarios = [];
    this.current = null;
  }

  startScenario(name) {
    this.current = { name, steps: [], passed: 0, failed: 0 };
    this.scenarios.push(this.current);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${name}`);
    console.log('='.repeat(60));
  }

  check(description, condition, details = '') {
    const pass = !!condition;
    this.current.steps.push({ description, pass, details: String(details) });
    if (pass) {
      this.current.passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${description}`);
    } else {
      this.current.failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${description}`);
      if (details) console.log(`    → ${details}`);
    }
    return pass;
  }

  writeReport(filepath) {
    const totalPassed = this.scenarios.reduce((s, sc) => s + sc.passed, 0);
    const totalFailed = this.scenarios.reduce((s, sc) => s + sc.failed, 0);

    let md = `# Simulation Report — ${new Date().toISOString().split('T')[0]}\n\n`;
    md += `## Summary: ${this.scenarios.length} scenarios, ${totalPassed} passed, ${totalFailed} failed\n\n`;

    for (const sc of this.scenarios) {
      const icon = sc.failed === 0 ? '✅' : '❌';
      md += `### ${icon} ${sc.name} (${sc.passed}/${sc.passed + sc.failed})\n\n`;
      for (const step of sc.steps) {
        md += `- [${step.pass ? 'PASS' : 'FAIL'}] ${step.description}`;
        if (!step.pass && step.details) md += ` — ${step.details}`;
        md += '\n';
      }
      md += '\n';
    }

    writeFileSync(filepath, md, 'utf-8');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log(`  Report: ${filepath}`);
    console.log('='.repeat(60));

    return totalFailed;
  }
}
