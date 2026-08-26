// ---------------------------------------------------------------------------
// StudioLayer AI — Authenticated Page Hero (single source of truth)
//
// Every authenticated page must use EditorialPageHeader. The large word is
// always "Studio"; companion is the page chapter only (Workspace, Talent, …).
// Do not duplicate this layout or pass "Studio" in the companion prop.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Allowed companion chapter words — never include "Studio" prefix. */
export type EditorialPageCompanion =
  | 'Workspace'
  | 'Talent'
  | 'Gallery'
  | 'Profile'
  | 'Membership'
  | 'Admin';

export interface EditorialPageHeaderProps {
  /** Companion chapter word — baseline-aligned with fixed "Studio" hero */
  companion: EditorialPageCompanion;
  /** Descriptor — EB Garamond */
  supporting?: string;
  /** Supporting sentence — EB Garamond */
  tagline?: string;
  /** Optional right-column content (e.g. Membership summary card) */
  aside?: ReactNode;
  className?: string;
  id?: string;
}

export function EditorialPageHeader({
  companion,
  supporting,
  tagline,
  aside,
  className,
  id,
}: EditorialPageHeaderProps) {
  return (
    <header
      id={id}
      className={cn(
        'sl-page-header',
        aside != null && 'sl-page-header-with-aside',
        className,
      )}
    >
      <div className="sl-page-header-main">
        <h1 className="sl-page-header-title-block">
          <span className="sl-hero-display">Studio</span>
          <span className="sl-companion-inline">{companion}</span>
        </h1>
        {(supporting || tagline) && (
          <div className="sl-page-header-descriptor-block">
            {supporting && <p className="sl-supporting">{supporting}</p>}
            {tagline && <p className="sl-tagline">{tagline}</p>}
          </div>
        )}
      </div>
      {aside != null && <div className="sl-page-header-aside">{aside}</div>}
    </header>
  );
}

/** @alias EditorialPageHeader — canonical authenticated page hero */
export const AuthenticatedPageHeader = EditorialPageHeader;
