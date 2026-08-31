'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Phone, Mail, Search, Check } from 'lucide-react';

const CHOICES_PROBLEM = [
  { id: 'free_text', title: 'Je veux décrire mon problème', icon: '✍️' },
  { id: 'fashion', title: 'Mode & accessoires', description: 'Vêtements, accessoires, sacs, chaussures et problèmes liés au quotidien.', icon: '👗' },
  { id: 'tech', title: 'Électronique & accessoires tech', description: 'Smartphones, ordinateurs, accessoires, gadgets et technologie du quotidien.', icon: '📱' },
  { id: 'beauty', title: 'Beauté & soins personnels', description: 'Soins de la peau, cheveux, beauté, hygiène et bien-être personnel.', icon: '✨' },
];

const CHOICES_PRODUCT = [
  { id: 'free_text', title: 'Je veux décrire mon idée de produit', icon: '💡' },
  { id: 'fashion', title: 'Mode & accessoires', description: 'Vêtements, accessoires, sacs, chaussures et problèmes liés au quotidien.', icon: '👗' },
  { id: 'tech', title: 'Électronique & accessoires tech', description: 'Smartphones, ordinateurs, accessoires, gadgets et technologie du quotidien.', icon: '📱' },
  { id: 'beauty', title: 'Beauté & soins personnels', description: 'Soins de la peau, cheveux, beauté, hygiène et bien-être personnel.', icon: '✨' },
];

export default function Survey() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState('forward');
  
  // Form State
  const [problemChoice, setProblemChoice] = useState('');
  const [problemText, setProblemText] = useState('');
  
  const [productChoice, setProductChoice] = useState('');
  const [productText, setProductText] = useState('');
  
  const [contactConsent, setContactConsent] = useState(false);
  const [contactMethod, setContactMethod] = useState<'phone' | 'email' | ''>('');
  const [countryCode, setCountryCode] = useState('+33');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nextStep = () => {
    setDirection('forward');
    setStep((s) => Math.min(s + 1, 3));
    window.scrollTo(0,0);
  };
  
  const prevStep = () => {
    setDirection('backward');
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo(0,0);
  };

  const isStep1Valid = problemChoice && (problemChoice !== 'free_text' || problemText.length >= 10);
  const isStep2Valid = productChoice && (productChoice !== 'free_text' || productText.length >= 10);
  const isStep3Valid = !contactConsent || (contactConsent && contactMethod && termsAccepted && (
    (contactMethod === 'phone' && phoneNumber.length > 5) ||
    (contactMethod === 'email' && email.includes('@') && email.includes('.'))
  ));

  const handleSubmit = async () => {
    if (!isStep3Valid) return;
    setIsSubmitting(true);
    setError('');
    
    const data = {
      problem: { choice: problemChoice, text: problemText },
      product: { choice: productChoice, text: productText },
      contact: contactConsent ? { method: contactMethod, countryCode, phone: phoneNumber, email } : null,
    };
    
    try {
      // Mocking fetch as described in the requirements
      await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      router.push('/success');
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen container py-8 md:py-16">
      <div className="max-w-2xl mx-auto">
        {/* 3D Sphere Neomorphic Progress Slider */}
        <div className="range-container">
          <div className="range-track-label">
            {[1, 2, 3].map((num) => (
              <span 
                key={num} 
                className="range-step-num"
                onClick={() => {
                  if (num < step) {
                    setDirection('backward');
                    setStep(num);
                  } else if (num === 2 && isStep1Valid) {
                    setDirection('forward');
                    setStep(2);
                  } else if (num === 3 && isStep1Valid && isStep2Valid) {
                    setDirection('forward');
                    setStep(3);
                  }
                }}
              >
                {num}
              </span>
            ))}
          </div>
          
          <div 
            className="ball-container"
            style={{
              transform: step === 1 ? 'translateX(0px)' : step === 2 ? 'translateX(calc((100% - 3rem) * 0.5))' : 'translateX(calc(100% - 3rem))'
            }}
          >
            <div className="ball-shadow"></div>
            <div className="ball"></div>
          </div>
        </div>

        {error && <div className="p-4 mb-6 neo-card-inset text-error text-center text-sm font-medium">{error}</div>}

        <div className={`transition-all duration-300 ${direction === 'forward' ? 'step-enter' : 'step-enter-left'}`} key={step}>
          
          {/* STEP 1 */}
          {step === 1 && (
            <div className="neo-card">
              <h2 className="text-2xl font-bold mb-2">Quel problème rencontrez-vous dans votre vie quotidienne ?</h2>
              <p className="text-muted mb-8">Partagez un problème qui vous agace, vous fait perdre du temps ou que vous aimeriez simplement pouvoir résoudre plus facilement.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {CHOICES_PROBLEM.map((choice) => (
                  <div 
                    key={choice.id}
                    className={`neo-card choice-card ${problemChoice === choice.id ? 'selected' : ''}`}
                    onClick={() => setProblemChoice(choice.id)}
                  >
                    <div className="text-3xl mb-3">{choice.icon}</div>
                    <h3 className="font-bold text-lg mb-1">{choice.title}</h3>
                    {choice.description && <p className="text-sm text-muted">{choice.description}</p>}
                  </div>
                ))}
              </div>

              {problemChoice === 'free_text' && (
                <div className="mb-8 animate-slide-up">
                  <textarea 
                    className="neo-input" 
                    placeholder="Décrivez votre problème ici..."
                    maxLength={2000}
                    value={problemText}
                    onChange={(e) => setProblemText(e.target.value)}
                  />
                  <div className="text-right text-xs text-muted mt-2">{problemText.length}/2000</div>
                </div>
              )}

              <div className="flex justify-end">
                <button 
                  className="neo-btn neo-btn-primary" 
                  disabled={!isStep1Valid}
                  onClick={nextStep}
                >
                  Suivant <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="neo-card">
              <h2 className="text-2xl font-bold mb-2">Quel produit pourrait résoudre ce problème ?</h2>
              <p className="text-muted mb-8">Imaginez le produit idéal qui pourrait résoudre ce problème. Vous pouvez être aussi créatif que vous le souhaitez.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {CHOICES_PRODUCT.map((choice) => (
                  <div 
                    key={choice.id}
                    className={`neo-card choice-card ${productChoice === choice.id ? 'selected' : ''}`}
                    onClick={() => setProductChoice(choice.id)}
                  >
                    <div className="text-3xl mb-3">{choice.icon}</div>
                    <h3 className="font-bold text-lg mb-1">{choice.title}</h3>
                    {choice.description && <p className="text-sm text-muted">{choice.description}</p>}
                  </div>
                ))}
              </div>

              {productChoice === 'free_text' && (
                <div className="mb-8 animate-slide-up">
                  <textarea 
                    className="neo-input" 
                    placeholder="Décrivez le produit que vous aimeriez voir exister..."
                    maxLength={2000}
                    value={productText}
                    onChange={(e) => setProductText(e.target.value)}
                  />
                  <div className="text-right text-xs text-muted mt-2">{productText.length}/2000</div>
                </div>
              )}

              <div className="flex justify-between">
                <button className="neo-btn" onClick={prevStep}>
                  <ChevronLeft size={20} /> Précédent
                </button>
                <button 
                  className="neo-btn neo-btn-primary" 
                  disabled={!isStep2Valid}
                  onClick={nextStep}
                >
                  Suivant <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="neo-card">
              <h2 className="text-2xl font-bold mb-2">Voulez-vous être informé lorsque ce produit sera disponible ?</h2>
              <p className="text-muted mb-8">Cette étape est totalement facultative.</p>
              
              <div className="flex items-center gap-4 mb-8 neo-card-inset">
                <div 
                  className="neo-toggle" 
                  role="switch" 
                  aria-checked={contactConsent}
                  onClick={() => setContactConsent(!contactConsent)}
                />
                <span className="font-medium cursor-pointer" onClick={() => setContactConsent(!contactConsent)}>
                  Je souhaite être contacté
                </span>
              </div>

              {contactConsent && (
                <div className="animate-slide-up space-y-6 mb-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div 
                      className={`neo-card choice-card flex flex-col items-center justify-center p-4 ${contactMethod === 'phone' ? 'selected' : ''}`}
                      onClick={() => setContactMethod('phone')}
                    >
                      <Phone className={`mb-2 ${contactMethod === 'phone' ? 'text-accent-1' : 'text-muted'}`} size={24} />
                      <span className="font-semibold text-sm">WhatsApp / Téléphone</span>
                    </div>
                    <div 
                      className={`neo-card choice-card flex flex-col items-center justify-center p-4 ${contactMethod === 'email' ? 'selected' : ''}`}
                      onClick={() => setContactMethod('email')}
                    >
                      <Mail className={`mb-2 ${contactMethod === 'email' ? 'text-accent-1' : 'text-muted'}`} size={24} />
                      <span className="font-semibold text-sm">Email</span>
                    </div>
                  </div>

                  {contactMethod === 'phone' && (
                    <div className="flex gap-2 animate-slide-up">
                      <select 
                        className="neo-input w-32" 
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                      >
                        <option value="+33">🇫🇷 +33</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                        <option value="+32">🇧🇪 +32</option>
                        <option value="+41">🇨🇭 +41</option>
                      </select>
                      <input 
                        type="tel" 
                        className="neo-input flex-1" 
                        placeholder="6 12 34 56 78"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                      />
                    </div>
                  )}

                  {contactMethod === 'email' && (
                    <div className="animate-slide-up">
                      <input 
                        type="email" 
                        className="neo-input w-full" 
                        placeholder="votre@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  )}

                  {contactMethod && (
                    <label className="flex items-start gap-3 cursor-pointer mt-4">
                      <input 
                        type="checkbox" 
                        className="mt-1 w-5 h-5 accent-accent-1"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                      />
                      <span className="text-sm text-muted">
                        J'accepte d'être contacté uniquement au sujet de ce produit. Mes données ne seront pas partagées.
                      </span>
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-8">
                <button className="neo-btn" onClick={prevStep} disabled={isSubmitting}>
                  <ChevronLeft size={20} /> Précédent
                </button>
                <button 
                  className="neo-btn neo-btn-primary" 
                  disabled={!isStep3Valid || isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? 'Envoi...' : 'Soumettre mon idée'}
                  {!isSubmitting && <Check size={20} />}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
