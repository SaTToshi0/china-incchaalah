import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Validateur de Marché',
  description: 'Partagez un problème. Imaginez sa solution. Nous nous chargeons d\'explorer les possibilités.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/5ac3fe7c6abd2f62067f266d89671492?family=HelveticaNowDisplay-Medium" />
        <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/1aa3377e489837a26d019bba501e779d?family=HelveticaNowDisplayW01-Rg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
