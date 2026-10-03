/// `major.minor.patch` comparison for the forced-update check (docs/08-mobile.md §10).
/// Build metadata (`+12`) and pre-release suffixes are ignored.
bool isVersionBelow(String current, String minimum) {
  List<int> parts(String v) {
    final core = v.split('+').first.split('-').first;
    final out = core.split('.').map((p) => int.tryParse(p) ?? 0).toList();
    while (out.length < 3) {
      out.add(0);
    }
    return out;
  }

  final a = parts(current);
  final b = parts(minimum);
  for (var i = 0; i < 3; i++) {
    if (a[i] != b[i]) return a[i] < b[i];
  }
  return false;
}

/// Human file size, e.g. "12.4 MB".
String formatBytes(int bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  var v = bytes.toDouble();
  var u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return u == 0 ? '$bytes B' : '${v.toStringAsFixed(1)} ${units[u]}';
}
