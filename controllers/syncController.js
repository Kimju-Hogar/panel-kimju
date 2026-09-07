const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { normalizePaymentMethod } = require('../config/paymentMethods');

// Los productos ya no se sincronizan: las tres aplicaciones comparten la misma
// base de datos y las tiendas leen la coleccion de productos del panel,
// filtrada por tipo (hogar / calzado).

// @desc    Recibir una venta desde una tienda online
// @route   POST /api/sync/sales
// @access  Privado (secreto compartido)
const receiveWebSale = async (req, res) => {
    try {
        const secret = req.headers['x-sync-secret'];
        if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
            return res.status(401).json({ message: 'Secreto de sincronizacion invalido' });
        }

        const {
            orderId,
            products,
            totalAmount,
            paymentMethod,
            paymentReference,
            customer,
            origin,
        } = req.body;

        if (!products || products.length === 0) {
            return res.status(400).json({ message: 'La venta no trae productos' });
        }

        // Una misma orden puede llegar dos veces: por el webhook del financiador
        // y por la confirmacion del navegador. Se responde con la venta que ya
        // existe en lugar de duplicarla en contabilidad.
        if (orderId) {
            const existing = await Sale.findOne({ externalOrderId: orderId });
            if (existing) {
                console.log(`[Sync] La orden ${orderId} ya estaba registrada. No se duplica.`);
                return res.status(200).json(existing);
            }
        }

        const saleProducts = [];
        let calculatedTotal = 0;
        let totalProfit = 0;

        for (const item of products) {
            const product = await Product.findOne({ sku: item.sku });
            if (!product) {
                console.warn(`[Sync] SKU ${item.sku} no encontrado. Se omite del registro.`);
                continue;
            }

            // NO se descuenta stock aqui.
            //
            // Las tres aplicaciones comparten la coleccion `products`. El backend
            // de la tienda ya descontó el stock en decreaseStock() justo antes de
            // reportar esta venta, y ademas lo hizo bien: descuenta tambien el
            // stock de la talla o el color vendido, cosa que aqui no se sabe.
            // Descontar otra vez restaba el doble en cada venta web.
            //
            // Las ventas manuales (saleController.createSale) si descuentan,
            // porque en ese caso el Panel es el origen de la venta.

            const unitCost = product.costPrice || 0;
            const subtotal = item.price * item.quantity;

            saleProducts.push({
                product: product._id,
                quantity: item.quantity,
                unitPrice: item.price,
                unitCost,
                subtotal,
                selectedSize: item.selectedSize,
                selectedColor: item.selectedColor,
            });

            calculatedTotal += subtotal;
            totalProfit += subtotal - unitCost * item.quantity;
        }

        if (saleProducts.length === 0) {
            return res.status(422).json({
                message: 'Ningun SKU de la orden existe en el inventario del panel',
            });
        }

        // Aqui llega ya el medio de pago real (Wompi, Addi, Sistecredito). Antes
        // la tienda mandaba siempre "Wompi" y por eso los reportes de pagos a
        // cuotas no existian.
        const sale = new Sale({
            products: saleProducts,
            totalAmount: totalAmount || calculatedTotal,
            totalProfit,
            paymentMethod: normalizePaymentMethod(paymentMethod),
            paymentReference: paymentReference || '',
            externalOrderId: orderId || undefined,
            channel: origin || 'Tienda Online',
            customer: {
                name: customer?.name || 'Cliente Online',
                contact: customer?.email || '',
            },
            date: new Date(),
        });

        const createdSale = await sale.save();

        console.log(
            `[Sync] Venta ${orderId || createdSale._id} registrada: ${sale.paymentMethod} / ${sale.channel}`
        );

        res.status(201).json(createdSale);
    } catch (error) {
        // Carrera entre dos avisos simultaneos de la misma orden.
        if (error.code === 11000) {
            const existing = await Sale.findOne({ externalOrderId: req.body.orderId });
            if (existing) return res.status(200).json(existing);
        }
        console.error('[Sync] Error recibiendo la venta:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    receiveWebSale,
};
