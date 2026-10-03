import 'package:uuid/uuid.dart';

const _uuid = Uuid();

/// UUIDv7 for entities and idempotency keys created on the device (docs/08-mobile.md §5.4).
String newId() => _uuid.v7();
