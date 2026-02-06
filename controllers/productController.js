const Product = require('../models/Product');

// @desc    Get all products
// @route   GET /api/products
// @access  Public (or Protected)
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
    try {
        const {
            name,
            sku,
            category,
            distributor,
            costPrice,
            publicPrice,
            stock,
            minStock,
            image
        } = req.body;

        const productExists = await Product.findOne({ sku });

        if (productExists) {
            return res.status(400).json({ message: 'Product with this SKU already exists' });
        }

        const product = new Product({
            name,
            sku,
            category,
            distributor,
            costPrice,
            publicPrice,
            stock,
            minStock,
            image
        });

        const createdProduct = await product.save();
        res.status(201).json(createdProduct);
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
    try {
        const {
            name,
            sku,
            category,
            distributor,
            costPrice,
            publicPrice,
            stock,
            minStock,
            status,
            image
        } = req.body;

        const product = await Product.findById(req.params.id);

        if (product) {
            product.name = name || product.name;
            product.sku = sku || product.sku;
            product.category = category || product.category;
            product.distributor = distributor || product.distributor;
            product.costPrice = costPrice !== undefined ? costPrice : product.costPrice;
            product.publicPrice = publicPrice !== undefined ? publicPrice : product.publicPrice;
            product.stock = stock !== undefined ? stock : product.stock;
            product.minStock = minStock !== undefined ? minStock : product.minStock;
            product.status = status || product.status;
            product.image = image || product.image;

            const updatedProduct = await product.save();
            res.json(updatedProduct);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (product) {
            await product.deleteOne(); // or remove() for older mongoose
            res.json({ message: 'Product removed' });
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};
