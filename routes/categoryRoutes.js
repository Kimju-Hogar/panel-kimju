const express = require('express');
const router = express.Router();
const { getCategories, createCategory, deleteCategory } = require('../controllers/categoryController');

router.route('/').get(getCategories).post(createCategory);
router.route('/:id').delete(deleteCategory);

module.exports = router;
