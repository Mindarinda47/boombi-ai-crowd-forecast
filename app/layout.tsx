import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return {
    title: "붐비 | 부산 AI 혼잡 예보",
    description: "행사, 검색 관심도, 날씨를 분석해 앞으로 8일의 부산 혼잡과 덜 붐비는 방문 시간을 알려드립니다.",
    openGraph: {
      title: "붐비 | 부산 AI 혼잡 예보",
      description: "붐비기 전에, 미리 알고 움직이세요.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: "붐비 부산 AI 혼잡 예보" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "붐비 | 부산 AI 혼잡 예보",
      description: "붐비기 전에, 미리 알고 움직이세요.",
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#08110e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://hangeul.pstatic.net" />
        <link rel="stylesheet" href="https://hangeul.pstatic.net/hangeul_static/css/nanum-square.css" />
      </head>
      <body className={geistMono.variable}>{children}</body>
    </html>
  );
}
