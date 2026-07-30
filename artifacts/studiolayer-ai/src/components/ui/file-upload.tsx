// ---------------------------------------------------------------------------
// StudioLayer AI — FileUpload Component (SL-018 improved)
//
// Improvements over the previous version:
//   - Richer drag-over visual: border thickens, background shifts, scale pulse
//   - File size validation (max 20 MB) with inline error message
//   - Smooth upload success transition with fade-in preview
//   - Cleaner empty-state copy focused on the user's goal
//   - Accessible: role="button" + keyboard trigger
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react';
import { X, ImageIcon, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (url: string) => void;
  accept?: string;
  className?: string;
  disabled?: boolean;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

// Single authoritative reference showing ideal garment photography standard
const REFERENCE_IMAGE =
  'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&q=80&fit=crop&crop=center';

export function FileUpload({
  onFileSelect,
  accept = 'image/*',
  className,
  disabled,
}: FileUploadProps) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging]   = useState(false);
  const [preview,    setPreview]      = useState<string | null>(null);
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
      setPreview(result);
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
    setPreview(null);
    setFileName(null);
    setSizeError(null);
    onFileSelect('');
  };

  const triggerInput = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!preview && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      triggerInput();
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload garment image"
        className={cn(
          'border border-dashed rounded bg-card transition-all duration-200 cursor-pointer overflow-hidden',
          // Default
          'border-border',
          // Drag active — stronger border + tinted background
          isDragging && 'border-foreground bg-muted scale-[1.01] shadow-md',
          // Disabled
          disabled && 'opacity-50 cursor-not-allowed',
          // Has preview — switch to solid border
          preview && 'border-border border-solid',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={preview ? undefined : triggerInput}
        onKeyDown={handleKeyDown}
        data-testid="file-upload-zone"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
          data-testid="file-upload-input"
        />

        {preview ? (
          /* ── Uploaded state ── */
          <div className="relative group animate-in fade-in duration-300">
            <img
              src={preview}
              alt="Garment preview"
              className="w-full h-52 object-contain bg-white"
            />
            {/* File info + actions */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-card">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span
                  className="text-xs text-foreground font-mono truncate"
                  title={fileName ?? ''}
                >
                  {fileName}
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
        ) : (
          /* ── Empty / drag state ── */
          <div className="flex flex-col items-center py-6 px-4 gap-4">
            {/* Reference photo */}
            <div className="flex flex-col items-center gap-1.5">
              <p
                className="text-muted-foreground font-mono self-center mb-1"
                style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Ideal upload standard
              </p>
              <div
                className="overflow-hidden rounded border border-border bg-muted"
                style={{ width: 80, aspectRatio: '3/4' }}
              >
                <img
                  src={REFERENCE_IMAGE}
                  alt="Garment on hanger — plain background"
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground font-mono">
                Hanger or flat-lay · plain background
              </p>
            </div>

            {/* Upload CTA */}
            <div className="text-center">
              <div
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded border border-border bg-background text-sm font-medium text-foreground transition-all duration-150',
                  !disabled && 'hover:bg-muted hover:border-foreground/30',
                  isDragging && 'bg-muted border-foreground',
                )}
              >
                <Upload className="w-4 h-4 shrink-0" />
                {isDragging ? 'Drop to upload' : 'Upload Garment Photo'}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground font-mono">
                or drag &amp; drop · JPG, PNG, WEBP · max 20 MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File size validation error */}
      {sizeError && (
        <p className="text-xs text-destructive font-mono mt-0.5">{sizeError}</p>
      )}
    </div>
  );
}
