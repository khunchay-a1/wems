import type { ProjectStatus } from '../../../generated/prisma/enums';
import {
  assertTransition,
  canTransition,
  documentsEditable,
  PROJECT_ACTIONS,
  type ProjectAction,
  projectReadOnly,
  transmittalsAllowed,
} from './project-state-machine';

const ALL: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED'];

// every arrow of docs/05-workflows.md §6
const TABLE: [ProjectStatus, ProjectAction, ProjectStatus][] = [
  ['PLANNING', 'start', 'ACTIVE'],
  ['ACTIVE', 'hold', 'ON_HOLD'],
  ['ON_HOLD', 'resume', 'ACTIVE'],
  ['ACTIVE', 'complete', 'COMPLETED'],
  ['COMPLETED', 'close', 'CLOSED'],
  ['CLOSED', 'reopen', 'ACTIVE'],
  ['PLANNING', 'cancel', 'CANCELLED'],
  ['ACTIVE', 'cancel', 'CANCELLED'],
  ['ON_HOLD', 'cancel', 'CANCELLED'],
];

describe('BR-PRJ-020 project state machine (05-workflows §6)', () => {
  it.each(TABLE)('%s --%s--> %s', (from, action, to) => {
    expect(assertTransition(from, action)).toBe(to);
  });

  it('rejects every transition not in the table with INVALID_STATE_TRANSITION', () => {
    for (const from of ALL) {
      for (const action of PROJECT_ACTIONS) {
        const allowed = TABLE.some(([f, a]) => f === from && a === action);
        expect(canTransition(from, action)).toBe(allowed);
        if (!allowed) {
          expect(() => assertTransition(from, action)).toThrow(
            expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
          );
        }
      }
    }
  });

  it('documents are editable only in PLANNING/ACTIVE; CLOSED/CANCELLED are read-only', () => {
    expect(ALL.filter(documentsEditable)).toEqual(['PLANNING', 'ACTIVE']);
    expect(ALL.filter(projectReadOnly)).toEqual(['CLOSED', 'CANCELLED']);
    expect(ALL.filter(transmittalsAllowed)).toEqual(['PLANNING', 'ACTIVE', 'COMPLETED']);
  });
});
