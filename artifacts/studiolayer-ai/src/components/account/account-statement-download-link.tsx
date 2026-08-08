import { useState } from 'react';
import { apiUrl } from '@/lib/api-base-url';
import { cn } from '@/lib/utils';
import { STUDIO_ERROR_CONTACT_HELPER } from '@/lib/studio-contact';
import { formatDownloadPreparingLabel } from '@/lib/download-preparing-label';
import { useDownloadInFlight } from '@/hooks/use-download-in-flight';
import { useStudioPressFeedback } from '@/components/studio/studio-workspace-controls';

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }
  const plainMatch = header.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface AccountStatementDownloadLinkProps {
  className?: string;
  /** Header placement uses compact uppercase styling; section uses profile body styling. */
  variant?: 'header' | 'section';
}

export function AccountStatementDownloadLink({
  className,
  variant = 'section',
}: AccountStatementDownloadLinkProps) {
  const { inFlight, elapsedSec, run } = useDownloadInFlight();
  const { pressed, pressHandlers } = useStudioPressFeedback(inFlight);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = () => {
    void run(async () => {
      setError(null);

      try {
        const response = await fetch(apiUrl('/api/account/statement/download'), {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Unable to download account statement.');
        }

        const blob = await response.blob();
        const filename =
          parseContentDispositionFilename(response.headers.get('Content-Disposition')) ??
          'Studio Account Statement.xlsx';

        downloadBlob(blob, filename);
      } catch (downloadError) {
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : 'Unable to download account statement.',
        );
      }
    });
  };

  return (
    <div
      className={cn(
        'sl-account-statement-download',
        variant === 'header' && 'sl-account-statement-download--header',
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          'sl-account-statement-link',
          pressed && 'is-pressed',
          inFlight && 'is-loading',
        )}
        onClick={handleDownload}
        disabled={inFlight}
        aria-busy={inFlight || undefined}
        {...pressHandlers}
      >
        {inFlight ? (
          <>
            <span className="sl-account-statement-link-spinner" aria-hidden />
            {formatDownloadPreparingLabel(elapsedSec)}
          </>
        ) : (
          'Download Studio Account Statement'
        )}
      </button>
      {error && (
        <div className="sl-account-statement-error-wrap" role="alert">
          <p className="sl-account-statement-error">{error}</p>
          <p className="sl-account-statement-error-helper">
            {STUDIO_ERROR_CONTACT_HELPER}
          </p>
        </div>
      )}
    </div>
  );
}
