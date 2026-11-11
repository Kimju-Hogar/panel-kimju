const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { normalizePaymentMethod } = require('../config/paymentMethods');

/** Escapa un texto para poder usarlo dentro de una expresion regular. */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Un producto con tallas (calzado) o colores (hogar) recalcula su stock global
 * a partir de ellas cada vez que se guarda (ver models/Product.js). Por eso un
 * descuento hecho solo sobre el stock global se pierde: la venta exige la
 * variante en esos casos.
 */
const variantRequerida = (p) =>
    (p.type === 'calzado' && Array.isArray(p.sizes) && p.sizes.length > 0) ||
    (p.type === 'hogar' && Array.isArray(p.colors) && p.colors.length > 0);

const nombreVariante = (p) => (p.type === 'calzado' ? 'la talla' : 'el color');

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
                sizeEntry.stock -= item.quantity;
            } else if (item.selectedColor && product.type === 'hogar' && product.colors?.length > 0) {
                const colorEntry = product.colors.find(c => c.color === item.selectedColor);
                if (!colorEntry) {
                    return res.status(400).json({ message: `Color ${item.selectedColor} no encontrado para: ${product.name}` });
                }
                if (colorEntry.stock < item.quantity) {
                    return res.status(400).json({ message: `Stock insuficiente para color ${item.selectedColor} de: ${product.name}` });
                }
                colorEntry.stock -= item.quantity;
            } else {
                if (variantRequerida(product)) {
                    // Sin variante el descuento se perderia al guardar (el stock
                    // global se recalcula desde tallas/colores).
                    return res.status(400).json({ message: `Elige ${nombreVariante(product)} de: ${product.name}` });
                }
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
                selectedSize: item.selectedSize || undefined,
                selectedColor: item.selectedColor || undefined
            });
        }

        // ─── Phase 3: Save all stock updates IN PARALLEL + create sale ────────
        const saveProductsPromise = Promise.all(dbProducts.map(p => p.save()));

        const sale = new Sale({
            products: processedProducts,
            totalAmount,
            totalProfit,
            // Se guarda el nombre canonico para que los reportes no partan el
            // mismo medio de pago en varias filas.
            paymentMethod: normalizePaymentMethod(paymentMethod),
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
        const { startDate, endDate, paymentMethod, channel, type, productId } = req.query;
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

        if (paymentMethod) {
            // El filtro exacto no encontraba nada cuando el valor guardado traia
            // datos pegados ("Nequi 3146757580") o venia de la tienda en otra
            // capitalizacion. Ahora se filtra por familia de medio de pago.
            const canonical = normalizePaymentMethod(paymentMethod);
            query.paymentMethod = new RegExp('^' + escapeRegExp(canonical), 'i');
        }
        if (channel) query.channel = channel;
        if (productId) {
            query["products.product"] = productId;
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
            {
                $group: {
                    _id: "$products.product",
                    lastSaleDate: { $max: "$date" },
                    totalQuantity: { $sum: "$products.quantity" },
                    totalRevenue: { $sum: "$products.subtotal" },
                    totalProfit: { $sum: { $subtract: ["$products.subtotal", { $multiply: ["$products.quantity", "$products.unitCost"] }] } }
                }
            },
            { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "productDetails" } },
            { $unwind: "$productDetails" },
            ...(type && type !== 'all' ? [{ $match: { "productDetails.type": type } }] : []),
            {
                $project: {
                    _id: 1,
                    productName: "$productDetails.name",
                    sku: "$productDetails.sku",
                    image: "$productDetails.image",
                    lastSaleDate: 1,
                    totalQuantity: 1,
                    totalRevenue: 1,
                    totalProfit: 1
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
            if (products.length === 0) {
                return res.status(400).json({ message: 'La venta debe tener al menos un producto' });
            }

            // Antes se devolvia todo el stock con $inc sobre el stock global y se
            // volvia a descontar igual, ya sin talla ni color. Como el stock
            // global de un producto con variantes se recalcula a partir de ellas
            // al guardar, esos movimientos se perdian y la venta quedaba sin su
            // variante (con lo que tampoco se restauraba bien al eliminarla).
            //
            // Ahora se calcula la diferencia por (producto, talla/color) entre lo
            // que tenia la venta y lo que llega, y solo se mueve esa diferencia.
            const idDe = (p) => (p && p._id ? String(p._id) : String(p));
            const claveDe = (productId, size, color) => `${productId}|${size || ''}|${color || ''}`;

            const originalesLibres = [...sale.products];
            const nuevos = [];
            for (const item of products) {
                const productId = idDe(item.product);
                const quantity = Number(item.quantity);
                const unitPrice = Number(item.unitPrice);
                if (!productId || productId === 'undefined' || productId === 'null') {
                    return res.status(400).json({ message: 'Hay un renglon sin producto' });
                }
                if (!Number.isInteger(quantity) || quantity <= 0) {
                    return res.status(400).json({ message: 'La cantidad debe ser un entero mayor que cero' });
                }
                if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                    return res.status(400).json({ message: 'Precio unitario invalido' });
                }

                // Variante: la que manda el cliente o, si no la manda, la del
                // renglon original correspondiente (mismo _id o mismo producto).
                let idx = -1;
                if (item._id) idx = originalesLibres.findIndex((o) => String(o._id) === String(item._id));
                if (idx === -1) idx = originalesLibres.findIndex((o) => String(o.product) === productId);
                const original = idx > -1 ? originalesLibres.splice(idx, 1)[0] : null;

                nuevos.push({
                    productId,
                    quantity,
                    unitPrice,
                    selectedSize: item.selectedSize || (original && original.selectedSize) || undefined,
                    selectedColor: item.selectedColor || (original && original.selectedColor) || undefined,
                });
            }

            const diferencias = new Map();
            const acumular = (productId, size, color, delta) => {
                const k = claveDe(productId, size, color);
                const prev = diferencias.get(k) || { productId, size, color, delta: 0 };
                prev.delta += delta;
                diferencias.set(k, prev);
            };
            for (const o of sale.products) acumular(String(o.product), o.selectedSize, o.selectedColor, -o.quantity);
            for (const n of nuevos) acumular(n.productId, n.selectedSize, n.selectedColor, n.quantity);

            const ids = [...new Set([...nuevos.map((n) => n.productId), ...sale.products.map((o) => String(o.product))])];
            const dbProducts = await Product.find({ _id: { $in: ids } });
            const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

            for (const n of nuevos) {
                if (!productMap.has(n.productId)) {
                    return res.status(404).json({ message: `Producto no encontrado: ${n.productId}` });
                }
            }

            // Se valida y se ajusta todo en memoria; solo si nada falla se guarda.
            const tocados = new Set();
            for (const { productId, size, color, delta } of diferencias.values()) {
                if (delta === 0) continue;
                const product = productMap.get(productId);
                if (!product) continue; // producto ya borrado del inventario: no hay stock que mover

                let entrada = null;
                if (size && product.sizes?.length > 0) entrada = product.sizes.find((s) => s.size === size) || null;
                if (!entrada && color && product.colors?.length > 0) entrada = product.colors.find((c) => c.color === color) || null;

                if (entrada) {
                    if (delta > 0 && entrada.stock < delta) {
                        return res.status(400).json({ message: `Stock insuficiente para ${size || color} de: ${product.name}` });
                    }
                    entrada.stock -= delta;
                } else if (variantRequerida(product)) {
                    if (delta > 0) {
                        return res.status(400).json({ message: `Elige ${nombreVariante(product)} de: ${product.name}` });
                    }
                    // Devolucion sin variante conocida (venta editada con la version
                    // anterior): no se puede saber a que talla/color regresarla.
                    console.warn(`[Ventas] No se devolvieron ${-delta} unidad(es) de ${product.sku}: la venta no tenia talla/color.`);
                    continue;
                } else {
                    if (delta > 0 && product.stock < delta) {
                        return res.status(400).json({ message: `Stock insuficiente para: ${product.name}` });
                    }
                    product.stock -= delta;
                }
                tocados.add(productId);
            }

            await Promise.all([...tocados].map((id) => productMap.get(id).save()));

            let newTotalAmount = 0;
            let newTotalProfit = 0;
            sale.products = nuevos.map((n) => {
                const productDb = productMap.get(n.productId);
                const subtotal = n.unitPrice * n.quantity;
                newTotalAmount += subtotal;
                newTotalProfit += (n.unitPrice - productDb.costPrice) * n.quantity;
                return {
                    product: productDb._id,
                    quantity: n.quantity,
                    unitPrice: n.unitPrice,
                    unitCost: productDb.costPrice,
                    subtotal,
                    selectedSize: n.selectedSize,
                    selectedColor: n.selectedColor,
                };
            });
            sale.totalAmount = newTotalAmount;
            sale.totalProfit = newTotalProfit;
        }

        if (paymentMethod) sale.paymentMethod = normalizePaymentMethod(paymentMethod);
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
                    } else if (item.selectedColor && product.type === 'hogar' && product.colors?.length > 0) {
                        const colorEntry = product.colors.find(c => c.color === item.selectedColor);
                        if (colorEntry) colorEntry.stock += item.quantity;
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
