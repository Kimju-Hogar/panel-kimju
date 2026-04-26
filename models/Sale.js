const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
    products: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        unitPrice: {
            type: Number,
            required: true
        },
        unitCost: {
            type: Number,
            required: true
        },
        subtotal: {
            type: Number,
            required: true
        },
        selectedSize: {
            type: String
        },
        selectedColor: {
            type: String
        }
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    totalProfit: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        required: true
    },
    channel: {
        type: String,
        required: true
    },
    customer: {
        name: String,
        contact: String
    },
    date: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// ─── Indexes for faster queries ────────────────────────────────────────────────
saleSchema.index({ date: -1 });           // Recent activity sort, trend queries
saleSchema.index({ createdAt: -1 });      // Default sort by creation
saleSchema.index({ paymentMethod: 1 });   // Dashboard: sales by payment method
saleSchema.index({ channel: 1 });         // Filter by channel

const Sale = mongoose.model('Sale', saleSchema);

module.exports = Sale;