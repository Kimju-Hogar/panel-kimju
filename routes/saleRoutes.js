const express = require('express');
const router = express.Router();
const { createSale, getSales, getSalesByProduct, updateSale, deleteSale } = require('../controllers/saleController');
// const { protect } = require('../middleware/authMiddleware'); // TODO: Add middleware

router.route('/')
    .post(createSale)
    .get(getSales);

router.get('/by-product', getSalesByProduct);

router.route('/:id')
    .put(updateSale)
    .delete(deleteSale);

module.exports = router;
