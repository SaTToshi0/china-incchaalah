'use client';

import Link from 'next/link';
import { Share2, Copy, Check, ChevronLeft } from 'lucide-react';
import { useState } from 'react';

export default function Success() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Validateur de Marché',
          text: 'J\'ai partagé mon idée de produit ! Rejoins le mouvement.',
          url: window.location.origin,
        });
      } catch (err) {
        console.error('Error sharing', err);
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center container relative overflow-hidden py-12">
      <div className="max-w-xl w-full neo-card text-center animate-scale-in p-8 md:p-12">
        <div className="w-24 h-24 mx-auto neo-card-inset rounded-full flex items-center justify-center mb-8 relative">
          <div className="absolute inset-2 bg-success rounded-full opacity-20 animate-pulse"></div>
          <svg className="w-12 h-12 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path className="animate-[drawCheck_0.5s_ease-out_forwards]" d="M20 6L9 17l-5-5" strokeDasharray="100" strokeDashoffset="100" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-bold mb-4 text-main">Merci ! Votre idée a bien été enregistrée.</h1>
        <p className="text-muted mb-8 text-lg">
          Votre réponse pourrait contribuer à faire émerger le prochain produit que nous lancerons.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <button onClick={handleShare} className="neo-btn flex justify-center py-4 w-full">
            <Share2 size={20} /> Partager
          </button>
          <button onClick={handleCopy} className="neo-btn flex justify-center py-4 w-full">
            {copied ? <Check size={20} className="text-success" /> : <Copy size={20} />}
            {copied ? 'Copié !' : 'Copier le lien'}
          </button>
        </div>
        
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-1 hover:text-accent-2 transition-colors">
          <ChevronLeft size={16} /> Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
