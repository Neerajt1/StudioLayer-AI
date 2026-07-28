import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

const steps = [
  {
    emoji: '📷',
    title: '1. Upload Fabric Asset',
    description:
      'Drop a high-resolution flat-lay or mannequin photo of your apparel item.',
  },
  {
    emoji: '🌍',
    title: '2. Configure Persona & Studio',
    description:
      'Select your target model ethnicity, body type, and premium location environment background.',
  },
  {
    emoji: '✨',
    title: '3. Render High-End Catalog Asset',
    description:
      'Click Render and watch your fabric layer seamlessly morph onto a living human model.',
  },
];

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-lg p-8 shadow-2xl">
        {/* Step indicators */}
        <div className="flex gap-2 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{current.emoji}</div>
          <h2 className="font-serif text-2xl font-semibold text-foreground mb-3">
            {current.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {current.description}
          </p>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-muted-foreground font-mono mb-6">
          Step {step + 1} of {steps.length}
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
            <Button
              className="flex-1"
              onClick={() => setStep((s) => s + 1)}
            >
              Next →
            </Button>
          ) : (
            <Button
              className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={onComplete}
            >
              Get Started ➔
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
