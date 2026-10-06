import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://where-iam.vercel.app";
const TITLE = "Where I Am - 지도에서 위치 찾기";
const DESCRIPTION = "로드뷰를 보고 대한민국 어디인지 위치를 맞추는 게임";

// 모바일: 기기 폭에 맞추고, 노치/홈 바 영역까지 쓰되 safe-area 로 여백을 준다
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1b4b",
};

export const metadata: Metadata = {
  // 공유 미리보기(og:image 등)의 절대 URL 기준. 각 세그먼트의 opengraph-image.tsx 가 자동으로 붙는다.
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Where I Am",
    locale: "ko_KR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
