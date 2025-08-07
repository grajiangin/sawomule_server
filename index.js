const express = require('express');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const tableRoutes = require('./routes/table');
const orderRoutes = require('./routes/order');
const paymentRouter = require('./routes/payment');
const analyticsRoutes = require('./routes/analytics');
const kitchenRoutes = require('./routes/kitchen');
const { auth } = require('./middleware/auth');
const printer = require('./utils/printer');
const delayRequest = require('./middleware/delayRequest');
const cors = require('cors');

// Initialize Express and Prisma
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(express.json());
app.use(morgan('dev'));
app.use(cors());

// Add request delay middleware (only active in development)
// app.use(delayRequest(100)); // 500ms delay

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/menus', auth, menuRoutes);
app.use('/api/tables', auth, tableRoutes);
app.use('/api/orders', auth, orderRoutes);
app.use('/api/payments', auth, paymentRouter);
app.use('/api/analytics',  analyticsRoutes);
app.use('/api/kitchens', auth, kitchenRoutes);


// Basic route
// app.get('/', (req, res) => {
//   res.send('Sawomule API Server');
// });
// Serve static files from /static directory
app.use('/', express.static('static'));


// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export prisma client for use in other files
module.exports = { prisma };
