import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { render, type RenderValues } from "./render.ts";

export interface SkillInstallOptions {
  readonly packageRoot: string;
  readonly targetDirs: readonly string[];
  readonly values: RenderValues;
  readonly dryRun?: boolean;
}

export interface SkillInstallResult {
  readonly skills: readonly string[];
  readonly written: readonly string[];
  readonly changed: boolean;
}

export function listSkills(packageRoot: string): string[] {
  const root = join(packageRoot, "skills");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

export function installSkills({
  packageRoot,
  targetDirs,
  values,
  dryRun = false,
}: SkillInstallOptions): SkillInstallResult {
  const skills = listSkills(packageRoot);
  const written: string[] = [];
  let changed = false;

  for (const target of targetDirs) {
    for (const skill of skills) {
      const source = join(packageRoot, "skills", skill);
      const destination = join(target, skill);
      const sourceSkill = render(readFileSync(join(source, "SKILL.md"), "utf8"), values);

      const destinationSkill = join(destination, "SKILL.md");
      const current = existsSync(destinationSkill)
        ? readFileSync(destinationSkill, "utf8")
        : undefined;

      if (current !== sourceSkill) changed = true;
      written.push(destinationSkill);

      if (dryRun) continue;

      mkdirSync(destination, { recursive: true });
      for (const entry of readdirSync(source, { withFileTypes: true })) {
        if (entry.name === "SKILL.md") continue;
        const from = join(source, entry.name);
        const to = join(destination, entry.name);
        rmSync(to, { recursive: true, force: true });
        cpSync(from, to, { recursive: true });
      }
      writeFileSync(destinationSkill, sourceSkill, "utf8");
    }
  }

  return { skills, written, changed };
}

export function uninstallSkills({
  packageRoot,
  targetDirs,
  dryRun = false,
}: Omit<SkillInstallOptions, "values">): SkillInstallResult {
  const skills = listSkills(packageRoot);
  const written: string[] = [];
  let changed = false;

  for (const target of targetDirs) {
    for (const skill of skills) {
      const destination = join(target, skill);
      if (!existsSync(destination)) continue;
      changed = true;
      written.push(destination);
      if (!dryRun) rmSync(destination, { recursive: true, force: true });
    }
  }

  return { skills, written, changed };
}
