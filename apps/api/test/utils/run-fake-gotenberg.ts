// Dev helper: `pnpm --filter api exec tsx test/utils/run-fake-gotenberg.ts` prints the URL of a
// Gotenberg stand-in (real Chromium) for machines without Docker.
import { startFakeGotenberg } from './fake-gotenberg';

void startFakeGotenberg().then((g) => {
  process.stdout.write(`${g.url}\n`);
});
