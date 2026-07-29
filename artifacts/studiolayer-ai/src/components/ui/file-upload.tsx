import { useRef, useState } from 'react';
import { X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (url: string) => void;
  accept?: string;
  className?: string;
  disabled?: boolean;
}

// Photographic reference images — plain-wall hanger shots from Unsplash (free to use)
const REFERENCE_PHOTOS = [
  {
    label: 'Male Example',
    sublabel: 'Jacket on hanger',
    url: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?w=300&q=80&fit=crop&crop=center',
  },
  {
    label: 'Female Example',
    sublabel: 'Dress on hanger',
    url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&q=80&fit=crop&crop=center',
  },
];

export function FileUpload({
  onFileSelect,
  accept = 'image/*',
  className,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (file: File) => {
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
    onFileSelect('');
  };

  const triggerInput = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      className={cn(
        'border border-dashed border-border rounded bg-card transition-colors cursor-pointer overflow-hidden',
        isDragging && 'border-foreground bg-muted',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={preview ? undefined : triggerInput}
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
        /* ── Uploaded state: thumbnail + filename strip ── */
        <div className="relative group">
          <img
            src={preview}
            alt="Garment preview"
            className="w-full h-52 object-contain bg-white"
          />
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
            <div className="flex items-center gap-2 shrink-0">
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
        /* ── Empty state: photographic reference standards + CTA ── */
        <div className="flex flex-col items-center py-5 px-4">
          {/* Reference header */}
          <p
            className="text-muted-foreground font-mono mb-3 self-start"
            style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            Studio Reference Standards
          </p>

          {/* Photographic reference thumbnails */}
          <div className="flex gap-3 mb-5 w-full justify-center">
            {REFERENCE_PHOTOS.map((photo) => (
              <div key={photo.label} className="flex flex-col items-center gap-1.5 flex-1 max-w-[110px]">
                <div className="w-full overflow-hidden rounded border border-border bg-muted" style={{ aspectRatio: '3/4' }}>
                  <img
                    src={photo.url}
                    alt={photo.label}
                    className="w-full h-full object-cover"
                    draggable={false}
                    onError={(e) => {
                      // Graceful fallback: show a plain bg if image fails to load
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-foreground font-medium" style={{ fontSize: '10px' }}>
                    {photo.label}
                  </p>
                  <p className="text-muted-foreground font-mono" style={{ fontSize: '9px' }}>
                    {photo.sublabel}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Upload CTA */}
          <p className="text-sm font-medium text-foreground mb-1">
            📁 Drag &amp; Drop or Click to Upload Garment
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            Flat-lay or hanger · Plain background recommended
          </p>
        </div>
      )}
    </div>
  );
}
