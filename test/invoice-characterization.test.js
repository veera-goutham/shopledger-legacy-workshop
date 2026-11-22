'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

function orderFromCheckout(items, coupon) {
  const totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 42,
    date: '22/11/2026',
    status: 'completed',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice uses the checkout HSN slab and reconciles the billed totals', function () {
  const order = orderFromCheckout([
    { id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ]);

  const checkout = pricing.computeTotals(order.items, order.coupon);
  const invoiceFigures = invoice.computeInvoiceFigures(order);
  const reconciliation = reports.getGstReconciliation({
    orders: [order],
    products: [],
    customers: []
  });

  assert.deepEqual(
    { subtotal: checkout.subtotal, discount: checkout.discount, tax: checkout.tax, total: checkout.total, cgst: checkout.cgst, sgst: checkout.sgst },
    { subtotal: 100, discount: 0, tax: 5, total: 105, cgst: 2.5, sgst: 2.5 }
  );
  assert.deepEqual(
    { subtotal: invoiceFigures.subtotal, discount: invoiceFigures.discount, tax: invoiceFigures.tax, total: invoiceFigures.total, cgst: invoiceFigures.cgst, sgst: invoiceFigures.sgst, lineRate: invoiceFigures.rows[0].gstPercent },
    { subtotal: 100, discount: 0, tax: 5, total: 105, cgst: 2.5, sgst: 2.5, lineRate: 5 }
  );
  assert.deepEqual(
    { checked: reconciliation.totalChecked, mismatches: reconciliation.mismatchCount, delta: reconciliation.rows[0].delta, invoiceTax: reconciliation.rows[0].invoiceTax },
    { checked: 1, mismatches: 0, delta: 0, invoiceTax: 5 }
  );
});

test('invoice applies percent coupon to subtotal before GST, matching checkout', function () {
  const order = orderFromCheckout([
    { id: 2, sku: 'RICE-2', name: 'Bulk rice', hsn: '1006', price: 600, qty: 1 }
  ], 'SAVE10');

  const checkout = pricing.computeTotals(order.items, order.coupon);
  const invoiceFigures = invoice.computeInvoiceFigures(order);
  const renderedInvoice = invoice.render(order);

  assert.deepEqual(
    { subtotal: checkout.subtotal, discount: checkout.discount, taxable: checkout.taxable, tax: checkout.tax, total: checkout.total },
    { subtotal: 600, discount: 60, taxable: 540, tax: 27, total: 567 }
  );
  assert.deepEqual(
    { subtotal: invoiceFigures.subtotal, discount: invoiceFigures.discount, tax: invoiceFigures.tax, total: invoiceFigures.total },
    { subtotal: 600, discount: 60, tax: 27, total: 567 }
  );
  assert.match(renderedInvoice, /Invoice Total<\/td><td class="r">₹567\.00/);
  assert.doesNotMatch(renderedInvoice, /differs from Order Ledger recorded total/);
});

test('invoice figures match the checkout order totals and GST breakdown', function () {
  const order = orderFromCheckout([
    { id: 3, sku: 'DAL-1', name: 'Lentils', hsn: '0713', price: 640, qty: 1 }
  ], 'SAVE10');

  const checkout = pricing.computeTotals(order.items, order.coupon);
  const invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      subtotal: invoiceFigures.subtotal,
      discount: invoiceFigures.discount,
      tax: invoiceFigures.tax,
      total: invoiceFigures.total,
      cgst: invoiceFigures.cgst,
      sgst: invoiceFigures.sgst
    },
    {
      subtotal: checkout.subtotal,
      discount: checkout.discount,
      tax: checkout.tax,
      total: checkout.total,
      cgst: checkout.cgst,
      sgst: checkout.sgst
    }
  );
  assert.deepEqual(
    invoiceFigures.rows.map(function (row) { return row.gstPercent; }),
    checkout.lines.map(function (line) { return line.gstPercent; })
  );
});
