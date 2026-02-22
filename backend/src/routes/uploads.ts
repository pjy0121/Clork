import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { settingsOps } from '../database';

const router = express.Router();

// Create temp directory for uploads
const TEMP_DIR = path.join(__dirname, '..', '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Configure multer for memory storage (we'll save files manually with custom naming)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get current image counter
function getNextImageNumber(): number {
  const result = settingsOps.get.get('imageCounter');
  const current = result ? parseInt(result.value) : 0;
  const next = current + 1;
  settingsOps.set.run('imageCounter', next.toString());
  return current;
}

// Upload single image
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get next image number
    const imageNumber = getNextImageNumber();
    const imageName = `Image #${imageNumber}`;

    // Determine file extension from mimetype
    const ext = req.file.mimetype.split('/')[1];
    const fileName = `image_${imageNumber}.${ext}`;
    const filePath = path.join(TEMP_DIR, fileName);

    // Save file
    fs.writeFileSync(filePath, req.file.buffer);

    // Return image info
    res.json({
      success: true,
      image: {
        name: imageName,
        path: filePath,
        number: imageNumber,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Delete uploaded image
router.delete('/delete/:imageNumber', (req, res) => {
  try {
    const imageNumber = parseInt(req.params.imageNumber);
    if (isNaN(imageNumber)) {
      return res.status(400).json({ error: 'Invalid image number' });
    }

    // Try to delete files with different extensions
    const extensions = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp'];
    let deleted = false;

    for (const ext of extensions) {
      const fileName = `image_${imageNumber}.${ext}`;
      const filePath = path.join(TEMP_DIR, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
        break;
      }
    }

    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Image not found' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Serve uploaded images
router.get('/image/:imageNumber', (req, res) => {
  try {
    const imageNumber = parseInt(req.params.imageNumber);
    if (isNaN(imageNumber)) {
      return res.status(400).json({ error: 'Invalid image number' });
    }

    // Try to find the file with different extensions
    const extensions = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp'];

    for (const ext of extensions) {
      const fileName = `image_${imageNumber}.${ext}`;
      const filePath = path.join(TEMP_DIR, fileName);
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }
    }

    res.status(404).json({ error: 'Image not found' });
  } catch (error) {
    console.error('Serve error:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

export default router;