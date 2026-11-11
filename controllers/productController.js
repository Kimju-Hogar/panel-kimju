const Product = require('../models/Product');

// @desc    Get all products
// @route   GET /api/products
// @access  Private
const getProducts = async (req, res) => {
    try {
        const { lowStock } = req.query;
        let query = {};

        if (lowStock === 'true') {
            // Find products where stock is less than or equal to minStock
            // and status is active
            query = {
                status: 'active',
                $expr: { $lte: ["$stock", "$minStock"] }
            };
        }

        const products = await Product.find(query).lean();
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
            images,
            colors,
            type,
            sizes,
            description,
            discount
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
            images: Array.isArray(images) ? images : [],
            colors: Array.isArray(colors) ? colors : [],
            type,
            sizes: sizes || [],
            description: description || '',
            discount: Number(discount) || 0
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
            images,
            colors,
            type,
            sizes,
            description,
            discount
        } = req.body;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        // Un producto con tallas (calzado) o colores (hogar) recalcula su stock
        // global a partir de ellas al guardar. Cambiar solo `stock` no tenia
        // ningun efecto y el usuario creia que lo habia corregido.
        const tipoFinal = type !== undefined ? type : product.type;
        const variantesFinales = tipoFinal === 'calzado'
            ? (sizes !== undefined ? sizes : product.sizes)
            : (colors !== undefined ? colors : product.colors);
        const manejaPorVariante = Array.isArray(variantesFinales) && variantesFinales.length > 0;
        const traeVariantes = tipoFinal === 'calzado' ? sizes !== undefined : colors !== undefined;
        if (stock !== undefined && manejaPorVariante && !traeVariantes) {
            return res.status(400).json({
                message: `Este producto maneja el stock por ${tipoFinal === 'calzado' ? 'talla' : 'color'}: corrígelo desde el formulario del producto, en cada ${tipoFinal === 'calzado' ? 'talla' : 'color'}.`,
            });
        }

        // El formulario manda el updatedAt del producto tal como lo abrio. Si el
        // producto cambio despues (una venta descontó stock) y el formulario trae
        // stock o variantes, guardar pisaria ese descuento con los numeros viejos.
        const vistoEn = req.body.updatedAt ? new Date(req.body.updatedAt) : null;
        const tocaStock = stock !== undefined || colors !== undefined || sizes !== undefined;
        if (vistoEn && !isNaN(vistoEn) && tocaStock && product.updatedAt && product.updatedAt.getTime() > vistoEn.getTime() + 1000) {
            return res.status(409).json({
                message: 'El stock de este producto cambió mientras lo editabas (ventas recientes). Cierra el formulario, vuelve a abrirlo y repite el cambio.',
            });
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
        if (images !== undefined) product.images = Array.isArray(images) ? images : [];
        if (colors !== undefined) product.colors = Array.isArray(colors) ? colors : [];
        if (type !== undefined) product.type = type;
        if (sizes !== undefined) product.sizes = sizes;
        if (description !== undefined) product.description = description;
        if (discount !== undefined) product.discount = Number(discount);

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
