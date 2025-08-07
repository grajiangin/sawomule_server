const PdfPrinter = require('pdfmake/src/printer');
const fs = require('fs');
const path = require('path');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

class PDFGenerator {
  constructor() {
    // Set environment variables to avoid fontconfig issues on headless systems
    process.env.FONTCONFIG_PATH = process.env.FONTCONFIG_PATH || '/dev/null';
    process.env.FC_DEBUG = '0';
    
    // Use default fonts for PDFMake
    this.printer = new PdfPrinter({
      // Roboto: {
      //   normal: 'Helvetica',
      //   bold: 'Helvetica-Bold',
      //   italics: 'Helvetica-Oblique',
      //   bolditalics: 'Helvetica-BoldOblique'
      // }
    });

    // Initialize Chart.js canvas renderer with font fallback for headless systems
    try {
      this.chartJSNodeCanvas = new ChartJSNodeCanvas({ 
        width: 800, 
        height: 400,
        backgroundColour: 'white',
        plugins: {
          modern: [],
          requireLegacy: []
        },
        chartCallback: (ChartJS) => {
          try {
            // Use basic fonts that work on headless systems
            ChartJS.defaults.font = ChartJS.defaults.font || {};
            ChartJS.defaults.font.family = 'monospace';
            ChartJS.defaults.font.size = 12;
            ChartJS.defaults.font.weight = 'normal';
            ChartJS.defaults.font.lineHeight = 1.2;
            
            // Suppress font-related warnings
            ChartJS.defaults.plugins = ChartJS.defaults.plugins || {};
            ChartJS.defaults.plugins.legend = ChartJS.defaults.plugins.legend || {};
            ChartJS.defaults.plugins.legend.labels = ChartJS.defaults.plugins.legend.labels || {};
            ChartJS.defaults.plugins.legend.labels.usePointStyle = false;
          } catch (fontError) {
            console.warn('Chart font configuration warning (non-critical):', fontError.message);
          }
        }
      });
    } catch (canvasError) {
      console.error('ChartJS Canvas initialization error:', canvasError);
      this.chartJSNodeCanvas = null;
    }
  }

  async generateAnalyticsReport(data, range, startDate, endDate) {
    try {
      // Debug logging
      console.log('PDFGenerator.generateAnalyticsReport called with:', {
        data: data ? 'data exists' : 'data is null/undefined',
        dataKeys: data ? Object.keys(data) : 'no keys',
        range,
        startDate,
        endDate
      });

      // Build the document definition
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          // font: 'Roboto',
          fontSize: 10
        },
        styles: {
          headerTitle: {
            fontSize: 24,
            bold: true,
            margin: [0, 0, 0, 5]
          },
          headerSubtitle: {
            fontSize: 12,
            margin: [0, 5, 0, 5]
          },
          headerDate: {
            fontSize: 10,
            margin: [0, 5, 0, 0]
          },
          sectionTitle: {
            fontSize: 16,
            bold: true,
            margin: [0, 0, 0, 5]
          },
          tableHeader: {
            bold: true,
            fontSize: 10,
            color: 'black'
          },
          tableCell: {
            fontSize: 10
          },
          tableCellBold: {
            fontSize: 10,
            bold: true
          },
          tableTotalCell: {
            fontSize: 10,
            bold: true,
            color: 'black'
          },
          errorText: {
            fontSize: 12,
            color: 'red'
          },
          noDataText: {
            fontSize: 12,
            color: 'gray',
            fontStyle: 'italic'
          },
          noteText: {
            fontSize: 10,
            color: 'gray',
            fontStyle: 'italic'
          },
          footerText: {
            fontSize: 10,
            color: 'gray'
          }
        },
        // Define pageBreakBefore to control page breaks only
        pageBreakBefore: function(currentNode, followingNodesOnPage, nodesOnNextPage, previousNodesOnPage) {
          // Ensure page break before chart and respect existing pageBreak logic
          if (currentNode.id === 'revenueChart' || 
              currentNode.id === 'soldMenuItems' || 
              currentNode.id?.startsWith('kitchenTables_') || 
              currentNode.id === 'orderDetails') {
            return currentNode.pageBreak === 'before';
          }
          return false;
        },
        content: [
          // Header
          ...this.createHeader('LAPORAN ANALITIK SAWO MULE', range, startDate, endDate),
          
          // Analytics Cards
          ...this.createAnalyticsCards(data),
          
          // Revenue Bar Chart
          ...(await this.createRevenueBarChart(data, range, startDate, endDate)),
          
          // Payment Method Pie Chart
          ...(await this.createPaymentMethodPieChart(data)),
          
          // Popular Menu Pie Chart
          ...(await this.createPopularMenuPieChart(data?.top_menus || [])),
          
          // Sold Menu Items Table
          ...this.createSoldMenuItemsTable(data?.top_menus || []),
          
          // Kitchen Grouped Tables
          ...this.createKitchenGroupedTables(data?.top_menus || []),
          
          // Order Details Table
          ...this.createOrderDetailsTable(data?.order_details || []),
          
          // Footer
          ...this.createFooter()
        ]
      };

      return new Promise((resolve, reject) => {
        const doc = this.printer.createPdfKitDocument(docDefinition);
        const chunks = [];
        
        doc.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });
        
        doc.on('error', (error) => {
          reject(error);
        });
        
        doc.end();
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      // Return a basic PDF with error message
      const errorDocDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: {
          // font: 'Roboto',
          fontSize: 10
        },
        styles: {
          errorTitle: {
            fontSize: 16,
            bold: true,
            margin: [0, 0, 0, 10]
          },
          errorMessage: {
            fontSize: 12,
            margin: [0, 10, 0, 0]
          }
        },
        content: [
          {
            text: 'Error generating PDF report',
            style: 'errorTitle',
            alignment: 'center'
          },
          {
            text: `Error: ${error.message}`,
            style: 'errorMessage',
            alignment: 'center'
          }
        ]
      };
      
      return new Promise((resolve, reject) => {
        const doc = this.printer.createPdfKitDocument(errorDocDefinition);
        const chunks = [];
        
        doc.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        doc.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });
        
        doc.on('error', (error) => {
          reject(error);
        });
        
        doc.end();
      });
    }
  }

  createHeader(title, range, startDate, endDate) {
    const rangeText = this.getRangeText(range, startDate, endDate);
    const now = new Date();
    const generatedDate = `Dibuat pada: ${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}`;

    return [
      {
        text: title,
        style: 'headerTitle',
        alignment: 'center'
      },
      {
        text: `Periode: ${rangeText}`,
        style: 'headerSubtitle',
        alignment: 'center'
      },
      {
        text: generatedDate,
        style: 'headerDate',
        alignment: 'center'
      },
      {
        text: '',
        margin: [0, 20, 0, 0]
      }
    ];
  }

  getRangeText(range, startDate, endDate) {
    const start = new Date(startDate).toLocaleDateString('id-ID');
    const end = new Date(endDate).toLocaleDateString('id-ID');
    return `${start} - ${end}`;
    // const rangeLabels = {
    //   'today': 'Hari Ini',
    //   'week': '7 Hari Terakhir',
    //   'month': '30 Hari Terakhir',
    //   '2months': '2 Bulan Terakhir',
    //   '3months': '3 Bulan Terakhir',
    //   '6months': '6 Bulan Terakhir',
    //   'year': '1 Tahun Terakhir',
    //   'custom': 'Rentang Kustom'
    // };

    // if (range === 'custom' && startDate && endDate) {
     
    // }
    
    // return rangeLabels[range] || range;
  }

  createAnalyticsCards(data) {
    if (!data || typeof data !== 'object') {
      return [
        {
          text: 'Error: Invalid data provided',
          style: 'errorText'
        }
      ];
    }

    const revenue = data.revenue || 0;
    const orderCount = data.order_count || 0;
    const averageOrderSpent = data.average_order_spent || 0;
    const revenueCash = data.revenue_cash || 0;
    const revenueQris = data.revenue_qris || 0;

    const analyticsData = [
      { title: 'Pendapatan', value: this.formatCurrency(revenue) },
      { title: 'Total Pesanan', value: orderCount.toString() },
      { title: 'Rata-rata Pesanan', value: this.formatCurrency(averageOrderSpent) },
      { title: 'Cash', value: this.formatCurrency(revenueCash) },
      { title: 'QRIS', value: this.formatCurrency(revenueQris) }
    ];

    const tableBody = [
      // Header row
      [
        { text: 'Item', style: 'tableHeader' },
        { text: 'Nilai', style: 'tableHeader' }
      ],
      // Data rows
      ...analyticsData.map(item => [
        { text: item.title, style: 'tableCell' },
        { text: item.value, style: 'tableCellBold' }
      ])
    ];

    return [
      {
        text: 'RINGKASAN ANALITIK',
        style: 'sectionTitle',
        margin: [0, 20, 0, 10]
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', '*'],
          body: tableBody
        },
        layout: {
          hLineWidth: function(i, node) {
            return 1;
          },
          vLineWidth: function(i, node) {
            return 1;
          },
          hLineColor: function(i, node) {
            return 'black';
          },
          vLineColor: function(i, node) {
            return 'black';
          },
          fillColor: function(rowIndex, node, columnIndex) {
            // Apply light grey background to header row
            if (rowIndex === 0) {
              return '#f0f0f0';
            }
            return null;
          }
        },
        margin: [0, 0, 0, 20]
      }
    ];
  }

  async createRevenueBarChart(data, range, startDate, endDate) {
    // Check if date range is more than 1 day
    let daysDiff = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }

    if (daysDiff <= 1 || range === 'today') {
      return [
        {
          text: 'Grafik pendapatan tidak ditampilkan untuk rentang satu hari',
          style: 'noDataText',
          margin: [0, 20, 0, 20]
        }
      ];
    }

    // Check if daily_revenue data is available
    if (!data?.daily_revenue || !Array.isArray(data.daily_revenue) || data.daily_revenue.length === 0) {
      return [
        {
          text: 'Data pendapatan harian tidak tersedia untuk grafik',
          style: 'noDataText',
          margin: [0, 20, 0, 20]
        }
      ];
    }

    // Limit to 30 bars max to avoid overcrowding
    let chartData = data.daily_revenue.slice(0, 30);
    
    // Aggregate data for ranges > 30 days
    if (daysDiff > 30) {
      const aggregatedData = [];
      const weeks = Math.ceil(daysDiff / 7);
      for (let i = 0; i < weeks; i++) {
        const weekData = data.daily_revenue.slice(i * 7, (i + 1) * 7);
        const weekRevenue = weekData.reduce((sum, d) => sum + (d.revenue || 0), 0);
        aggregatedData.push({
          date: `Minggu ${i + 1}`,
          revenue: weekRevenue
        });
      }
      chartData = aggregatedData.slice(0, 30);
    }

    try {
      // Check if chart canvas is available
      if (!this.chartJSNodeCanvas) {
        return [
          {
            text: 'Grafik tidak tersedia (sistem headless)',
            style: 'noDataText',
            margin: [0, 20, 0, 20]
          }
        ];
      }

      // Prepare data for Chart.js
      const labels = chartData.map(item => {
        if (daysDiff > 30) {
          return item.date;
        }
        try {
          return new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        } catch (e) {
          return item.date;
        }
      });

      const revenues = chartData.map(item => item.revenue || 0);

      // Create Chart.js configuration
      const configuration = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Pendapatan (Rp)',
            data: revenues,
            backgroundColor: 'rgba(74, 144, 226, 0.8)',
            borderColor: 'rgba(74, 144, 226, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Pendapatan Harian',
              font: {
                family: 'monospace',
                size: 16,
                weight: 'bold'
              }
            },
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                font: {
                  family: 'monospace',
                  size: 10
                },
                callback: function(value) {
                  return new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(value);
                }
              }
            },
            x: {
              ticks: {
                font: {
                  family: 'monospace',
                  size: 10
                },
                maxRotation: 45,
                minRotation: 0
              }
            }
          }
        }
      };

      // Generate chart image
      const chartBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
      const chartBase64 = chartBuffer.toString('base64');

      return [
        {
          id: 'revenueChart',
          text: 'GRAFIK PENDAPATAN HARIAN',
          style: 'sectionTitle',
          margin: [0, 20, 0, 10],
          pageBreak: undefined
        },
        {
          id: 'revenueChartImage',
          image: `data:image/png;base64,${chartBase64}`,
          width: 500,
          margin: [(595 - 80 - 500) / 2, 0, (595 - 80 - 500) / 2, 20], // Center horizontally on A4 portrait
          pageBreak: 'after'
        }
      ];
    } catch (error) {
      console.error('Error generating revenue chart:', error);
      return [
        {
          text: 'Error generating revenue chart',
          style: 'errorText',
          margin: [0, 20, 0, 20]
        }
      ];
    }
  }

  async createPaymentMethodPieChart(data) {
    if (!data || ((!data.revenue_cash || data.revenue_cash <= 0) && (!data.revenue_qris || data.revenue_qris <= 0))) {
      return [
        {
          text: 'Tidak ada data pembayaran untuk grafik',
          style: 'noDataText',
          margin: [0, 20, 0, 20]
        }
      ];
    }

    // Check if chart canvas is available
    if (!this.chartJSNodeCanvas) {
      return [
        {
          text: 'Grafik tidak tersedia (sistem headless)',
          style: 'noDataText',
          margin: [0, 20, 0, 20]
        }
      ];
    }

    try {
      const paymentData = [];
      const labels = [];
      const colors = [];

      if (data.revenue_cash && data.revenue_cash > 0) {
        labels.push('Cash');
        paymentData.push(data.revenue_cash);
        colors.push('rgba(76, 175, 80, 0.8)');
      }

      if (data.revenue_qris && data.revenue_qris > 0) {
        labels.push('QRIS');
        paymentData.push(data.revenue_qris);
        colors.push('rgba(33, 150, 243, 0.8)');
      }

      const configuration = {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: paymentData,
            backgroundColor: colors,
            borderColor: colors.map(color => color.replace('0.8', '1')),
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Distribusi Metode Pembayaran',
              font: {
                family: 'monospace',
                size: 16,
                weight: 'bold'
              }
            },
            legend: {
              position: 'bottom',
              labels: {
                font: {
                  family: 'monospace',
                  size: 12
                },
                generateLabels: function(chart) {
                  const data = chart.data;
                  if (data.labels.length && data.datasets.length) {
                    return data.labels.map((label, i) => {
                      const value = data.datasets[0].data[i];
                      const formatted = new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(value);
                      return {
                        text: `${label}: ${formatted}`,
                        fillStyle: data.datasets[0].backgroundColor[i],
                        strokeStyle: data.datasets[0].borderColor[i],
                        lineWidth: data.datasets[0].borderWidth,
                        hidden: false,
                        index: i
                      };
                    });
                  }
                  return [];
                }
              }
            }
          }
        }
      };

      const chartBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
      const chartBase64 = chartBuffer.toString('base64');

      return [
        {
          text: 'METODE PEMBAYARAN',
          style: 'sectionTitle',
          margin: [0, 20, 0, 10]
        },
        {
          image: `data:image/png;base64,${chartBase64}`,
          width: 400,
          margin: [(595 - 80 - 400) / 2, 0, (595 - 80 - 400) / 2, 20]
        }
      ];
    } catch (error) {
      console.error('Error generating payment method chart:', error);
      return [
        {
          text: 'Error generating payment method chart',
          style: 'errorText',
          margin: [0, 20, 0, 20]
        }
      ];
    }
  }

  async createPopularMenuPieChart(topMenus) {
    if (!topMenus || topMenus.length === 0) {
      return [
        {
          text: 'Tidak ada data menu terpopuler untuk grafik',
          style: 'noDataText',
          margin: [0, 20, 0, 20]
        }
      ];
    }

    // Check if chart canvas is available
    if (!this.chartJSNodeCanvas) {
      return [
        {
          text: 'Grafik tidak tersedia (sistem headless)',
          style: 'noDataText',
          margin: [0, 20, 0, 20]
        }
      ];
    }

    try {
      // Take top 5 menus for the pie chart
      const top5Menus = topMenus.slice(0, 5);
      const labels = top5Menus.map(menu => menu.name || 'Unknown');
      const orderCounts = top5Menus.map(menu => menu.order_count || 0);
      
      // Generate colors
      const colors = [
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 205, 86, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)'
      ];

      const configuration = {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: orderCounts,
            backgroundColor: colors.slice(0, labels.length),
            borderColor: colors.slice(0, labels.length).map(color => color.replace('0.8', '1')),
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'Menu Terpopuler (Top 5)',
              font: {
                family: 'monospace',
                size: 16,
                weight: 'bold'
              }
            },
            legend: {
              position: 'bottom',
              labels: {
                font: {
                  family: 'monospace',
                  size: 12
                },
                generateLabels: function(chart) {
                  const data = chart.data;
                  if (data.labels.length && data.datasets.length) {
                    return data.labels.map((label, i) => {
                      const value = data.datasets[0].data[i];
                      return {
                        text: `${label}: ${value} pesanan`,
                        fillStyle: data.datasets[0].backgroundColor[i],
                        strokeStyle: data.datasets[0].borderColor[i],
                        lineWidth: data.datasets[0].borderWidth,
                        hidden: false,
                        index: i
                      };
                    });
                  }
                  return [];
                }
              }
            }
          }
        }
      };

      const chartBuffer = await this.chartJSNodeCanvas.renderToBuffer(configuration);
      const chartBase64 = chartBuffer.toString('base64');

      return [
        {
          text: 'MENU TERPOPULER',
          style: 'sectionTitle',
          margin: [0, 20, 0, 10]
        },
        {
          image: `data:image/png;base64,${chartBase64}`,
          width: 400,
          margin: [(595 - 80 - 400) / 2, 0, (595 - 80 - 400) / 2, 20]
        }
      ];
    } catch (error) {
      console.error('Error generating popular menu chart:', error);
      return [
        {
          text: 'Error generating popular menu chart',
          style: 'errorText',
          margin: [0, 20, 0, 20]
        }
      ];
    }
  }

  createSoldMenuItemsTable(topMenus) {
    if (!topMenus || topMenus.length === 0) {
      return [
        {
          id: 'soldMenuItems',
          text: 'Tidak ada data menu terjual',
          style: 'noDataText',
          margin: [0, 20, 0, 0]
        }
      ];
    }

    let totalQuantity = 0;
    let totalRevenue = 0;

    const tableBody = [
      // Header row
      [
        { text: 'Nama Menu', style: 'tableHeader' },
        { text: 'Jumlah', style: 'tableHeader' },
        { text: 'Total Harga', style: 'tableHeader' }
      ],
      // Data rows
      ...topMenus.map(menu => {
        const quantity = menu.order_count || 0;
        const revenue = menu.revenue || 0;
        totalQuantity += quantity;
        totalRevenue += revenue;

        return [
          { text: menu.name || 'Unknown', style: 'tableCell' },
          { text: quantity.toString(), style: 'tableCell' },
          { text: this.formatCurrency(revenue), style: 'tableCell' }
        ];
      }),
      // Total row
      [
        { text: 'TOTAL', style: 'tableTotalCell' },
        { text: totalQuantity.toString(), style: 'tableTotalCell' },
        { text: this.formatCurrency(totalRevenue), style: 'tableTotalCell' }
      ]
    ];

    // Check if table is large enough to warrant a page break
    const shouldPageBreak = tableBody.length > 8; // If more than 8 rows, add page break

    return [
      {
        id: 'soldMenuItems',
        text: 'DAFTAR MENU TERJUAL',
        style: 'sectionTitle',
        margin: [0, 20, 0, 10],
        pageBreak: shouldPageBreak ? 'before' : undefined
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: tableBody
        },
        layout: {
          hLineWidth: function(i, node) {
            return (i === 0 || i === node.table.body.length) ? 1 : 0.5;
          },
          vLineWidth: function(i, node) {
            return 0.5;
          },
          hLineColor: function(i, node) {
            return (i === 0 || i === node.table.body.length) ? 'black' : 'gray';
          },
          vLineColor: function(i, node) {
            return 'gray';
          },
          fillColor: function(rowIndex, node, columnIndex) {
            // Apply grey background to the last row (total row)
            if (rowIndex === node.table.body.length - 1) {
              return '#E0E0E0';
            }
            // Apply light grey background to header row
            if (rowIndex === 0) {
              return '#f0f0f0';
            }
            return null;
          }
        },
        margin: [0, 0, 0, 20],
        pageBreak: 'auto'
      }
    ];
  }

  createKitchenGroupedTables(topMenus) {
    if (!topMenus || topMenus.length === 0) {
      return [];
    }

    const kitchenGroups = this.groupMenusByKitchen(topMenus);
    const content = [];

    Object.entries(kitchenGroups).forEach(([kitchenName, menus], index) => {
      if (menus.length === 0) return;

      let totalQuantity = 0;
      let totalRevenue = 0;

      const tableBody = [
        // Header row
        [
          { text: 'Nama Menu', style: 'tableHeader' },
          { text: 'Jumlah', style: 'tableHeader' },
          { text: 'Total Harga', style: 'tableHeader' }
        ],
        // Data rows
        ...menus.map(menu => {
          const quantity = menu.order_count || 0;
          const revenue = menu.revenue || 0;
          totalQuantity += quantity;
          totalRevenue += revenue;

          return [
            { text: menu.name || 'Unknown', style: 'tableCell' },
            { text: quantity.toString(), style: 'tableCell' },
            { text: this.formatCurrency(revenue), style: 'tableCell' }
          ];
        }),
        // Total row
        [
          { text: 'TOTAL', style: 'tableTotalCell' },
          { text: totalQuantity.toString(), style: 'tableTotalCell' },
          { text: this.formatCurrency(totalRevenue), style: 'tableTotalCell' }
        ]
      ];

      // Check if table is large enough to warrant a page break
      const shouldPageBreak = tableBody.length > 6 || index > 0; // If more than 6 rows or not first kitchen, add page break

      // Use unique ID for each kitchen table
      const safeKitchenName = kitchenName.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize kitchen name for ID
      content.push(
        {
          id: `kitchenTables_${safeKitchenName}`,
          text: `DAFTAR MENU TERJUAL - ${kitchenName.toUpperCase()}`,
          style: 'sectionTitle',
          margin: [0, 20, 0, 10],
          pageBreak: shouldPageBreak ? 'before' : undefined
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto'],
            body: tableBody
          },
          layout: {
            hLineWidth: function(i, node) {
              return (i === 0 || i === node.table.body.length) ? 1 : 0.5;
            },
            vLineWidth: function(i, node) {
              return 0.5;
            },
            hLineColor: function(i, node) {
              return (i === 0 || i === node.table.body.length) ? 'black' : 'gray';
            },
            vLineColor: function(i, node) {
              return 'gray';
            },
            fillColor: function(rowIndex, node, columnIndex) {
              // Apply grey background to the last row (total row)
              if (rowIndex === node.table.body.length - 1) {
                return '#E0E0E0';
              }
              // Apply light grey background to header row
              if (rowIndex === 0) {
                return '#f0f0f0';
              }
              return null;
            }
          },
          margin: [0, 0, 0, 20],
          pageBreak: 'auto'
        }
      );
    });

    return content;
  }

  groupMenusByKitchen(topMenus) {
    const kitchenGroups = {};
    
    topMenus.forEach((menu) => {
      const kitchenName = menu.kitchen_name || 'No Kitchen';
      
      if (!kitchenGroups[kitchenName]) {
        kitchenGroups[kitchenName] = [];
      }
      
      kitchenGroups[kitchenName].push(menu);
    });
    
    return kitchenGroups;
  }

  createOrderDetailsTable(orderDetails) {
    if (!orderDetails || orderDetails.length === 0) {
      return [
        {
          id: 'orderDetails',
          text: 'Tidak ada data pesanan',
          style: 'noDataText',
          margin: [0, 20, 0, 0]
        }
      ];
    }

    const limitedOrders = orderDetails.slice(0, 20);
    const tableBody = [
      // Header row
      [
        { text: 'No. Pesanan', style: 'tableHeader' },
        { text: 'Nama Pelanggan', style: 'tableHeader' },
        { text: 'Total', style: 'tableHeader' }
      ],
      // Data rows
      ...limitedOrders.map(order => [
        { text: order.order_number || 'N/A', style: 'tableCell' },
        { text: order.customer_name || 'N/A', style: 'tableCell' },
        { text: this.formatCurrency(order.total_amount || 0), style: 'tableCell' }
      ])
    ];

    // Check if table is large enough to warrant a page break
    const shouldPageBreak = tableBody.length > 8; // If more than 8 rows, add page break

    const content = [
      {
        id: 'orderDetails',
        text: 'DAFTAR PESANAN',
        style: 'sectionTitle',
        margin: [0, 20, 0, 10],
        pageBreak: shouldPageBreak ? 'before' : undefined
      },
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto'],
          body: tableBody
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10],
        pageBreak: 'auto'
      }
    ];

    // Add note if there are more orders
    if (orderDetails.length > 20) {
      content.push({
        text: `... dan ${orderDetails.length - 20} pesanan lainnya`,
        style: 'noteText',
        margin: [0, 5, 0, 0]
      });
    }

    return content;
  }

  createFooter() {
    return [
      {
        text: 'Laporan Analitik Sawo Mule',
        style: 'footerText',
        alignment: 'center',
        margin: [0, 30, 0, 0]
      }
    ];
  }

  formatCurrency(amount) {
    try {
      const numAmount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(numAmount);
    } catch (error) {
      console.error('Error formatting currency:', error);
      return 'Rp 0';
    }
  }
}

module.exports = PDFGenerator;