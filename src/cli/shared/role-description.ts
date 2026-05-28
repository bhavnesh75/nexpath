import pc from 'picocolors';

const GOAL_EMPHASIS = 'WHAT YOUR GOAL IS';

/**
 * Framed, gray explanatory block shown beneath the project-role options in the
 * install prompt and the Ctrl+T role sub-menu. Opens with a question so the
 * reader recognises it as the role's description; the goal phrase is emphasised
 * because it is the single biggest factor in how nexpath guides the user.
 */
export function buildRoleDescriptionLines(): string[] {
  const bar  = pc.cyan('│');
  const goal = pc.bold(GOAL_EMPHASIS);
  return [
    `${bar}  ${pc.gray('Why a project role?')}`,
    `${bar}  ${pc.gray("Your role tells nexpath what kind of project you're building")}`,
    `${bar}  ${pc.gray('and your level of involvement, so it can assume your dev flow')}`,
    `${bar}  ${pc.gray('and tailor its advisories. Most importantly, it tells nexpath')}`,
    `${bar}  ${goal}${pc.gray(' — the biggest factor in how it guides you.')}`,
  ];
}
