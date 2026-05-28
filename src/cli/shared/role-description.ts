import pc from 'picocolors';

const GOAL_EMPHASIS = 'WHAT YOUR GOAL IS';

/** The four predefined project roles, in display order. `num` is the key the user types. */
export const ROLE_OPTIONS = [
  { num: 1, value: 'founder',      label: 'founder / product creator' },
  { num: 2, value: 'vibe_coder',   label: 'vibe coder' },
  { num: 3, value: 'indie_hacker', label: 'indie hacker' },
  { num: 4, value: 'pm',           label: 'product manager' },
] as const;

/**
 * Framed, gray explanatory block shown beneath the project-role options. Opens
 * with a question so the reader recognises it as the role's description; the
 * goal phrase is emphasised because it is the single biggest factor in how
 * nexpath guides the user. `colors` is injectable so a spawned window can force
 * ANSI output regardless of the parent process's color detection.
 */
export function buildRoleDescriptionLines(colors: ReturnType<typeof pc.createColors> = pc): string[] {
  const bar  = colors.cyan('│');
  const goal = colors.bold(GOAL_EMPHASIS);
  return [
    `${bar}  ${colors.gray('Why a project role?')}`,
    `${bar}  ${colors.gray("Your role tells nexpath what kind of project you're building")}`,
    `${bar}  ${colors.gray('and your level of involvement, so it can assume your dev flow')}`,
    `${bar}  ${colors.gray('and tailor its advisories. Most importantly, it tells nexpath')}`,
    `${bar}  ${goal}${colors.gray(' — the biggest factor in how it guides you.')}`,
  ];
}

/** Numbered "Project role" menu: header, options (current value tagged), then the description. */
export function buildRoleMenuLines(currentValue: string, colors: ReturnType<typeof pc.createColors> = pc): string[] {
  const bar = colors.cyan('│');
  return [
    bar,
    `${colors.cyan('◆')}  ${colors.bold('Project role')}`,
    ...ROLE_OPTIONS.map((o) => {
      const suffix = o.value === currentValue ? colors.dim(' (current)') : '';
      return `${bar}  ${colors.green(`${o.num})`)} ${o.label}${suffix}`;
    }),
    bar,
    ...buildRoleDescriptionLines(colors),
    bar,
  ];
}
