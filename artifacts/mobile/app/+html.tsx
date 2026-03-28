import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* iOS PWA meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Fiesta CRM" />
        <link rel="icon" type="image/png" sizes="192x192" href="/pwa-icon-192.png" />
        <link rel="apple-touch-icon" href="/pwa-icon-192.png" />

        {/* Theme color */}
        <meta name="theme-color" content="#C4A57B" />

        <ScrollViewStyleReset />

        {/* Prevent body scroll on web */}
        <style dangerouslySetInnerHTML={{ __html: `@font-face{font-family:'feather';src:url('/fonts/Feather.ttf') format('truetype');font-display:block}@font-face{font-family:'material-community';src:url('/fonts/MaterialCommunityIcons.ttf') format('truetype');font-display:block}:root{--shadow-sm:0 1px 2px rgba(0,0,0,.05),0 1px 3px rgba(0,0,0,.10);--shadow-md:0 4px 6px -1px rgba(0,0,0,.10),0 2px 4px -2px rgba(0,0,0,.10);--shadow-lg:0 10px 15px -3px rgba(0,0,0,.10),0 4px 6px -4px rgba(0,0,0,.10);--shadow-fab:0 4px 10px rgba(0,0,0,.20)}@media(prefers-color-scheme:dark){:root{--shadow-sm:0 1px 2px rgba(0,0,0,.20),0 1px 3px rgba(0,0,0,.30);--shadow-md:0 4px 6px -1px rgba(0,0,0,.30),0 2px 4px -2px rgba(0,0,0,.30);--shadow-lg:0 10px 15px -3px rgba(0,0,0,.35),0 4px 6px -4px rgba(0,0,0,.30);--shadow-fab:0 4px 10px rgba(0,0,0,.55)}}body{overflow:hidden;height:100vh;background-color:#f0f3f7}@media(prefers-color-scheme:dark){body{background-color:#0b0f1a}}#root{display:flex;height:100vh}*:focus-visible{outline:2px solid #BB935B;outline-offset:2px;border-radius:4px}` }} />
      </head>
      <body>
        {children}

        {/* Service worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
