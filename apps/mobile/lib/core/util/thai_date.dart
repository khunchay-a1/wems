/// Date formatting for WEMS: stored as UTC, shown in Asia/Bangkok (UTC+7, no DST) with the
/// Buddhist era by default (CLAUDE.md rule 7, docs/09-nfr.md).
enum CalendarPref {
  buddhist,
  gregorian;

  static CalendarPref fromApi(String? v) => v == 'GREGORIAN' ? gregorian : buddhist;
  String get api => this == buddhist ? 'BUDDHIST' : 'GREGORIAN';
}

class ThaiDate {
  const ThaiDate({required this.locale, required this.calendar});

  final String locale;
  final CalendarPref calendar;

  static const _bangkokOffset = Duration(hours: 7);
  static const _th = [
    'ม.ค.',
    'ก.พ.',
    'มี.ค.',
    'เม.ย.',
    'พ.ค.',
    'มิ.ย.',
    'ก.ค.',
    'ส.ค.',
    'ก.ย.',
    'ต.ค.',
    'พ.ย.',
    'ธ.ค.',
  ];
  static const _en = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  /// Wall-clock time in Bangkok as a UTC-flagged DateTime (only its fields are meaningful).
  static DateTime bangkok(DateTime t) => t.toUtc().add(_bangkokOffset);

  int _year(int ce) => calendar == CalendarPref.buddhist ? ce + 543 : ce;

  String _ymd(int y, int m, int d) {
    final month = (locale == 'en' ? _en : _th)[m - 1];
    return '$d $month ${_year(y)}';
  }

  /// "3 ต.ค. 2569" for an instant.
  String date(DateTime? t) {
    if (t == null) return '—';
    final b = bangkok(t);
    return _ymd(b.year, b.month, b.day);
  }

  /// "3 ต.ค. 2569 14:05" for an instant.
  String dateTime(DateTime? t) {
    if (t == null) return '—';
    final b = bangkok(t);
    final hh = b.hour.toString().padLeft(2, '0');
    final mm = b.minute.toString().padLeft(2, '0');
    return '${_ymd(b.year, b.month, b.day)} $hh:$mm';
  }

  /// A date-only API value `YYYY-MM-DD` (no time zone shift).
  String dateOnly(String? ymd) {
    if (ymd == null || ymd.length < 10) return '—';
    final y = int.tryParse(ymd.substring(0, 4));
    final m = int.tryParse(ymd.substring(5, 7));
    final d = int.tryParse(ymd.substring(8, 10));
    if (y == null || m == null || d == null || m < 1 || m > 12) return ymd;
    return _ymd(y, m, d);
  }

  /// Parses an ISO instant from the API; null-safe.
  static DateTime? parse(Object? iso) => iso is String ? DateTime.tryParse(iso)?.toUtc() : null;
}
