import { useState, useEffect, useCallback } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface UploadedImage {
  name: string;
  path: string;
  number: number;
  size: number;
  mimetype: string;
  previewUrl?: string;
}

interface ImageUploadProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  className?: string;
}

export default function ImageUpload({
  images,
  onImagesChange,
  maxImages = 5,
  className = '',
}: ImageUploadProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle paste event
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    // Check max images limit
    if (images.length >= maxImages) {
      setError(t('images.maxImagesError', { max: maxImages }));
      return;
    }

    event.preventDefault();
    setError(null);
    setUploading(true);

    try {
      const uploadPromises = imageItems.map(async (item) => {
        const file = item.getAsFile();
        if (!file) return null;

        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('http://localhost:3001/api/uploads/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const data = await response.json();
        return {
          ...data.image,
          previewUrl: `http://localhost:3001/api/uploads/image/${data.image.number}`
        };
      });

      const results = await Promise.all(uploadPromises);
      const newImages = results.filter((img): img is UploadedImage => img !== null);

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages].slice(0, maxImages));
      }
    } catch (err) {
      setError(t('images.uploadError'));
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [images, onImagesChange, maxImages, t]);

  // Add paste event listener
  useEffect(() => {
    const handlePasteWrapper = (e: Event) => handlePaste(e as ClipboardEvent);
    document.addEventListener('paste', handlePasteWrapper);
    return () => document.removeEventListener('paste', handlePasteWrapper);
  }, [handlePaste]);

  // Handle image removal
  const handleRemove = async (image: UploadedImage) => {
    try {
      await fetch(`http://localhost:3001/api/uploads/delete/${image.number}`, {
        method: 'DELETE',
      });
      onImagesChange(images.filter(img => img.number !== image.number));
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className={className}>
      {error && (
        <div className="text-xs text-red-500 mb-2">
          {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="space-y-2 mb-3">
          <label className="label text-xs">{t('images.uploadedImages')}</label>
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <div
                key={image.number}
                className="relative group rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <img
                  src={image.previewUrl}
                  alt={image.name}
                  className="w-20 h-20 object-cover"
                  onError={(e) => {
                    // Fallback if image fails to load
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => handleRemove(image)}
                    className="p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 text-center">
                  {image.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
        <ImageIcon size={12} />
        {uploading ? t('images.uploading') : t('images.pasteHint', { max: maxImages })}
      </div>
    </div>
  );
}