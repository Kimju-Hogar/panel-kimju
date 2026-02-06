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
        unitPrice: { // Price at the moment of sale
            type: Number,
            required: true
        },
        unitCost: { // Cost at the moment of sale (for accurate profit calculation)
            type: Number,
            required: true
        },
        subtotal: {
            type: Number,
            required: true
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

const Sale = mongoose.model('Sale', saleSchema);

module.exports = Sale;

//NEW