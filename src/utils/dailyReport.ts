/**
 * SCARO ERP — Daily Report & Plan Utility
 * Ensures clean separation between:
 * 1. Morning check-in = Today's Plan
 * 2. Evening report = Work Completed / Daily Notes
 * 3. Plan for Tomorrow = Explicitly entered future plan
 */

const TODAY_PLAN_PREFIX = "Today's Plan:";
const WORK_COMPLETED_HEADER = "\n\nWork Completed:\n";

/**
 * Extracts Today's Plan from the stored report notes.
 * Returns null if no explicit morning plan was submitted.
 */
export function extractTodayPlan(notes: string | null | undefined): string | null {
  if (!notes || typeof notes !== 'string') return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(TODAY_PLAN_PREFIX)) {
    const afterPrefix = trimmed.slice(TODAY_PLAN_PREFIX.length);
    const workHeaderIndex = afterPrefix.indexOf(WORK_COMPLETED_HEADER);
    if (workHeaderIndex !== -1) {
      const plan = afterPrefix.slice(0, workHeaderIndex).trim();
      return plan || null;
    }
    const legacyWorkIndex = afterPrefix.indexOf('\n\nWork done:\n');
    if (legacyWorkIndex !== -1) {
      const plan = afterPrefix.slice(0, legacyWorkIndex).trim();
      return plan || null;
    }
    return afterPrefix.trim() || null;
  }

  // Handle legacy "Planned for today:\n..." format
  if (trimmed.startsWith('Planned for today:\n')) {
    const afterPrefix = trimmed.slice('Planned for today:\n'.length);
    const workIndex = afterPrefix.indexOf('\n\nWork done:\n');
    if (workIndex !== -1) {
      return afterPrefix.slice(0, workIndex).trim() || null;
    }
    return afterPrefix.trim() || null;
  }

  return null;
}

/**
 * Extracts Work Completed / Daily Notes from the stored report notes.
 */
export function extractWorkDone(notes: string | null | undefined): string {
  if (!notes || typeof notes !== 'string') return '';
  const trimmed = notes.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith(TODAY_PLAN_PREFIX)) {
    const afterPrefix = trimmed.slice(TODAY_PLAN_PREFIX.length);
    const workHeaderIndex = afterPrefix.indexOf(WORK_COMPLETED_HEADER);
    if (workHeaderIndex !== -1) {
      return afterPrefix.slice(workHeaderIndex + WORK_COMPLETED_HEADER.length).trim();
    }
    const legacyWorkIndex = afterPrefix.indexOf('\n\nWork done:\n');
    if (legacyWorkIndex !== -1) {
      return afterPrefix.slice(legacyWorkIndex + '\n\nWork done:\n'.length).trim();
    }
    // If it only contains Today's Plan prefix, no work completed was logged
    return '';
  }

  if (trimmed.startsWith('Planned for today:\n')) {
    const afterPrefix = trimmed.slice('Planned for today:\n'.length);
    const workIndex = afterPrefix.indexOf('\n\nWork done:\n');
    if (workIndex !== -1) {
      return afterPrefix.slice(workIndex + '\n\nWork done:\n'.length).trim();
    }
    return '';
  }

  // If notes does not start with a plan prefix, the whole text represents work completed
  return trimmed;
}

/**
 * Combines Today's Plan and Work Completed into structured notes for storage.
 */
export function formatReportNotes(
  todayPlan: string | null | undefined,
  workDone: string | null | undefined
): string {
  const cleanPlan = todayPlan?.trim() || '';
  const cleanWork = workDone?.trim() || '';

  if (cleanPlan && cleanWork) {
    return `${TODAY_PLAN_PREFIX} ${cleanPlan}${WORK_COMPLETED_HEADER}${cleanWork}`;
  }

  if (cleanPlan) {
    return `${TODAY_PLAN_PREFIX} ${cleanPlan}`;
  }

  if (cleanWork) {
    return cleanWork;
  }

  return '';
}
