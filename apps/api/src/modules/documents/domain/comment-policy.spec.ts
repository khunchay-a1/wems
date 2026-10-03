import { type CommentFacts, commentActions, isEditable, validAnchor } from './comment-policy';

const base: CommentFacts = {
  status: 'OPEN',
  isAuthor: false,
  stepStatus: 'ACTIVE',
  ownerOpen: true,
  canAnswer: false,
  isDocumentAdmin: false,
};

describe('comment policy (docs/05-workflows.md §3, M04 §10)', () => {
  it('BR-DOC-035 the reviewer edits an OPEN review comment only while the step is ACTIVE', () => {
    expect(isEditable({ status: 'OPEN', stepStatus: 'ACTIVE' })).toBe(true);
    expect(isEditable({ status: 'OPEN', stepStatus: 'REJECTED' })).toBe(false);
    expect(isEditable({ status: 'RESPONDED', stepStatus: 'ACTIVE' })).toBe(false);
    expect(isEditable({ status: 'NONE', stepStatus: null })).toBe(true);
    expect(commentActions({ ...base, isAuthor: true }).allowed).toEqual(
      expect.arrayContaining(['edit', 'delete', 'close']),
    );
    expect(commentActions({ ...base, isAuthor: true, stepStatus: 'APPROVED' }).blocked).toEqual([
      { action: 'edit', code: 'DOC_COMMENT_NOT_EDITABLE' },
    ]);
  });

  it('the preparer answers OPEN comments; author or document.admin closes and reopens', () => {
    expect(commentActions({ ...base, canAnswer: true }).allowed).toContain('respond');
    expect(commentActions({ ...base, status: 'RESPONDED', canAnswer: true }).allowed).not.toContain(
      'respond',
    );
    expect(commentActions({ ...base, status: 'RESPONDED', isAuthor: true }).allowed).toEqual(
      expect.arrayContaining(['close', 'reopen']),
    );
    expect(commentActions({ ...base, status: 'RESPONDED', isDocumentAdmin: true }).allowed).toEqual(
      expect.arrayContaining(['close', 'reopen']),
    );
    expect(commentActions({ ...base, status: 'CLOSED', isAuthor: true }).allowed).toEqual([
      'reply',
    ]);
  });

  it('general comments (NONE) have no workflow; frozen revisions allow nothing', () => {
    expect(
      commentActions({ ...base, status: 'NONE', canAnswer: true, isAuthor: true }).allowed,
    ).toEqual(['reply', 'edit', 'delete']);
    expect(commentActions({ ...base, ownerOpen: false, isAuthor: true }).allowed).toEqual([]);
  });

  it('anchors: PIN has no size, RECT must fit the page', () => {
    expect(validAnchor({ kind: 'PIN', x: 0.5, y: 0.5 })).toBe(true);
    expect(validAnchor({ kind: 'PIN', x: 0.5, y: 0.5, w: 0.1 })).toBe(false);
    expect(validAnchor({ kind: 'RECT', x: 0.1, y: 0.1, w: 0.3, h: 0.2 })).toBe(true);
    expect(validAnchor({ kind: 'RECT', x: 0.9, y: 0.1, w: 0.3, h: 0.2 })).toBe(false);
    expect(validAnchor({ kind: 'RECT', x: 0.1, y: 0.1 })).toBe(false);
  });
});
