const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const { cacheMiddleware, clearCache } = require('./utils/cache');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan('dev'));

const path = require('path');

// Clear cache on any mutation globally
app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        clearCache();
    }
    next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', cacheMiddleware, require('./routes/productRoutes'));
app.use('/api/sales', cacheMiddleware, require('./routes/saleRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/categories', cacheMiddleware, require('./routes/categoryRoutes')); // Route registered
app.use('/api/dashboard', cacheMiddleware, require('./routes/dashboardRoutes')); // Dashboard routes
app.use('/api/sync', require('./routes/syncRoutes')); // Sync routes
app.use('/api/finance', cacheMiddleware, require('./routes/financeRoutes')); // Finance module routes

// Make uploads folder static
const fs = require('fs');
const uploadPath = process.env.UPLOAD_PATH || path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadPath)) {
    try {
        fs.mkdirSync(uploadPath, { recursive: true });
        console.log(`Created upload directory: ${uploadPath}`);
    } catch (err) {
        console.error(`Error creating upload directory: ${err.message}`);
    }
}

app.use('/uploads', express.static(uploadPath));

app.get('/', (req, res) => {
    res.send('API is running...');
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

module.exports = app;
