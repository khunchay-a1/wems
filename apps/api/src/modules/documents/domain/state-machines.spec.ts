import type {
  CommentStatus,
  ReviewStepStatus,
  RevisionStatus,
} from '../../../generated/prisma/enums';
import {
  assertCommentTransition,
  canComment,
  type CommentAction,
  COMMENT_TRANSITIONS,
} from './comment-state-machine';
import {
  advanceCycle,
  assertStepTransition,
  canStep,
  type StepAction,
  STEP_FROM,
} from './review-state-machine';
import {
  assertRevisionTransition,
  canDiscard,
  canRevision,
  type RevisionAction,
  REVISION_TRANSITIONS,
} from './revision-state-machine';

const REV: RevisionStatus[] = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ISSUED', 'SUPERSEDED', 'VOID'];
const STEP: ReviewStepStatus[] = [
  'PENDING',
  'ACTIVE',
  'APPROVED',
  'APPROVED_WITH_COMMENTS',
  'REJECTED',
  'SKIPPED',
  'CANCELLED',
];
const CMT: CommentStatus[] = ['NONE', 'OPEN', 'RESPONDED', 'CLOSED'];

describe('revision state machine (05-workflows §1)', () => {
  // every row of the §1 table
  const ROWS: [RevisionStatus, RevisionAction, RevisionStatus | null][] = [
    ['DRAFT', 'upload', 'DRAFT'],
    ['DRAFT', 'discard', null],
    ['DRAFT', 'submit', 'IN_REVIEW'],
    ['IN_REVIEW', 'approve', 'APPROVED'],
    ['IN_REVIEW', 'reject', 'DRAFT'],
    ['IN_REVIEW', 'cancelReview', 'DRAFT'],
    ['APPROVED', 'issue', 'ISSUED'],
    ['APPROVED', 'supersede', 'SUPERSEDED'],
    ['ISSUED', 'supersede', 'SUPERSEDED'],
    ['DRAFT', 'void', 'VOID'],
    ['APPROVED', 'void', 'VOID'],
    ['ISSUED', 'void', 'VOID'],
  ];
  it.each(ROWS)('BR-DOC-020 %s --%s--> %s', (from, action, to) => {
    expect(assertRevisionTransition(from, action)).toBe(to);
  });

  it('rejects everything else; uploads after DRAFT are DOC_REVISION_LOCKED (BR-DOC-026)', () => {
    for (const from of REV) {
      for (const action of Object.keys(REVISION_TRANSITIONS) as RevisionAction[]) {
        if (canRevision(from, action)) continue;
        const code =
          action === 'upload' || action === 'edit'
            ? 'DOC_REVISION_LOCKED'
            : 'INVALID_STATE_TRANSITION';
        expect(() => assertRevisionTransition(from, action)).toThrow(
          expect.objectContaining({ code }),
        );
      }
    }
  });

  it('BR-DOC-025 discard only for never-submitted drafts without comments', () => {
    expect(canDiscard({ status: 'DRAFT', cycles: 0, comments: 0 })).toBe(true);
    expect(canDiscard({ status: 'DRAFT', cycles: 1, comments: 0 })).toBe(false);
    expect(canDiscard({ status: 'DRAFT', cycles: 0, comments: 2 })).toBe(false);
    expect(canDiscard({ status: 'IN_REVIEW', cycles: 0, comments: 0 })).toBe(false);
  });
});

describe('review step state machine (05-workflows §2)', () => {
  const opt = (status: ReviewStepStatus, isOptional = false) => ({ status, isOptional });
  it('BR-DOC-031 PENDING → ACTIVE when the group opens', () => {
    expect(assertStepTransition(opt('PENDING'), 'activate')).toBe('ACTIVE');
  });
  it.each(['APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED'] as const)(
    'BR-DOC-033 ACTIVE --decision %s',
    (d) => expect(assertStepTransition(opt('ACTIVE'), 'decide', d)).toBe(d),
  );
  it.each(['PENDING', 'ACTIVE'] as const)('%s → SKIPPED only for optional steps', (s) => {
    expect(assertStepTransition(opt(s, true), 'skip')).toBe('SKIPPED');
    expect(() => assertStepTransition(opt(s), 'skip')).toThrow(
      expect.objectContaining({ code: 'DOC_STEP_NOT_OPTIONAL' }),
    );
  });
  it.each(['PENDING', 'ACTIVE'] as const)('%s → CANCELLED and reassign keeps the status', (s) => {
    expect(assertStepTransition(opt(s), 'cancel')).toBe('CANCELLED');
    expect(assertStepTransition(opt(s), 'reassign')).toBe(s);
  });
  it('other combinations → DOC_STEP_NOT_ACTIVE', () => {
    for (const s of STEP) {
      for (const a of Object.keys(STEP_FROM) as StepAction[]) {
        if (canStep(s, a)) continue;
        expect(() => assertStepTransition(opt(s, true), a, 'APPROVED')).toThrow(
          expect.objectContaining({ code: 'DOC_STEP_NOT_ACTIVE' }),
        );
      }
    }
  });

  describe('BR-DOC-031/032 cycle progression', () => {
    const s = (id: string, stepOrder: number, status: ReviewStepStatus) => ({
      id,
      stepOrder,
      status,
    });
    it('opens the first group', () => {
      expect(
        advanceCycle([s('a', 1, 'PENDING'), s('b', 1, 'PENDING'), s('c', 2, 'PENDING')]),
      ).toEqual({
        outcome: 'IN_PROGRESS',
        activate: ['a', 'b'],
        cancel: [],
      });
    });
    it('waits for every parallel step of a group', () => {
      expect(
        advanceCycle([s('a', 1, 'APPROVED'), s('b', 1, 'ACTIVE'), s('c', 2, 'PENDING')]).activate,
      ).toEqual([]);
    });
    it('moves to the next group once the group is done (skipped counts)', () => {
      expect(
        advanceCycle([
          s('a', 1, 'APPROVED_WITH_COMMENTS'),
          s('b', 1, 'SKIPPED'),
          s('c', 2, 'PENDING'),
        ]).activate,
      ).toEqual(['c']);
    });
    it('approves when the last group is done', () => {
      expect(advanceCycle([s('a', 1, 'APPROVED'), s('c', 2, 'APPROVED')]).outcome).toBe('APPROVED');
    });
    it('a rejection rejects the cycle and cancels open steps', () => {
      expect(
        advanceCycle([s('a', 1, 'REJECTED'), s('b', 1, 'ACTIVE'), s('c', 2, 'PENDING')]),
      ).toEqual({
        outcome: 'REJECTED',
        activate: [],
        cancel: ['b', 'c'],
      });
    });
  });
});

describe('comment state machine (05-workflows §3)', () => {
  const ROWS: [CommentStatus, CommentAction, CommentStatus][] = [
    ['OPEN', 'respond', 'RESPONDED'],
    ['RESPONDED', 'close', 'CLOSED'],
    ['RESPONDED', 'reopen', 'OPEN'],
    ['OPEN', 'close', 'CLOSED'],
    ['OPEN', 'carryOver', 'CLOSED'],
    ['RESPONDED', 'carryOver', 'CLOSED'],
  ];
  it.each(ROWS)('BR-DOC-034 %s --%s--> %s', (from, action, to) => {
    expect(assertCommentTransition(from, action)).toBe(to);
  });
  it('general comments (NONE) and closed ones have no transitions', () => {
    for (const s of CMT) {
      for (const a of Object.keys(COMMENT_TRANSITIONS) as CommentAction[]) {
        if (canComment(s, a)) continue;
        expect(() => assertCommentTransition(s, a)).toThrow(
          expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
        );
      }
    }
  });
});
