import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '../contexts/AuthContext';
import { UserProvider } from '../contexts/UserContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import AuthGuard from '../components/AuthGuard';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ระบบจัดการเติมเงิน',
  description: 'ระบบจัดการเติมเงินเว็บไซต์และทีมงาน',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <UserProvider>
              <AuthGuard>
                {children}
              </AuthGuard>
              <Toaster position="top-center" />
            </UserProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
} 