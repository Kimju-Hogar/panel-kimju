const Sale = require('../models/Sale');
const Product = require('../models/Product');

// @desc    Register a new sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
    try {
        const { products: saleProducts, paymentMethod, channel, customer } = req.body;

        if (!saleProducts || saleProducts.length === 0) {
            return res.status(400).json({ message: 'La venta debe tener al menos un producto' });
        }
        if (!paymentMethod) {
            return res.status(400).json({ message: 'El método de pago es obligatorio' });
        }
        if (!channel) {
            return res.status(400).json({ message: 'El canal de venta es obligatorio' });
        }

        // ─── Phase 1: Load all products in PARALLEL ──────────────────────────
        const productIds = saleProducts.map(item => item.product);
        const dbProducts = await Product.find({ _id: { $in: productIds } });
        const productMap = new Map(dbProducts.map(p => [p._id.toString(), p]));

        let totalAmount = 0;
        let totalProfit = 0;
        const processedProducts = [];

        // ─── Phase 2: Validate stock and calculate totals (no DB writes yet) ─
        for (const item of saleProducts) {
            const product = productMap.get(item.product.toString());

            if (!product) {
                return res.status(404).json({ message: `Producto no encontrado: ${item.product}` });
            }

            if (item.selectedSize && product.type === 'calzado' && product.sizes?.length > 0) {
                const sizeEntry = product.sizes.find(s => s.size === item.selectedSize);
                if (!sizeEntry) {
                    return res.status(400).json({ message: `Talla ${item.selectedSize} no encontrada para: ${product.name}` });
                }
                if (sizeEntry.stock < item.quantity) {
                    return res.status(400).json({ message: `Stock insuficiente para talla ${item.selectedSize} de: ${product.name}` });
                }
                // Deduct from size (in-memory, will save later)
                sizeEntry.stock -= item.quantity;
            } else {
                if (product.stock < item.quantity) {
                    return res.status(400).json({ message: `Stock insuficiente para: ${product.name}` });
                }
                product.stock -= item.quantity;
            }

            const subtotal = item.unitPrice * item.quantity;
            const itemProfit = (item.unitPrice - product.costPrice) * item.quantity;

            totalAmount += subtotal;
            totalProfit += itemProfit;

            processedProducts.push({
                product: product._id,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost: product.costPrice,
                subtotal,
                selectedSize: item.selectedSize || undefined
            });
        }

        // ─── Phase 3: Save all stock updates IN PARALLEL + create sale ────────
        const saveProductsPromise = Promise.all(dbProducts.map(p => p.save()));

        const sale = new Sale({
            products: processedProducts,
            totalAmount,
            totalProfit,
            paymentMethod,
            channel,
            customer,
            createdBy: req.user ? req.user._id : null
        });

        const [, createdSale] = await Promise.all([saveProductsPromise, sale.save()]);

        res.status(201).json(createdSale);

    } catch (error) {
        console.error("Error creating sale:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
    try {
        const { startDate, endDate, paymentMethod, channel, type } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        if (paymentMethod) query.paymentMethod = paymentMethod;
        if (channel) query.channel = channel;
        if (req.query.productId) {
            query["products.product"] = req.query.productId;
        }

        if (type && type !== 'all') {
            const products = await Product.find({ type }).select('_id').lean();
            const productIds = products.map(p => p._id);
            query["products.product"] = { $in: productIds };
        }

        const sales = await Sale.find(query)
            .populate('products.product', 'name sku image type')
            .populate('createdBy', 'name')
            .sort({ date: -1 })
            .lean();

        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get sales aggregated by product (for reports)
// @route   GET /api/sales/by-product
// @access  Private
const getSalesByProduct = async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        let matchStage = {};

        if (startDate || endDate) {
            matchStage.date = {};
            if (startDate) matchStage.date.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                matchStage.date.$lte = end;
            }
        }

        const pipeline = [
            { $match: matchStage },
            { $unwind: "$products" },
            { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
            { $unwind: "$productDetails" },
            ...(type && type !== 'all' ? [{ $match: { "productDetails.type": type } }] : []),
            {
                $group: {
                    _id: "$productDetails._id",
                    productName: { $first: "$productDetails.name" },
                    sku: { $first: "$productDetails.sku" },
                    image: { $first: "$productDetails.image" },
                    lastSaleDate: { $max: "$date" },
                    totalQuantity: { $sum: "$products.quantity" },
                    totalRevenue: { $sum: "$products.subtotal" },
                    totalProfit: { $sum: { $subtract: ["$products.subtotal", { $multiply: ["$products.quantity", "$products.unitCost"] }] } }
                }
            },
            { $sort: { totalRevenue: -1 } }
        ];

        const sales = await Sale.aggregate(pipeline);
        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a sale
// @route   PUT /api/sales/:id
// @access  Private
const updateSale = async (req, res) => {
    try {
        const { paymentMethod, channel, customer, products } = req.body;
        const sale = await Sale.findById(req.params.id);

        if (!sale) {
            return res.status(404).json({ message: 'Venta no encontrada' });
        }

        if (products && Array.isArray(products)) {
            // Restore original stock in parallel
            await Promise.all(
                sale.products.map(item =>
                    Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } })
                )
            );

            let newTotalAmount = 0;
            let newTotalProfit = 0;
            const processedProducts = [];

            for (const item of products) {
                const productId = item.product._id || item.product;
                const productDb = await Product.findById(productId);

                if (!productDb) throw new Error(`Producto no encontrado: ${productId}`);

                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);

                if (productDb.stock < quantity) {
                    throw new Error(`Stock insuficiente para: ${productDb.name}`);
                }

                const subtotal = unitPrice * quantity;
                const profit = (unitPrice - productDb.costPrice) * quantity;

                newTotalAmount += subtotal;
                newTotalProfit += profit;

                processedProducts.push({
                    product: productDb._id,
                    quantity,
                    unitPrice,
                    unitCost: productDb.costPrice,
                    subtotal
                });

                await Product.findByIdAndUpdate(productDb._id, { $inc: { stock: -quantity } });
            }

            sale.products = processedProducts;
            sale.totalAmount = newTotalAmount;
            sale.totalProfit = newTotalProfit;
        }

        if (paymentMethod) sale.paymentMethod = paymentMethod;
        if (channel) sale.channel = channel;
        if (customer) sale.customer = { ...sale.customer, ...customer };

        const updatedSale = await sale.save();
        res.json(updatedSale);
    } catch (error) {
        console.error("Sale update error:", error);
        res.status(500).json({ message: error.message || 'Error al actualizar venta' });
    }
};

// @desc    Delete a sale and restore stock
// @route   DELETE /api/sales/:id
// @access  Private
const deleteSale = async (req, res) => {
    try {
        const sale = await Sale.findById(req.params.id);

        if (!sale) {
            return res.status(404).json({ message: 'Venta no encontrada' });
        }

        // Restore stock for all products in parallel
        await Promise.all(
            sale.products.map(async (item) => {
                const product = await Product.findById(item.product);
                if (product) {
                    if (item.selectedSize && product.type === 'calzado' && product.sizes?.length > 0) {
                        const sizeEntry = product.sizes.find(s => s.size === item.selectedSize);
                        if (sizeEntry) sizeEntry.stock += item.quantity;
                    } else {
                        product.stock += item.quantity;
                    }
                    await product.save();
                }
            })
        );

        await sale.deleteOne();
        res.json({ message: 'Venta eliminada y stock restaurado' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createSale,
    getSales,
    getSalesByProduct,
    updateSale,
    deleteSale
};
