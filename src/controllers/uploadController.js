const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// Configure Cloudinary (env vars are loaded once in server.js)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer Storage with Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'locavo_verifications',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    public_id: (req, file) => `${Date.now()}-${path.parse(file.originalname).name}`,
  },
});

// 10 MB file size limit enforced at network level (before reaching Cloudinary)
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// @desc    Upload an image/document
// @route   POST /api/v1/upload
// @access  Private
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a file' });
    }

    res.status(200).json({
      success: true,
      url: req.file.path, // Cloudinary secure URL
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'File upload failed' });
  }
};

module.exports = { upload, uploadFile };
