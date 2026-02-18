const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    category: {
        type: String,
        required: true
    },
    distributor: {
        type: String,
        trim: true
    },
    image: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['hogar', 'calzado'],
        default: 'hogar',
        required: true
    },
    sizes: [{
        size: { type: String, required: true },
        stock: { type: Number, required: true, default: 0 }
    }],
    costPrice: {
        type: Number,
        required: true,
        default: 0
    },
    publicPrice: {
        type: Number,
        required: true,
        default: 0
    },
    margin: {
        amount: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 }
    },
    stock: {
        type: Number,
        required: true,
        default: 0
    },
    minStock: {
        type: Number,
        default: 5
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    }
}, {
    timestamps: true
});

// Calculate margin and auto-calculate stock for calzado
productSchema.pre('save', async function () {
    if (this.publicPrice > 0) {
        this.margin.amount = this.publicPrice - this.costPrice;
        this.margin.percentage = (this.margin.amount / this.publicPrice) * 100;
    } else {
        this.margin.amount = 0;
        this.margin.percentage = 0;
    }

    // Auto-calculate total stock from sizes for calzado products
    if (this.type === 'calzado' && this.sizes && this.sizes.length > 0) {
        this.stock = this.sizes.reduce((total, s) => total + (s.stock || 0), 0);
    }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
