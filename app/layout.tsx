import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "../minikit.config";
import { RootProvider } from "./rootProvider";
import Navbar from "./components/Navbar";
import { Suspense } from "react";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    other: {
      "fc:frame": JSON.stringify({
        version: minikitConfig.miniapp.version,
        imageUrl: minikitConfig.miniapp.heroImageUrl,
        button: {
          title: `Join the ${minikitConfig.miniapp.name} Waitlist`,
          action: {
            name: `Launch ${minikitConfig.miniapp.name}`,
            type: "launch_frame",
          },
        },
      }),
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootProvider>
      <html lang="en">
        <body className={`${inter.variable} ${sourceCodePro.variable}`}>
          <SafeArea>
            <div style={{
              minHeight: '100vh',
              background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1419 100%)',
              color: '#fff',
              fontFamily: '"Georgia", "Times New Roman", "Times", serif'
            }}>
              <Suspense fallback={
                <header style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '1rem 1.5rem',
                  background: 'rgba(10, 14, 39, 0.8)',
                  backdropFilter: 'blur(20px)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 100,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    maxWidth: '1200px',
                    margin: '0 auto',
                    gap: '0.5rem'
                  }}>
                
                  </div>
                </header>
              }>
                <Navbar />
              </Suspense>
              {children}
            </div>
          </SafeArea>
        </body>
      </html>
    </RootProvider>
  );
}
