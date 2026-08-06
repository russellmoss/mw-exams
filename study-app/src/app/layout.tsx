import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
import { NavBar } from "./components/NavBar";
import { MobileTabBar } from "./components/MobileTabBar";
import { DictationBanner } from "./components/DictationBanner";
import "./globals.css";

// Applies the saved theme to <html> before first paint, so a light-mode user never sees a flash of
// the dark palette. Dark is the default for anyone who has never toggled. Deliberately tiny and
// synchronous — it must run ahead of hydration.
const themeInitScript =
  `(function(){var d=${JSON.stringify(DEFAULT_THEME)};` +
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `document.documentElement.dataset.theme=t==="light"||t==="dark"?t:d;}` +
  `catch(e){document.documentElement.dataset.theme=d;}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif for the few wine-literate moments (page titles, debrief headings, wine names).
// Kept strictly at display sizes — Geist stays the UI/body/data face. See DESIGN.md.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "MW Practical Exam Study Tool",
  description:
    "Interactive study tool for the Master of Wine practical tasting exam",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-geist-sans)]">
        <ThemeProvider>
          <AuthProvider>
            <DictationBanner />
            <NavBar />
            {children}
            <MobileTabBar />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
