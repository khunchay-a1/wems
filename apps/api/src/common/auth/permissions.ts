/**
 * Permission codes (docs/06-security.md §3.2). Must match docs/data/seed/roles.json — see permissions.spec.ts.
 * Phase 2–4 codes exist so seeded roles stay consistent, but no endpoint uses them before that phase.
 */
export const PERMISSIONS = [
  'user.manage',
  'role.manage',
  'settings.manage',
  'masterdata.manage',
  'audit.read',
  'client.read',
  'client.manage',
  'project.create',
  'project.manage',
  'project.read_all',
  'document.read',
  'document.create',
  'document.edit',
  'document.review',
  'document.approve',
  'document.admin',
  'transmittal.manage',
  'designbasis.edit',
  'designbasis.approve',
  'task.manage',
  'milestone.manage',
  'dailyreport.submit',
  'dailyreport.approve',
  'issue.create',
  'issue.manage',
  'inspection.submit',
  'inspection.approve',
  'sitequery.create',
  'sitequery.answer',
  'lab.read',
  'lab.job.manage',
  'lab.sample.receive',
  'lab.result.enter',
  'lab.result.review',
  'lab.result.approve',
  'lab.report.issue',
  'lab.masterdata.manage',
  'lab.instrument.manage',
  'sampling.plan',
  'sampling.perform',
  'quotation.create',
  'quotation.approve',
  'billing.manage',
  'timesheet.submit',
  'timesheet.approve',
  'costrate.manage',
  'dashboard.executive',
  'report.export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const known = new Set<string>(PERMISSIONS);
export function isPermission(value: string): value is Permission {
  return known.has(value);
}
