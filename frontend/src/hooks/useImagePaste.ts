import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Global counter for image naming
let imageCounter = 0;

export interface AttachedImage {
  id: string;          // UUID for React keys
  name: string;        // "Image #1", "Image #2", etc.
  data: string;        // base64 data URL
  file: File;          // Original file object
}

interface UseImagePasteReturn {
  images: AttachedImage[];
  onPaste: (e: React.ClipboardEvent) => void;
  addImage: (file: File) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;
}

export default function useImagePaste(): UseImagePasteReturn {
  const [images, setImages] = useState<AttachedImage[]>([]);

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await addImageFile(file);
        }
      }
    }
  };

  const addImageFile = async (file: File) => {
    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);

      const base64Data = await base64Promise;

      // Increment global counter
      imageCounter++;

      const newImage: AttachedImage = {
        id: uuidv4(),
        name: `Image #${imageCounter}`,
        data: base64Data,
        file: file,
      };

      setImages(prev => [...prev, newImage]);
    } catch (error) {
      console.error('Error processing image:', error);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const clearImages = () => {
    setImages([]);
  };

  return {
    images,
    onPaste: handlePaste,
    addImage: addImageFile,
    removeImage,
    clearImages,
  };
}