const Sale = require('../models/Sale');
const Product = require('../models/Product');

// NOTE: syncProductToWebsites has been removed.
// Products are now shared via the same MongoDB database.
// Websites read directly from the Panel's products collection, filtered by type.

// @desc    Receive sale from website
// @route   POST /api/sync/sales
// @access  Private (Shared Secret)
const receiveWebSale = async (req, res) => {
    try {
        const secret = req.headers['x-sync-secret'];
        if (secret !== process.env.SYNC_SECRET) {
            return res.status(401).json({ message: 'Invalid sync secret' });
        }

        const {
            orderId,
            products,
            totalAmount,
            paymentMethod,
            customer,
            origin
        } = req.body;

        const saleProducts = [];
        let calculatedTotal = 0;
        let totalProfit = 0;

        for (const item of products) {
            const product = await Product.findOne({ sku: item.sku });
            if (!product) {
                console.warn(`Product SKU ${item.sku} not found during sync sale.`);
                continue;
            }

            // Deduct stock
            product.stock = Math.max(0, product.stock - item.quantity);
            await product.save();

            const unitCost = product.costPrice || 0;
            const subtotal = item.price * item.quantity;
            const profit = subtotal - (unitCost * item.quantity);

            saleProducts.push({
                product: product._id,
                quantity: item.quantity,
                unitPrice: item.price,
                unitCost: unitCost,
                subtotal: subtotal
            });

            calculatedTotal += subtotal;
            totalProfit += profit;
        }

        const sale = new Sale({
            products: saleProducts,
            totalAmount: totalAmount || calculatedTotal,
            totalProfit: totalProfit,
            paymentMethod: paymentMethod || 'Online',
            channel: origin || 'Online Store',
            customer: {
                name: customer?.name || 'Online Customer',
                contact: customer?.email || ''
            },
            date: new Date()
        });

        const createdSale = await sale.save();
        res.status(201).json(createdSale);

    } catch (error) {
        console.error("Error receiving web sale:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    receiveWebSale
};
