import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Providers } from '@/components/providers';
import './globals.css';

const notoThai = localFont({
  src: '../fonts/NotoSansThai.ttf',
  variable: '--font-noto-thai',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: { default: 'WEMS', template: '%s · WEMS' },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={notoThai.variable}>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
