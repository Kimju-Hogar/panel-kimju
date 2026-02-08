const Sale = require('../models/Sale');
const Product = require('../models/Product');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const { type } = req.query; // 'hogar', 'calzado', or undefined/'all'

        let productMatch = {};
        if (type && type !== 'all') {
            productMatch = { "productDetails.type": type };
        }

        // 1. Calculate Total Sales & Total Profit
        let salesStats;
        if (!type || type === 'all') {
            salesStats = await Sale.aggregate([
                {
                    $group: {
                        _id: null,
                        totalSales: { $sum: "$totalAmount" },
                        totalProfit: { $sum: "$totalProfit" }
                    }
                }
            ]);
        } else {
            salesStats = await Sale.aggregate([
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
                { $match: productMatch },
                {
                    $group: {
                        _id: null,
                        totalSales: { $sum: "$products.subtotal" },
                        totalProfit: {
                            $sum: {
                                $subtract: [
                                    "$products.subtotal",
                                    { $multiply: ["$products.unitCost", "$products.quantity"] }
                                ]
                            }
                        }
                    }
                }
            ]);
        }

        const totalSales = salesStats.length > 0 ? salesStats[0].totalSales : 0;
        const totalProfit = salesStats.length > 0 ? salesStats[0].totalProfit : 0;

        // 2. Calculate Stock Value & Low Stock Count
        let stockMatch = {};
        if (type && type !== 'all') {
            stockMatch = { type: type };
        }

        const productsStats = await Product.aggregate([
            { $match: stockMatch },
            {
                $project: {
                    stockValue: { $multiply: ["$costPrice", "$stock"] },
                    isLowStock: { $lt: ["$stock", "$minStock"] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalStockValue: { $sum: "$stockValue" },
                    lowStockCount: {
                        $sum: { $cond: ["$isLowStock", 1, 0] }
                    }
                }
            }
        ]);

        const stockValue = productsStats.length > 0 ? productsStats[0].totalStockValue : 0;
        const lowStockCount = productsStats.length > 0 ? productsStats[0].lowStockCount : 0;

        // 3. Get Recent Activity (Last 5 Sales)
        // If filtering, we only show sales that contain the product type, and calculate the amount for that type.
        let recentActivity;
        if (!type || type === 'all') {
            recentActivity = await Sale.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('customer', 'name')
                .select('totalAmount date channel customer products');
        } else {
            recentActivity = await Sale.aggregate([
                { $sort: { createdAt: -1 } },
                { $limit: 20 }, // Optimization: look at recent 20, then filter. Ideally match first but date sort is needed? No, unwind first is heavy.
                // Better approach: Unwind, Lookup, Match, Group back to Sale?
                // Or just fetch recent sales and filter in memory? 
                // Let's do aggregation for consistency.
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
                { $match: productMatch },
                {
                    $group: {
                        _id: "$_id",
                        date: { $first: "$date" },
                        channel: { $first: "$channel" },
                        // customer: { $first: "$customer" }, // ID only
                        totalAmount: { $sum: "$products.subtotal" }
                    }
                },
                { $sort: { date: -1 } },
                { $limit: 5 }
            ]);

            // Populate customer manually or via lookup
            if (recentActivity.length > 0) {
                await Sale.populate(recentActivity, { path: 'customer', select: 'name' });
                // Note: group lost the customer field if I didn't include it. 
                // Fix: Include customer in group.
                // Actually, easier to invoke a second lookup or standard populate.
                // let's re-run aggregation correctly including customer.
            }
        }

        // Re-doing recent activity for filtered case to be robust
        if (type && type !== 'all') {
            recentActivity = await Sale.aggregate([
                { $sort: { createdAt: -1 } },
                { $limit: 50 }, // Look at last 50 transactions to find 5 matches
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
                { $match: productMatch },
                {
                    $group: {
                        _id: "$_id",
                        date: { $first: "$date" },
                        channel: { $first: "$channel" },
                        customer: { $first: "$customer" },
                        totalAmount: { $sum: "$products.subtotal" }
                    }
                },
                { $sort: { date: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "customers",
                        localField: "customer",
                        foreignField: "_id",
                        as: "customerParams"
                    }
                },
                {
                    $addFields: {
                        customer: { $arrayElemAt: ["$customerParams", 0] }
                    }
                },
                { $project: { customerParams: 0 } } // Clean up
            ]);
        }


        // 4. Get Sales Trend (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        let trendAggregation = [
            {
                $match: {
                    date: { $gte: sevenDaysAgo }
                }
            }
        ];

        if (type && type !== 'all') {
            trendAggregation.push(
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
                { $match: productMatch },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                        sales: { $sum: "$products.subtotal" }
                    }
                }
            );
        } else {
            trendAggregation.push({
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                    sales: { $sum: "$totalAmount" }
                }
            });
        }

        trendAggregation.push({ $sort: { _id: 1 } });

        const salesTrend = await Sale.aggregate(trendAggregation);


        // 5. Sales by Payment Method
        let paymentAggregation = [];
        if (type && type !== 'all') {
            paymentAggregation.push(
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
                { $match: productMatch },
                {
                    $group: {
                        _id: "$paymentMethod",
                        value: { $sum: "$products.subtotal" }
                    }
                }
            );
        } else {
            paymentAggregation.push({
                $group: {
                    _id: "$paymentMethod",
                    value: { $sum: "$totalAmount" }
                }
            });
        }

        const salesByPaymentMethod = await Sale.aggregate(paymentAggregation);

        // 6. Sales by Category
        const salesByCategory = await Sale.aggregate([
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
            // If filtering by type, we only match that type. 
            // If 'all', we match everything (no match stage needed, or match empty)
            ...(type && type !== 'all' ? [{ $match: productMatch }] : []),
            {
                $group: {
                    _id: "$productDetails.category",
                    value: { $sum: "$products.subtotal" }
                }
            }
        ]);


        // Format salesTrend for the chart
        const formattedTrend = salesTrend.map(item => {
            const date = new Date(item._id);
            // Fix day output to be consistent with locale if possible, or static array
            const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
            // UTC vs Local issue might exist here, but sticking to existing logic
            // Add a small fix for timezone if needed, but existing code used getDay() directly
            // Note: item._id is YYYY-MM-DD string. new Date(string) is UTC usually.
            // Using getUTCDay() might be safer if the string is UTC.
            return {
                name: days[date.getUTCDay()],
                fullDate: item._id,
                sales: item.sales
            };
        });

        res.json({
            totalSales,
            totalProfit,
            stockValue,
            lowStockCount,
            recentActivity,
            salesTrend: formattedTrend,
            salesByPaymentMethod,
            salesByCategory
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: "Server Error fetching dashboard stats" });
    }
};

module.exports = {
    getDashboardStats
};
