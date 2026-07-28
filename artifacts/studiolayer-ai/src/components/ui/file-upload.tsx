import { useRef, useState } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (url: string) => void;
  accept?: string;
  className?: string;
  disabled?: boolean;
}

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
    // Reset input so the same file can be re-selected
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
        /* ── Uploaded state: thumbnail + filename ── */
        <div className="relative group">
          <img
            src={preview}
            alt="Garment preview"
            className="w-full h-52 object-contain bg-white"
          />
          {/* Filename strip */}
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
        /* ── Empty state: drop zone ── */
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <div className="w-10 h-10 rounded border border-border bg-muted flex items-center justify-center mb-4">
            <Upload className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            Upload Clothing Photo
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            Flat-lay or mannequin · Drag & drop or click
          </p>
        </div>
      )}
    </div>
  );
}
