import 'package:flutter_test/flutter_test.dart';
import 'package:wems_mobile/core/push/deep_links.dart';
import 'package:wems_mobile/core/util/thai_date.dart';
import 'package:wems_mobile/core/util/version.dart';

void main() {
  group('thai_date (Asia/Bangkok, Buddhist era by default)', () {
    const th = ThaiDate(locale: 'th', calendar: CalendarPref.buddhist);
    const en = ThaiDate(locale: 'en', calendar: CalendarPref.gregorian);

    test('instants are shown in Bangkok time; 17:30 UTC is already the next day', () {
      final t = DateTime.utc(2026, 10, 2, 17, 30);
      expect(th.date(t), '3 ต.ค. 2569');
      expect(th.dateTime(t), '3 ต.ค. 2569 00:30');
      expect(en.dateTime(t), '3 Oct 2026 00:30');
    });

    test('date-only values are not shifted', () {
      expect(th.dateOnly('2026-12-31'), '31 ธ.ค. 2569');
      expect(en.dateOnly('2026-01-01'), '1 Jan 2026');
      expect(th.dateOnly(null), '—');
      expect(th.date(null), '—');
    });

    test('calendar preference maps to the API enum', () {
      expect(CalendarPref.fromApi('GREGORIAN'), CalendarPref.gregorian);
      expect(CalendarPref.fromApi(null), CalendarPref.buddhist);
      expect(CalendarPref.buddhist.api, 'BUDDHIST');
    });
  });

  group('forced update check (docs/08-mobile.md §10)', () {
    test('compares major.minor.patch numerically, ignoring build metadata', () {
      expect(isVersionBelow('1.2.9', '1.10.0'), isTrue);
      expect(isVersionBelow('1.10.0', '1.2.9'), isFalse);
      expect(isVersionBelow('1.0.0+7', '1.0.0'), isFalse);
      expect(isVersionBelow('1.0', '1.0.1'), isTrue);
      expect(isVersionBelow('2.0.0', '2.0.0'), isFalse);
    });

    test('formats sizes', () {
      expect(formatBytes(512), '512 B');
      expect(formatBytes(1536), '1.5 KB');
      expect(formatBytes(2 * 1024 * 1024 * 1024), '2.0 GB');
    });
  });

  group('push deep links (docs/08-mobile.md §8)', () {
    const p = '0192f0c4-0000-7000-8000-00000000000a';
    const d = '0192f0c4-0000-7000-8000-00000000000b';
    const r = '0192f0c4-0000-7000-8000-00000000000c';

    test('review steps open the review page', () {
      expect(
        routeForNotification(type: 'review.step.activated', entityType: 'ReviewStep', entityId: 's1'),
        '/reviews/s1',
      );
      expect(routeForNotification(type: 'review.step.overdue', entityId: 's2'), '/reviews/s2');
    });

    test('revision and transmittal events open the document from the web link', () {
      for (final type in [
        'revision.approved',
        'revision.rejected',
        'revision.superseded',
        'transmittal.client_response_recorded',
      ]) {
        expect(
          routeForNotification(
            type: type,
            entityType: 'DocumentRevision',
            entityId: r,
            link: '/projects/$p/documents/$d/revisions/$r/review',
          ),
          '/projects/$p/documents/$d',
        );
      }
      expect(
        routeForNotification(type: 'revision.approved', link: '/projects/$p/documents/$d?rev=$r'),
        '/projects/$p/documents/$d',
      );
    });

    test('comments carry the comment id; no link falls back to the revision resolver', () {
      expect(
        routeForNotification(
          type: 'comment.created',
          entityType: 'Comment',
          entityId: 'c1',
          link: '/projects/$p/documents/$d/revisions/$r/review',
        ),
        '/projects/$p/documents/$d?comment=c1',
      );
      expect(
        routeForNotification(type: 'revision.voided', entityType: 'DocumentRevision', entityId: r),
        '/revisions/$r',
      );
      expect(routeForNotification(type: 'project.member_added'), '/notifications');
    });

    test('push data map', () {
      expect(routeForPushData({'type': 'review.step.due_soon', 'entityId': 's9'}), '/reviews/s9');
    });
  });
}
