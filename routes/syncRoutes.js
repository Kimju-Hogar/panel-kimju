const express = require('express');
const router = express.Router();
const { receiveWebSale } = require('../controllers/syncController');

// Route to receive sales data from websites
router.post('/sales', receiveWebSale);

module.exports = router;
