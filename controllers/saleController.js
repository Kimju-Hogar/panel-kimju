const Sale = require('../models/Sale');
const Product = require('../models/Product');

// @desc    Register a new sale
// @route   POST /api/sales
// @access  Private
const createSale = async (req, res) => {
    try {
        const {
            products: saleProducts,
            paymentMethod,
            channel,
            customer
        } = req.body;

        let totalAmount = 0;
        let totalProfit = 0;
        const processedProducts = [];

        // Validate products and stock, calculate totals
        for (const item of saleProducts) {
            const product = await Product.findById(item.product);

            if (!product) {
                return res.status(404).json({ message: `Product not found: ${item.product}` });
            }

            if (product.stock < item.quantity) {
                return res.status(400).json({ message: `Insufficient stock for product: ${product.name}` });
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
                subtotal
            });

            // Deduct Stock
            product.stock -= item.quantity;
            await product.save();
        }

        const sale = new Sale({
            products: processedProducts,
            totalAmount,
            totalProfit,
            paymentMethod,
            channel,
            customer,
            createdBy: req.user ? req.user._id : null // Assuming auth middleware populates req.user
        });

        const createdSale = await sale.save();
        res.status(201).json(createdSale);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = async (req, res) => {
    try {
        const { startDate, endDate, paymentMethod, channel } = req.query;
        let query = {};

        // Date Filter
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        // Exact Match Filters
        if (paymentMethod) query.paymentMethod = paymentMethod;
        if (channel) query.channel = channel;
        if (req.query.productId) {
            query["products.product"] = req.query.productId;
        }

        const sales = await Sale.find(query)
            .populate('products.product', 'name sku image')
            .populate('createdBy', 'name')
            .sort({ date: -1 });

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
        const { startDate, endDate } = req.query;
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

        const sales = await Sale.aggregate([
            { $match: matchStage },
            { $unwind: "$products" },
            {
                $lookup: {
                    from: "products",
                    localField: "products.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
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
        ]);

        res.json(sales);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a sale
// @route   PUT /api/sales/:id
// @access  Private
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

        // If products are being updated, we need to adjust stock and recalculate totals
        if (products && Array.isArray(products)) {
            // 1. Restore stock first (add back the quantities from the ORIGINAL sale)
            for (const item of sale.products) {
                await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
            }

            let newTotalAmount = 0;
            let newTotalProfit = 0;
            const processedProducts = [];

            // 2. Process NEW products
            for (const item of products) {
                // Handle if item.product is an object (from frontend selection) or ID
                const productId = item.product._id || item.product;
                const productDb = await Product.findById(productId);

                if (!productDb) {
                    throw new Error(`Producto no encontrado: ${productId}`);
                }

                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice); // Trust frontend price or use productDb.sellingPrice? Using frontend allows price overrides if needed.

                // Check stock (productDb.stock now includes the restored amount)
                if (productDb.stock < quantity) {
                    // Ideally we should rollback here, but for now we'll throw to stop
                    // Note: This leaves the DB in a "restored stock" state if it fails mid-way, 
                    // which is safer than "deducted" state but still requires manual fix. 
                    // In a real app, use Transactions.
                    throw new Error(`Stock insuficiente para: ${productDb.name}`);
                }

                const subtotal = unitPrice * quantity;
                const profit = (unitPrice - productDb.costPrice) * quantity;

                newTotalAmount += subtotal;
                newTotalProfit += profit;

                processedProducts.push({
                    product: productDb._id,
                    quantity: quantity,
                    unitPrice: unitPrice,
                    unitCost: productDb.costPrice,
                    subtotal
                });

                // Deduct new stock
                await Product.findByIdAndUpdate(productDb._id, { $inc: { stock: -quantity } });
            }

            sale.products = processedProducts;
            sale.totalAmount = newTotalAmount;
            sale.totalProfit = newTotalProfit;
        }

        // Update metadata
        if (paymentMethod) sale.paymentMethod = paymentMethod;
        if (channel) sale.channel = channel;
        if (customer) {
            sale.customer = { ...sale.customer, ...customer };
        }

        const updatedSale = await sale.save();
        res.json(updatedSale);
    } catch (error) {
        // If error occurs during stock update, we might have inconsistencies. 
        // Logging critical error is advised.
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

        // Restore stock
        for (const item of sale.products) {
            const product = await Product.findById(item.product);
            if (product) {
                product.stock += item.quantity;
                await product.save();
            }
        }

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
