const Product = require('../models/Product');

// @desc    Get all products
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Private
const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).lean();
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Producto no encontrado' });
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
            image,
            type,
            sizes
        } = req.body;

        // ─── Explicit validation (returns 400 instead of 500 on bad data) ───
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'El nombre del producto es obligatorio' });
        }
        if (!sku || !sku.trim()) {
            return res.status(400).json({ message: 'El SKU es obligatorio' });
        }
        if (!category || !category.trim()) {
            return res.status(400).json({ message: 'La categoría es obligatoria. Por favor selecciona o crea una categoría.' });
        }
        if (!type || !['hogar', 'calzado'].includes(type)) {
            return res.status(400).json({ message: 'El tipo de producto debe ser "hogar" o "calzado"' });
        }

        const productExists = await Product.findOne({ sku: sku.trim() });
        if (productExists) {
            return res.status(400).json({ message: `Ya existe un producto con el SKU "${sku}". Por favor usa un SKU diferente.` });
        }

        const product = new Product({
            name: name.trim(),
            sku: sku.trim(),
            category: category.trim(),
            distributor: distributor?.trim() || '',
            costPrice: Number(costPrice) || 0,
            publicPrice: Number(publicPrice) || 0,
            stock: Number(stock) || 0,
            minStock: Number(minStock) || 5,
            image: image || '',
            type,
            sizes: sizes || []
        });

        const createdProduct = await product.save();
        res.status(201).json(createdProduct);

    } catch (error) {
        console.error("Error creating product:", error);
        // Handle Mongoose validation errors specifically
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: messages.join('. ') });
        }
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
            image,
            type,
            sizes
        } = req.body;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        // Only update fields that are provided
        if (name !== undefined) product.name = name;
        if (sku !== undefined) product.sku = sku;
        if (category !== undefined) product.category = category;
        if (distributor !== undefined) product.distributor = distributor;
        if (costPrice !== undefined) product.costPrice = Number(costPrice);
        if (publicPrice !== undefined) product.publicPrice = Number(publicPrice);
        if (stock !== undefined) product.stock = Number(stock);
        if (minStock !== undefined) product.minStock = Number(minStock);
        if (status !== undefined) product.status = status;
        if (image !== undefined) product.image = image;
        if (type !== undefined) product.type = type;
        if (sizes !== undefined) product.sizes = sizes;

        const updatedProduct = await product.save();
        res.json(updatedProduct);

    } catch (error) {
        console.error("Error updating product:", error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ message: messages.join('. ') });
        }
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
            await product.deleteOne();
            res.json({ message: 'Producto eliminado' });
        } else {
            res.status(404).json({ message: 'Producto no encontrado' });
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
