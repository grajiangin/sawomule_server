const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');
const printer = require('../utils/printer');

const router = express.Router();
const prisma = new PrismaClient();

// Initialize kitchen printers
async function initializeKitchenPrinters() {
  try {
    const kitchens = await prisma.kitchen.findMany({
      where: {
        use_printer: true,
        status: 'ACTIVE'
      }
    });

    for (const kitchen of kitchens) {
      await printer.initializeKitchenPrinter(kitchen);
    }
  } catch (error) {
    console.error('Failed to initialize kitchen printers:', error);
  }
}

// Initialize printers when server starts
initializeKitchenPrinters();

// Re-initialize printers every hour
setInterval(initializeKitchenPrinters, 60 * 60 * 1000);

async function print_kitchen_orders(order) {
  // Group order items by kitchen
  const itemsByKitchen = {};
  
  order.order_items.forEach(item => {
    if (!item.is_buffet) {
      const kitchenName = item.kitchen_name || 'UNKNOWN';
      if (!itemsByKitchen[kitchenName]) {
        itemsByKitchen[kitchenName] = [];
      }
      itemsByKitchen[kitchenName].push(item);
    }
  });

  // Print orders for each kitchen
  for (const [kitchenName, items] of Object.entries(itemsByKitchen)) {
    try {
      
      await printer.printOrder(
        { ...order, order_items: items },
        kitchenName,
        `${kitchenName} Order Receipt`,
        (item) => true // No filter needed as items are pre-filtered
      );
    } catch (error) {
      console.error(`Failed to print order for kitchen ${kitchenName}:`, error);
      // Don't throw error to allow other kitchens to print
    }
  }
}

// Function to generate order number
async function generateOrderNumber() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  }).replace(/\//g, '');

  // Get the last order of the day
  const lastOrder = await prisma.order.findFirst({
    where: {
      order_number: {
        startsWith: dateStr
      }
    },
    orderBy: {
      order_number: 'desc'
    }
  });

  let counter = 1;
  if (lastOrder) {
    const lastCounter = parseInt(lastOrder.order_number.split('-')[1]);
    counter = lastCounter + 1;

    // Reset counter if it reaches 9999
    if (counter > 9999) {
      counter = 1;
    }
  }

  return `${dateStr}-${counter.toString().padStart(4, '0')}`;
}

// Get all orders with optional status filter
router.get('/', async (req, res) => {
  try {
    const { status, start_date, end_date } = req.query;

    // Validate status if provided
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'];
    if (status && !validStatuses.includes(status)) {
      
      return res.status(400).json({
        status: 'fail',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Build where clause based on filters
    let where = {};
    
    // Add status filter if provided
    if (status) {
      where.status = status;
    }

    // Add date range filter if provided
    if (start_date || end_date) {
      where.created_at = {};
      
      if (start_date) {
        where.created_at.gte = new Date(start_date);
      }
      
      if (end_date) {
        // Set end date to end of the day
        where.created_at.lte = new Date(end_date);
      }
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        order_items: {
          include: {
            menu: {
              include: {
                category: true,
                kitchen: true
              }
            }
          }
        },
        payment: {
          include: {
            cashier: {
              select: {
                id: true,
                username: true,
                role: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
    
    res.status(200).json(orders);
  } catch (error) {
    
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get order by ID or order number
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    // Try to find by order number first
    let order = await prisma.order.findUnique({
      where: { order_number: identifier },
      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        order_items: {
          include: {
            menu: {
              include: {
                category: true,
                kitchen:true,
              }
            }
          }
        },
        payment: {
          include: {
            cashier: {
              select: {
                id: true,
                username: true,
                role: true
              }
            }
          }
        }
      }
    });

    // If not found by order number, try by ID
    if (!order && !isNaN(identifier)) {
      order = await prisma.order.findUnique({
        where: { id: Number(identifier) },
        include: {
          table: true,
          waiter: {
            select: {
              id: true,
              username: true,
              role: true
            }
          },
          order_items: {
            include: {
              menu: {
                include: {
                  category: true,
                  kitchen: true,
                }
              }
            }
          },
          payment: {
            include: {
              cashier: {
                select: {
                  id: true,
                  username: true,
                  role: true
                }
              }
            }
          }
        }
      });
    }

    if (!order) {
      return res.status(404).json({
        status: 'fail',
        message: 'Order not found'
      });
    }

    res.status(200).json(order);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Create new order
router.post('/', async (req, res) => {
  try {
    const { table_id, order_type, order_items, customer_name } = req.body;
    
    // Validate order type
    if (!['DINE_IN', 'TAKEAWAY'].includes(order_type)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid order type. Must be DINE_IN or TAKEAWAY'
      });
    }

    // For DINE_IN orders, table_id is required
    if (order_type === 'DINE_IN' && !table_id) {
      return res.status(400).json({
        status: 'fail',
        message: 'Table ID is required for dine-in orders'
      });
    }

    // Check if table exists and is available for DINE_IN orders
    if (table_id) {
      const table = await prisma.table.findUnique({
        where: { id: Number(table_id) }
      });

      if (!table) {
        return res.status(404).json({
          status: 'fail',
          message: 'Table not found'
        });
      }

      if (!table.is_available) {
        return res.status(400).json({
          status: 'fail',
          message: 'Table is not available'
        });
      }
    }
    
    // Generate order number
    const order_number = await generateOrderNumber();

    // Fetch menu items to check buffet status
    const menuItems = await prisma.menu.findMany({
      where: {
        id: {
          in: order_items.map(item => Number(item.menu_id))
        }
      },
      include: {
        category: true,
        kitchen: true
      }
    });

    

    // Create a map of menu id to buffet status
    const menuBuffetMap = menuItems.reduce((acc, menu) => {
      acc[menu.id] = menu.is_buffet;
      return acc;
    }, {});
    
    // Create order with items
    const newOrder = await prisma.order.create({
      data: {
        order_number,
        customer_name: customer_name || null,
        table_id: table_id ? Number(table_id) : null,
        order_type,
        updated_at: new Date(),
        status: 'IN_PROGRESS',
        waiter_id: req.user.id,
        order_items: {
          create: order_items.map(item => {
            const menuItem = menuItems.find(menu => menu.id === Number(item.menu_id));
            
            return {
              menu_id: Number(item.menu_id),
              kitchen_id: menuItem.kitchen?.id || null,
              kitchen_name: menuItem.kitchen?.name || null,
              menu_name: menuItem.name,
              menu_price: menuItem.price,
              category_id: menuItem.category?.id || null,
              category_name: menuItem.category?.name || null,
              is_buffet: menuItem.is_buffet,
              quantity: Number(item.quantity),
              status: menuBuffetMap[Number(item.menu_id)] ? "READY" : "IN_PROGRESS",
              notes: item.notes
            };
          })
        }
      },

      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        payment: true,
        order_items: {
          include: {
            menu: {
              include: {
                category: true
              }
            }
          }
        }
      }

    });
    
    // Print receipt
    try {
      await print_kitchen_orders(newOrder);
    } catch (printError) {
      console.error('Failed to print receipt:', printError);
      // Don't fail the order creation if printing fails
    }

    res.status(201).json(newOrder);
  } catch (error) {
    
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Update order status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: { table: true }
    });

    if (!order) {
      return res.status(404).json({
        status: 'fail',
        message: 'Order not found'
      });
    }

    // Update only the status field
    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status }, // Only status can be updated
      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        order_items: {
          include: {
            menu: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });

    // If order is completed or cancelled and it's a dine-in order, make table available again
    if (['COMPLETED', 'CANCELLED'].includes(status) && order.table_id) {
      await prisma.table.update({
        where: { id: order.table_id },
        data: { is_available: true }
      });
    }

    res.status(200).json(updatedOrder);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Add items to order
router.post('/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const { order_items } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: Number(id) }
    });

    if (!order) {
      return res.status(404).json({
        status: 'fail',
        message: 'Order not found'
      });
    }

    // Don't allow adding items to completed or cancelled orders
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Cannot add items to ${order.status.toLowerCase()} orders`
      });
    }

    // Fetch menu items to get snapshot data
    const menuItems = await prisma.menu.findMany({
      where: {
        id: {
          in: order_items.map(item => Number(item.menu_id))
        }
      },
      include: {
        category: true,
        kitchen: true
      }
    });

    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        order_items: {
          create: order_items.map(item => {
            const menuItem = menuItems.find(menu => menu.id === Number(item.menu_id));
            return {
              menu_id: Number(item.menu_id),
              menu_name: menuItem.name,
              menu_price: menuItem.price,
              category_id: menuItem.category?.id || null,
              category_name: menuItem.category?.name || null,
              kitchen_id: menuItem.kitchen?.id || null,
              kitchen_name: menuItem.kitchen?.name || null,
              is_buffet: menuItem.is_buffet,
              quantity: Number(item.quantity),
              notes: item.notes
            };
          })
        }
      },
      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        order_items: {
          include: {
            menu: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });

    res.status(200).json(updatedOrder);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Remove item from order
router.delete('/:orderId/items/:itemId', async (req, res) => {
  try {
    const { orderId, itemId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) }
    });

    if (!order) {
      return res.status(404).json({
        status: 'fail',
        message: 'Order not found'
      });
    }

    // Don't allow removing items from completed or cancelled orders
    if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Cannot remove items from ${order.status.toLowerCase()} orders`
      });
    }

    await prisma.orderItem.delete({
      where: { id: Number(itemId) }
    });

    res.status(204).send();
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Update order item status
router.put('/items/:itemId/status', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    

    // Find the order item
    const orderItem = await prisma.orderItem.findUnique({
      where: { id: Number(itemId) },
      include: {
        order: true
      }
    });

    if (!orderItem) {
      return res.status(404).json({
        status: 'fail',
        message: 'Order item not found'
      });
    }

    // Don't allow updating items of completed or cancelled orders
    // if (['COMPLETED', 'CANCELLED'].includes(orderItem.order.status)) {
    //   return res.status(400).json({
    //     status: 'fail',
    //     message: `Cannot update items of ${orderItem.order.status.toLowerCase()} orders`
    //   });
    // }

    // Update the order item status
    const updatedItem = await prisma.orderItem.update({
      where: { id: Number(itemId) },
      data: {
        status,
        updated_at: new Date()
      },
      include: {
        menu: {
          include: {
            category: true
          }
        },
        order: {
          include: {
            table: true,
            waiter: {
              select: {
                id: true,
                username: true,
                role: true
              }
            }
          }
        }
      }
    });

    // Check if all items are completed or cancelled to update order status
    const allOrderItems = await prisma.orderItem.findMany({
      where: { order_id: orderItem.order_id }
    });

    const allItemsCompleted = allOrderItems.every(item =>
      ['COMPLETED', 'CANCELLED'].includes(item.status)
    );

    if (allItemsCompleted) {
      await prisma.order.update({
        where: { id: orderItem.order_id },
        data: {
          status: 'COMPLETED',
          updated_at: new Date()
        }
      });

      // If it's a dine-in order, make table available
      if (orderItem.order.table_id) {
        await prisma.table.update({
          where: { id: orderItem.order.table_id },
          data: { is_available: true }
        });
      }
    }

    res.status(200).json(updatedItem);
  } catch (error) {
    console.error(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Process payment for multiple orders
router.post('/pay', auth, async (req, res) => {
  try {
    const { method, cash, order: orderIds } = req.body;
console.log(req.body);
    // Validate payment method
    if (!['CASH', 'QRIS'].includes(method)) {
	console.log("A");
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid payment method. Must be CASH or QRIS'
      });
    }

    // Validate order IDs
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
	console.log("B");
      return res.status(400).json({
        status: 'fail',
        message: 'Order IDs must be provided as an array'
      });
    }

    // Get all orders and calculate total amount
    const orders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        payment_id: null // Ensure orders are not already paid
      },
      include: {
        order_items: {
          include: {
            menu: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });
	console.log(orders);

    // Check if all orders exist and are unpaid
    if (orders.length !== orderIds.length) {
	console.log("update completed");
  	await prisma.order.updateMany({
        where: {
          id: { in: orderIds }
        },
        data: {
          
          status: 'COMPLETED'
        }
      });
      return res.status(400).json({
        status: 'fail',
        message: 'One or more orders not found or already paid'
      });
    }

    // Calculate total amount
    const total_amount = orders.reduce((total, order) => {
      const orderTotal = order.order_items.reduce((sum, item) => {
	if(item.status!='CANCELLED')
	{
        	return sum + (item.menu_price * item.quantity);
	}
	return sum;
      }, 0);
      return total + orderTotal;
    }, 0);

    // For CASH payments, validate cash amount
    if (method === 'CASH' && cash < total_amount) {
      return res.status(400).json({
        status: 'fail',
        message: 'Insufficient cash amount'
      });
    }

    // Create payment and update orders in a transaction
    const payment = await prisma.$transaction(async (prisma) => {
      // Create payment record
      const payment = await prisma.payment.create({
        data: {
          cashier_id: req.user.id,
          payment_method: method,
          total_amount,
          "cash":method === "CASH" ? cash : 0,
          "change": method === "CASH" ? cash - total_amount : 0
        },
        include: {
          cashier: true
        }
      });

      // Update all orders with payment_id and status
      await prisma.order.updateMany({
        where: {
          id: { in: orderIds }
        },
        data: {
          payment_id: payment.id,
          status: 'COMPLETED'
        }
      });

      return payment;
    });

    // Calculate change for CASH payments
    const response = {
      status: 'success',
      payment,
      total_amount,
      ...(method === 'CASH' && { change: cash - total_amount })
    };
    

    // Print customer receipt
    try {
      await printer.printCustomerReceipt(orders, payment);
    } catch (printError) {
      console.error('Failed to print customer receipt:', printError);
      // Don't fail the payment if printing fails
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Reprint payment receipt
router.get('/print_payment/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get orders associated with the payment
    const orders = await prisma.order.findMany({
      where: {
        payment_id: Number(id)
      },
      include: {
        table: true,
        order_items: {
          include: {
            menu: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });

    if (orders.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No orders found for this payment ID'
      });
    }

    // Get payment details
    const payment = await prisma.payment.findUnique({
      where: {
        id: Number(id)
      },
      include: {
        cashier: true
      }
    });

    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found'
      });
    }

    // Print customer receipt
    try {
      await printer.printCustomerReceipt(orders, payment, false);
    } catch (printError) {
      console.error('Failed to print customer receipt:', printError);
      return res.status(500).json({
        status: 'fail',
        message: 'Failed to print receipt',
        error: printError.message
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Receipt printed successfully'
    });
  } catch (error) {
    console.error('Print payment error:', error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Endpoint to print order checklist
router.post('/:id/print_checklist', async (req, res) => {
  try {
    console.log("ORDER ->>>>>> " );
    const { id } = req.params;

    // Fetch the order details
    const order = await prisma.order.findUnique({
      where: { id: Number(id) },
      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        order_items: {
          include: {
            menu: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        status: 'fail',
        message: 'Order not found'
      });
    }
    if( order.table.table_number.startsWith("A")){
      await printer.printOrder(order, 'KASIR', 'Order Checklist', (item) => true);
    }
    else {
      await printer.printOrder(order, 'Bar', 'Order Checklist', (item) => true);
    }
    console.log("ORDER ->>>>>> " , order.table.table_number);
  

    // Print the order checklist
    


    res.status(200).json({
      status: 'success',
      message: 'Checklist sent to printer'
    });
  } catch (error) {
    console.error('Print checklist error:', error);
    res.status(500).json({
      status: 'fail',
      message: 'Failed to print checklist',
      error: error.message
    });
  }
});

module.exports = router; 
