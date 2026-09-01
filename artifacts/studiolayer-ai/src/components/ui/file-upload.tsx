// ---------------------------------------------------------------------------
// StudioLayer AI — FileUpload Component (SL-018 improved)
//
// Preview is controlled by `previewUrl` from the Studio workflow object.
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react';
import { X, ImageIcon, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  /** Controlled preview — must match the corresponding workflow image URL */
  previewUrl?: string | null;
  onFileSelect: (url: string) => void;
  accept?: string;
  className?: string;
  disabled?: boolean;
  /** Accessible name for the upload zone */
  ariaLabel?: string;
  /** Empty-state CTA label */
  uploadLabel?: string;
  /** Preview alt text */
  previewAlt?: string;
  /** Show the ideal-garment reference guidance (front upload only) */
  showIdealReference?: boolean;
  /** Compact empty/preview layout for optional secondary references */
  compact?: boolean;
  /** Olive action fill for required uploads; neutral for optional ones */
  emphasis?: 'primary' | 'secondary';
  /** Optional data-testid prefix for zone + input */
  testId?: string;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const REFERENCE_IMAGE = '/images/ideal-garment-reference.webp';

export function FileUpload({
  previewUrl = null,
  onFileSelect,
  accept = 'image/*',
  className,
  disabled,
  ariaLabel = 'Upload garment image',
  uploadLabel = 'Upload Garment Photo',
  previewAlt = 'Garment preview',
  showIdealReference = true,
  compact = false,
  emphasis = 'primary',
  testId = 'file-upload',
}: FileUploadProps) {
  const ctaClass =
    emphasis === 'primary'
      ? 'sl-action-primary'
      : 'sl-control rounded-[3px] border border-border bg-white text-foreground';
  const inputRef   = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const [fileName,   setFileName]     = useState<string | null>(null);
  const [sizeError,  setSizeError]    = useState<string | null>(null);

  const handleFile = (file: File) => {
    setSizeError(null);
    if (file.size > MAX_FILE_BYTES) {
      setSizeError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 20 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setFileName(file.name);
      onFileSelect(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFileName(null);
    setSizeError(null);
    onFileSelect('');
  };

  const triggerInput = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!previewUrl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      triggerInput();
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        className={cn(
          'border border-dashed rounded bg-card transition-all duration-200 cursor-pointer overflow-hidden',
          'border-border',
          isDragging && 'border-foreground bg-muted scale-[1.01] shadow-md',
          disabled && 'opacity-50 cursor-not-allowed',
          previewUrl && 'border-border border-solid',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={previewUrl ? undefined : triggerInput}
        onKeyDown={handleKeyDown}
        data-testid={`${testId}-zone`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
          data-testid={`${testId}-input`}
        />

        {previewUrl ? (
          <div className="relative group animate-in fade-in duration-300">
            <img
              src={previewUrl}
              alt={previewAlt}
              className={cn(
                'w-full object-contain bg-white',
                compact ? 'h-36' : 'h-52',
              )}
            />
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-card">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span
                  className="text-xs text-foreground font-mono truncate"
                  title={fileName ?? 'Garment photo'}
                >
                  {fileName ?? 'Garment photo'}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={triggerInput}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
                  disabled={disabled}
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  disabled={disabled}
                  aria-label="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : showIdealReference ? (
          <div className="flex flex-col items-center px-4 py-7 gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <p
                className="text-muted-foreground font-mono self-center mb-1"
                style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Ideal garment photo
              </p>
              <div
                className="overflow-hidden rounded border border-border bg-white p-1.5"
                style={{ width: 160, height: 160 }}
              >
                <img
                  src={REFERENCE_IMAGE}
                  alt="Luxury garment on hanger — plain white background"
                  className="h-full w-full object-contain"
                  width={1024}
                  height={1024}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground font-mono">
                Plain background · Hanger or Flat-lay · Entire garment visible
              </p>
            </div>

            <div className="text-center">
              <div
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium',
                  ctaClass,
                  isDragging && 'sl-action-primary--dragging',
                )}
              >
                <Upload className="w-4 h-4 shrink-0" />
                {isDragging ? 'Drop to upload' : uploadLabel}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground font-mono">
                or drag &amp; drop · JPG, PNG, WEBP · max 20 MB
              </p>
            </div>
          </div>
        ) : (
          <div className={cn(
            'flex flex-col items-center justify-center gap-2 text-center',
            compact ? 'px-3 py-5' : 'px-4 py-7',
          )}>
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded font-medium',
                ctaClass,
                compact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
                isDragging && 'sl-action-primary--dragging',
              )}
            >
              <Upload className={cn('shrink-0', compact ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
              {isDragging ? 'Drop to upload' : uploadLabel}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              JPG, PNG, WEBP · max 20 MB
            </p>
          </div>
        )}
      </div>

      {sizeError && (
        <p className="text-xs text-destructive font-mono mt-0.5">{sizeError}</p>
      )}
    </div>
  );
}
