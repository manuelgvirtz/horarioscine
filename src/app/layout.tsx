import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-headline",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cartelera.ar | Absolutamente cine 🚬",
  description:
    "Absolutamente cine 🚬 — Todos los horarios de cine de Argentina en un solo lugar. Cinemark, Cinépolis, Showcase, Atlas y más.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Cartelera.ar",
              url: "https://cartelera.ar",
              slogan: "Absolutamente cine 🚬",
            }),
          }}
        />
        {/* Preconnect: establishes DNS + TCP to Google Fonts early */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Preload hint: browser starts fetching the icon font CSS immediately
          but does NOT apply it yet — avoids the render-blocking stylesheet
          request that was hurting FCP/LCP. The Script below applies it after
          the page is interactive (no more blocking the initial render).
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="preload"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          as="style"
        />
      </head>
      <body className={`${manrope.variable} bg-surface-container-lowest text-on-surface font-body selection:bg-primary-container selection:text-on-primary-container min-h-screen flex flex-col`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-primary-container focus:text-on-primary-container focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-sm focus:shadow-lg"
        >
          Ir al contenido principal
        </a>
        <Header />
        <main id="main-content" className="flex-1 pt-24 pb-12 px-6 max-w-screen-2xl mx-auto w-full">
          {children}
        </main>
        <Footer />
        {/* Google Analytics — loaded after all resources, minimises TBT */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-GY1K8YHYKH"
          strategy="lazyOnload"
        />
        <Script id="ga-init" strategy="lazyOnload">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-GY1K8YHYKH');
        `}</Script>
        {/*
          Material Symbols — applied after hydration so it never blocks FCP/LCP.
          The <link rel="preload"> above ensures the browser fetches the CSS
          immediately; this script applies it once the page is interactive.
        */}
        <Script id="material-symbols-css" strategy="afterInteractive">{`
          (function () {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
            document.head.appendChild(l);
          })();
        `}</Script>
      </body>
    </html>
  );
}
