import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Draft Kernel - Pure JS Emulator & OS',
  description: 'A pure JavaScript virtual machine emulator running Draft Kernel with C/ASM BIOS and Bootloader execution.',
  openGraph: {
    title: 'Draft Kernel - Pure JS Emulator & OS',
    description: 'A pure JavaScript virtual machine emulator running Draft Kernel with C/ASM BIOS and Bootloader execution.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Draft Kernel - Pure JS Emulator & OS',
    description: 'A pure JavaScript virtual machine emulator running Draft Kernel with C/ASM BIOS and Bootloader execution.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
