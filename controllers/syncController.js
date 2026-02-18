const Sale = require('../models/Sale');
const Product = require('../models/Product');
const axios = require('axios');

// Helper to push product to websites
const syncProductToWebsites = async (product) => {
    const urls = [];
    if (process.env.KINGYU_HOGAR_URL) urls.push(process.env.KINGYU_HOGAR_URL);
    if (process.env.KINGYU_CALZADO_URL) urls.push(process.env.KINGYU_CALZADO_URL);

    // Filter based on product type? 
    // User said: "connect the inventory... to Kingyu Hogar".
    // "Kingyu Calzado... exactly the same".
    // It seems products might be distributed based on type, or all to both?
    // User said: "I need you to connect the inventory... to the page of Kingyu Hogar... and those products that I upload... show up on Kingyu Hogar".
    // And later: "And similarly with Kingyu Calzado".
    // I will send to the appropriate URL based on product type if possible, or both if not specified.
    // For now, let's send to the URL corresponding to the product type.

    let targetUrls = [];
    if (product.type === 'hogar' && process.env.KINGYU_HOGAR_URL) {
        targetUrls.push(process.env.KINGYU_HOGAR_URL);
    } else if (product.type === 'calzado' && process.env.KINGYU_CALZADO_URL) {
        targetUrls.push(process.env.KINGYU_CALZADO_URL);
    } else {
        // If type is not set or valid, maybe try both or log warning?
        // Let's safe guard.
        if (process.env.KINGYU_HOGAR_URL) targetUrls.push(process.env.KINGYU_HOGAR_URL);
        if (process.env.KINGYU_CALZADO_URL) targetUrls.push(process.env.KINGYU_CALZADO_URL);
    }

    // Unique URLs
    targetUrls = [...new Set(targetUrls)];

    const secret = process.env.SYNC_SECRET;

    for (const url of targetUrls) {
        try {
            // Build full absolute image URL so frontends can use it directly
            // e.g. /uploads/image-xxx.jpeg -> https://api.kimjuhogar.com/uploads/image-xxx.jpeg
            let fullImageUrl = product.image;
            if (product.image && !product.image.startsWith('http')) {
                const cleanPath = product.image.startsWith('/') ? product.image : `/${product.image}`;
                fullImageUrl = `${url}${cleanPath}`;
            }

            const syncData = {
                sku: product.sku,
                name: product.name,
                price: Math.ceil(product.publicPrice * 1.03), // 3% increase
                stock: product.stock,
                image: fullImageUrl,
                category: product.category,
                type: product.type
            };

            await axios.post(`${url}/api/sync/products`, syncData, {
                headers: { 'x-sync-secret': secret }
            });
            console.log(`Synced product ${product.sku} to ${url}`);
        } catch (error) {
            console.error(`Failed to sync product ${product.sku} to ${url}:`, error.message);
        }
    }
};

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
            orderId, // Remote order ID
            products, // [{ sku, quantity, price }]
            totalAmount,
            paymentMethod, // 'Wompi', etc.
            customer, // { name, email, ... }
            origin // 'Kingyu Hogar' or 'Kingyu Calzado'
        } = req.body;

        // Verify/Find products and deduct stock
        const saleProducts = [];
        let calculatedTotal = 0;
        let totalProfit = 0;

        for (const item of products) {
            const product = await Product.findOne({ sku: item.sku });
            if (!product) {
                console.warn(`Product SKU ${item.sku} not found during sync sale.`);
                continue; // Skip or error? Skip for now to process partials?
            }

            // Deduct stock
            product.stock = Math.max(0, product.stock - item.quantity);
            await product.save();

            // Calculate profit
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

        // Create Sale Record
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
    receiveWebSale,
    syncProductToWebsites
};
