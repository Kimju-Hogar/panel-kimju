const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'kimju_products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1000, crop: "limit" }, { quality: "auto", fetch_format: "auto" }] // Automagically optimize
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// @desc    Upload single image
// @route   POST /api/upload
// @access  Public
router.post('/', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No se subió imagen' });
    res.json({ imagePath: req.file.path });
});

// @desc    Upload multiple images (up to 10)
// @route   POST /api/upload/multiple
// @access  Public
router.post('/multiple', upload.array('images', 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No se subieron imágenes' });
    }
    const imagePaths = req.files.map(f => f.path);
    res.json({ imagePaths });
});

module.exports = router;
