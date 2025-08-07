const ThermalPrinter = require('node-thermal-printer').printer;
const { Jimp } = require('jimp');
const path = require('path');
require('dotenv').config();
const PrinterTypes = require("node-thermal-printer").types;

class PrinterManager {
    constructor() {
        this.printers = {
            KASIR: new ThermalPrinter({
                type: PrinterTypes.EPSON,
                interface: ("tcp://" + process.env.CASHIER_PRINTER_IP )|| 'tcp://192.168.1.100',
                options: {
                    timeout: 5000
                },
                width: 48,
                characterSet: 'SLOVENIA',
                removeSpecialCharacters: false,
                lineCharacter: "─",
            })
        };
        this.startConnectionCheck(1000);
    }

    async initializeKitchenPrinter(kitchen) {
        if (!kitchen.use_printer || !kitchen.printer_ip || kitchen.status !== 'ACTIVE') {
            return false;
        }

        try {
            this.printers[kitchen.name] = new ThermalPrinter({
                type: PrinterTypes.EPSON,
                interface: `tcp://${kitchen.printer_ip}`,
                options: {
                    timeout: 3000
                },
                width: 48,
                characterSet: 'SLOVENIA',
                removeSpecialCharacters: false,
                lineCharacter: "─",
            });
            return true;
        } catch (error) {
            console.error(`Failed to initialize printer for kitchen ${kitchen.name}:`, error);
            return false;
        }
    }

    async isConnected(printerType) {
        try {
            const printer = this.printers[printerType];
            if (!printer) {
                return false;
            }
            return await printer.isPrinterConnected();
        } catch (error) {
             console.error(`Printer connection check error (${printerType}):`, error);
            return false;
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    async retryOperation(operation, attempts = 3, delay = 1000) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await operation();
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                if (i < attempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
    }

    async printPaymentReceipt(order) {
        return this.retryOperation(async () => {
            try {
                const printer = this.printers.KASIR;
                if (!printer) {
                    throw new Error('Cashier printer not found');
                }

                // Check printer connection
                const isConnected = await this.isConnected('KASIR');
                if (!isConnected) {
                    throw new Error('Cashier printer is not connected');
                }

                // Clear printer buffer
                printer.clear();

                // Header
                printer.alignCenter();
                printer.setTextNormal();
                printer.bold(true);
                printer.println("SAWOMULE");
                printer.bold(false);
                printer.println("Payment Receipt");
                printer.println(new Date().toLocaleString());

                // Draw solid line
                printer.alignLeft();
                printer.println("────────────────────────────────────────────────");

                // Order details
                printer.println(`Order #: ${order.order_number}`);
                printer.println(`Type   : ${order.order_type}`);
                if (order.customer_name) {
                    printer.println(`Customer: ${order.customer_name}`);
                }
                if (order.table) {
                    printer.println(`Table   : ${order.table.table_number}`);
                }
                if (order.waiter) {
                    printer.println(`Waiter  : ${order.waiter.username}`);
                }
                if (order.payment && order.payment.cashier) {
                    printer.println(`Cashier : ${order.payment.cashier.username}`);
                }

                // Draw solid line
                printer.println("────────────────────────────────────────────────");

                // Order items with prices
                let subtotal = 0;
                order.order_items.forEach(item => {
                    const price = item.menu_price * item.quantity;
                    subtotal += price;
                    // Item name and quantity (left-aligned)
                    printer.bold(true);
                    printer.println(`${item.quantity}x ${item.menu_name}`);
                    printer.bold(false);
                    // Price details (right-aligned)
                    const priceText = `${this.formatCurrency(item.menu_price)} x ${item.quantity}`;
                    const totalText = this.formatCurrency(price);
                    const spacesNeeded = Math.max(0, 48 - priceText.length - totalText.length);
                    const spaces = '.'.repeat(spacesNeeded);
                    printer.println(`${priceText}${spaces}${totalText}`);

                    if (item.notes) {
                        printer.println(`(${item.notes})`);
                    }
                });
                printer.println("────────────────────────────────────────────────");

                // Payment details
                if (order.payment) {
                    const payment = order.payment;
                    printer.bold(true);
                    printer.println('Payment Details:');
                    printer.bold(false);

                    // Subtotal
                    printer.alignRight();
                    printer.print('Subtotal: ');
                    printer.bold(true);
                    printer.println(this.formatCurrency(subtotal));
                    printer.bold(false);

                    // Total
                    printer.bold(true);
                    printer.print('Total: ');
                    printer.println(this.formatCurrency(payment.total_amount));
                    printer.bold(false);

                    // Payment method and amount
                    printer.print('Payment Method: ');
                    printer.println(payment.payment_method);

                    if (payment.payment_method === 'CASH') {
                        printer.print('Cash: ');
                        printer.println(this.formatCurrency(payment.cash));
                        printer.print('Change: ');
                        printer.println(this.formatCurrency(payment.change));
                    }
                }

                // Footer
                printer.cut();

                // Execute print
                await printer.execute();
                return true;
            } catch (error) {
                console.error('Payment receipt printing error:', error);
                throw error;
            }
        });
    }

    async printCustomerReceipt(orders, payment, cashDrawer = true) {
        return this.retryOperation(async () => {
            try {
                const printer = this.printers.KASIR;
                if (!printer) {
                    throw new Error('Cashier printer not found');
                }
                console.log(printer.Interface)
                // Check printer connection
                const isConnected = await this.isConnected('KASIR');
                if (!isConnected) {
                    throw new Error('Cashier printer is not connected');
                }

                // Clear printer buffer
                printer.clear();

                // Header
                printer.alignCenter();
                printer.setTextNormal();
                printer.bold(true);
                printer.println("SAWOMULE");
                printer.bold(false);
                printer.println("Customer Receipt");
                printer.println(new Date().toLocaleString());

                // Draw solid line
                printer.alignLeft();
                printer.println("────────────────────────────────────────────────");
                printer.println(`Cashier : ${payment.cashier.username}`);

                printer.println("────────────────────────────────────────────────");

                // Print details for each order
                let total = 0;
                orders.forEach(order => {
                    // Order header
                    printer.println(`Order   : ${order.order_number}`);
                    printer.println(`Type    : ${order.order_type}`);
                    if (order.customer_name) {
                        printer.println(`Customer: ${order.customer_name}`);
                    }
                    if (order.table) {
                        printer.println(`Table   : ${order.table.table_number}`);
                    }

                    printer.println("────────────────────────────────────────────────");

                    // Order items
                    order.order_items.forEach(item => {
                        // Skip canceled items
                        if (item.status === 'CANCELLED') {
                            return;
                        }
                        
                        const price = item.menu_price * item.quantity;
                        total += price;

                        // Item name and quantity
                        printer.bold(true);
                        printer.println(`${item.quantity}x ${item.menu_name}`);
                        printer.bold(false);

                        // Price details
                        const priceText = `${this.formatCurrency(item.menu_price)} x ${item.quantity}`;
                        const totalText = this.formatCurrency(price);
                        const spacesNeeded = Math.max(0, 48 - priceText.length - totalText.length);
                        const spaces = '.'.repeat(spacesNeeded);
                        printer.println(`${priceText}${spaces}${totalText}`);

                        if (item.notes) {
                            printer.println(`(${item.notes})`);
                        }
                    });
                    printer.println("────────────────────────────────────────────────");
                });

                // Payment details
                printer.bold(true);
                printer.println('Payment Details:');
                printer.bold(false);
                printer.println("────────────────────────────────────────────────");

                // Total
                printer.alignLeft();
                const totalText = `Total`;
                const totalAmount = this.formatCurrency(payment.total_amount);
                const totalSpaces = Math.max(0, 48 - totalText.length - totalAmount.length);
                printer.bold(true);
                printer.print(totalText);
                printer.print(' '.repeat(totalSpaces));
                printer.println(totalAmount);
                printer.bold(false);

                // Payment method
                const methodText = `Payment Method`;
                const methodValue = payment.payment_method;
                const methodSpaces = Math.max(0, 48 - methodText.length - methodValue.length);
                printer.print(methodText);
                printer.print(' '.repeat(methodSpaces));
                printer.println(methodValue);

                // For cash payments, show cash given and change
                if (payment.payment_method === 'CASH') {
                    // Cash amount
                    const cashText = `Cash`;
                    const cashAmount = this.formatCurrency(payment.cash);
                    const cashSpaces = Math.max(0, 48 - cashText.length - cashAmount.length);
                    printer.print(cashText);
                    printer.print(' '.repeat(cashSpaces));
                    printer.println(cashAmount);

                    // Change amount
                    const changeText = `Change`;
                    const changeAmount = this.formatCurrency(payment.change);
                    const changeSpaces = Math.max(0, 48 - changeText.length - changeAmount.length);
                    printer.print(changeText);
                    printer.print(' '.repeat(changeSpaces));
                    printer.println(changeAmount);
                }

                printer.println("────────────────────────────────────────────────");

                // Footer
                printer.alignCenter();
                printer.println("\n");
                printer.bold(true);
                printer.println("Matur Nuwun");
                if (payment.payment_method == "CASH") {
                    if (cashDrawer) printer.openCashDrawer();
                }
                printer.cut();
                // Execute print
                await printer.execute();
                return true;
            } catch (error) {
                console.error('Customer receipt printing error:', error);
                throw error;
            }
        });
    }

    async printOrder(order, printerType, header = 'Order Receipt', filter) {
        return this.retryOperation(async () => {
            
            try {
                const printer = this.printers[printerType];
                
                if (!printer) {
                    throw new Error(`Invalid printer type: ${printerType}`);
                }

                // Check printer connection
                const isConnected = await this.isConnected(printerType);
                if (!isConnected) {
                    throw new Error(`Printer ${printerType} is not connected`);
                }

                // Clear printer buffer
                printer.clear();

                // Set print options
                printer.alignCenter();
                printer.setTextNormal();
                printer.bold(true);
                printer.println("SAWOMULE");
                printer.bold(false);
                printer.println(header);

                // Draw solid line
                printer.alignLeft();
                printer.println("────────────────────────────────────────────────");

                // Order details
                printer.print(`Order   : `);
                printer.bold(true);
                printer.println(`${order.order_number}`);
                printer.bold(false);
                printer.println(`Date    : ${new Date().toLocaleString()}`);
                printer.println(`Type    : ${order.order_type}`);
                if (order.customer_name) {
                    printer.println(`Customer: ${order.customer_name}`);
                }
                if (order.table) {
                    printer.println(`Table   : ${order.table.table_number}`);
                }
                if (order.waiter) {
                    printer.println(`Waiter  : ${order.waiter.username}`);
                }

                // Draw solid line
                printer.println("────────────────────────────────────────────────");

                // Order items 
                order.order_items.forEach(item => {
                    if (!filter(item)) {
                        return;
                    }
                    const itemText = `${item.quantity}x ${item.menu_name}`;
                    const checkBox = '[ ]';
                    const spacesNeeded = Math.max(0, 48 - itemText.length - checkBox.length);
                    const spaces = ' '.repeat(spacesNeeded);
                    printer.bold(true);
                    printer.println(`${itemText}${spaces}${checkBox}`);
                    printer.bold(false);
                    if (item.notes) {
                        printer.println(`(${item.notes})`);
                    }
                    printer.println("────────────────────────────────────────────────");
                });

                // Footer
                printer.cut();

                // Execute print
                await printer.execute();
                return true;
            } catch (error) {
                console.error(`Printing error (${printerType}):`, error);
                throw error;
            }
        });
    }

    startConnectionCheck(interval = 60000) {
        setInterval(async () => {
            for (const [name, printer] of Object.entries(this.printers)) {
                try {
                    const isConnected = await printer.isPrinterConnected();
  //                  console.log(`Printer ${name} is ${isConnected ? 'connected' : 'disconnected'}`);
                } catch (error) {
                    console.error(`Error checking connection for printer ${name}:`, error);
                }
            }
        }, interval);
    }
}

// module.exports = new PrinterManager(); 

