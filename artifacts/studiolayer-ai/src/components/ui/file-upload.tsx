import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
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

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      onFileSelect(reader.result as string);
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
  };

  return (
    <div
      className={cn(
        'border-2 border-dashed border-border rounded bg-card transition-colors cursor-pointer',
        isDragging && 'border-accent bg-accent/5',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
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
      <div className="flex flex-col items-center justify-center py-12 px-6">
        <Upload className="w-10 h-10 text-muted-foreground mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">
          Upload Clothing Photo
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          Flat-lay or Mannequin • Drag & drop or click
        </p>
      </div>
    </div>
  );
}
