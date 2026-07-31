// ---------------------------------------------------------------------------
// StudioLayer AI — Onboarding Wizard (SL-018 updated)
//
// Updated step descriptions to match the new 3-step workflow:
//   1. Upload your outfit photo
//   2. Choose your model
//   3. Add a creative brief (optional) → Create Photoshoot
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

const steps = [
  {
    emoji: '👗',
    title: 'Upload Your Outfit',
    description:
      'Drop a clear photo of your garment — flat-lay, hanger, or mannequin shot against a plain background works best.',
  },
  {
    emoji: '🧍',
    title: 'Choose Your Model',
    description:
      'Browse our curated model gallery and select the perfect fit for your brand. We handle everything else automatically.',
  },
  {
    emoji: '✨',
    title: 'Create Your Photoshoot',
    description:
      'Optionally describe the look you have in mind, then hit Create Photoshoot. Professional editorial images in minutes.',
  },
];

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-lg p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Progress bars */}
        <div className="flex gap-1.5 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-foreground' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{current.emoji}</div>
          <h2
            className="text-2xl font-semibold text-foreground mb-3"
          >
            {current.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {current.description}
          </p>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-muted-foreground font-mono mb-6">
          {step + 1} of {steps.length}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          {step > 0 ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
          ) : (
            onSkip && (
              <Button
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={onSkip}
              >
                Skip
              </Button>
            )
          )}

          {step < steps.length - 1 ? (
            <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
              Next →
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={onComplete}
            >
              Get Started →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
