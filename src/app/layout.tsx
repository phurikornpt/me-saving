import type { Metadata, Viewport } from "next";
import { Anuphan, Mitr } from "next/font/google";
import { iconFontUrl } from "@/client/icons";
import { Providers } from "@/client/Providers";
import { INTRO_INIT_SCRIPT } from "@/client/intro";
import { THEME_INIT_SCRIPT } from "@/client/theme";
import { AppIntro } from "@/components/AppIntro";
import { FeedbackProvider } from "@/components/Feedback";
import "./globals.css";

const mitr = Mitr({ variable: "--font-mitr", subsets: ["thai", "latin"], weight: ["500", "600"] });
const anuphan = Anuphan({ variable: "--font-anuphan", subsets: ["thai", "latin"] });

export const metadata: Metadata = {
  title: "me-budget",
  description: "จดรายรับรายจ่ายแบบกดเดียวจบ",
  appleWebApp: { capable: true, title: "me-budget", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3f1" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme on <html> before React hydrates
    <html lang="th" suppressHydrationWarning className={`${mitr.variable} ${anuphan.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INTRO_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Material Symbols subset: only the glyphs listed in src/client/icons.ts */}
        <link rel="stylesheet" href={iconFontUrl()} />
      </head>
      <body className="min-h-full bg-surface text-ink">
        <AppIntro />
        <Providers>
          <FeedbackProvider>{children}</FeedbackProvider>
        </Providers>
      </body>
    </html>
  );
}
