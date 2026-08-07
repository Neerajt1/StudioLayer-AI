// ---------------------------------------------------------------------------
// StudioLayer AI — Selected Talent Summary (Studio Workspace)
// ---------------------------------------------------------------------------

import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import type { ModelIdentity } from '@/components/studio/talent/types';
import { ModelImageFrame } from '@/components/studio/talent/model-image-frame';
import { markCastingScrollToHeader } from '@/lib/casting-navigation';
import { StudioWorkspaceButton } from '@/components/studio/studio-workspace-controls';

interface SelectedTalentSummaryProps {
  talent: ModelIdentity | null;
  disabled?: boolean;
  className?: string;
}

function TalentCtaLink({
  href,
  label,
  disabled,
}: {
  href: string;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <StudioWorkspaceButton className="h-9 w-fit px-3.5 text-sm" disabled>
        {label}
      </StudioWorkspaceButton>
    );
  }

  return (
    <Link
      href={href}
      onClick={() => markCastingScrollToHeader()}
      className="sl-studio-btn h-9 w-fit px-3.5 text-sm no-underline"
    >
      {label}
    </Link>
  );
}

export function SelectedTalentSummary({
  talent,
  disabled,
  className,
}: SelectedTalentSummaryProps) {
  if (!talent) {
    return (
      <div className={cn('space-y-3', className)}>
        <p className="text-sm text-muted-foreground">No Studio Talent selected</p>
        <TalentCtaLink href="/casting" label="Choose Studio Talent" disabled={disabled} />
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-8 md:gap-10 lg:gap-12', className)}>
      <div className="shrink-0 [--summary-portrait-h:200px] md:[--summary-portrait-h:240px] lg:[--summary-portrait-h:290px]">
        <ModelImageFrame
          src={talent.imageUrl}
          alt={talent.displayName}
          interactive={false}
          portraitMaxHeight="var(--summary-portrait-h)"
        />
      </div>
      <div className="min-w-0 space-y-3">
        <p className="truncate text-[20px] font-medium leading-snug text-[#2D2D2D]">
          {talent.displayName}
        </p>
        <TalentCtaLink href="/casting" label="Change Studio Talent" disabled={disabled} />
      </div>
    </div>
  );
}
