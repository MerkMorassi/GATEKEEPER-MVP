import React, { useRef } from 'react';
import { Download, Printer, CheckCircle2, Shield, Copy, Check, X, FileText, Calendar, Clock, User, Mail, DollarSign, QrCode } from 'lucide-react';
import { jsPDF } from 'jspdf';

export interface ReceiptData {
  orderId: string;
  serviceTitle: string;
  amountCents: number;
  clientName?: string;
  clientEmail?: string;
  bookingDate?: string;
  bookingTimeSlot?: string;
  clientTimezone?: string;
  createdAt: string;
  token?: string;
  passcode?: string;
  qrDataUrl?: string;
  paymentMethod?: string;
  transactionHash?: string;
}

interface ReceiptGeneratorProps {
  receipt: ReceiptData;
  onClose?: () => void;
}

export const ReceiptGenerator: React.FC<ReceiptGeneratorProps> = ({ receipt, onClose }) => {
  const [copied, setCopied] = React.useState(false);
  const printableRef = useRef<HTMLDivElement>(null);

  const formattedAmount = (receipt.amountCents / 100).toFixed(2);
  const formattedDate = new Date(receipt.createdAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Programmatic PDF Generation via jsPDF
  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Background accent header
      doc.setFillColor(15, 23, 42); // dark slate
      doc.rect(0, 0, 210, 40, 'F');

      // Title & Branding
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('GATEKEEPER', 15, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('OFFICIAL PAYMENT RECEIPT & APPOINTMENT TICKET', 15, 28);

      doc.setFontSize(8);
      doc.text(`ISSUED: ${new Date().toISOString().split('T')[0]}`, 150, 20);

      // Status Pill
      doc.setFillColor(34, 197, 94); // success green
      doc.roundedRect(150, 24, 45, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('PAID & VERIFIED', 155, 29);

      // Section: Order Summary
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TRANSACTION DETAILS', 15, 52);

      doc.setDrawColor(226, 232, 240);
      doc.line(15, 55, 195, 55);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);

      let y = 64;
      const addRow = (label: string, value: string) => {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(label, 15, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(value, 80, y);
        y += 8;
      };

      addRow('Booking / Order ID:', receipt.orderId);
      addRow('Service Title:', receipt.serviceTitle);
      addRow('Total Amount Paid:', `$${formattedAmount} USD`);
      addRow('Payment Status:', 'COMPLETED');
      addRow('Payment Method:', receipt.paymentMethod || 'PayPal Express (Encrypted)');
      addRow('Transaction Timestamp:', formattedDate);

      if (receipt.clientName) addRow('Client Name:', receipt.clientName);
      if (receipt.clientEmail) addRow('Client Email:', receipt.clientEmail);
      if (receipt.bookingDate) addRow('Scheduled Date:', receipt.bookingDate);
      if (receipt.bookingTimeSlot) addRow('Scheduled Time Slot:', `${receipt.bookingTimeSlot} (${receipt.clientTimezone || 'UTC'})`);

      y += 6;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('TICKET CREDENTIALS & ACCESS', 15, y);
      doc.line(15, y + 3, 195, y + 3);
      y += 12;

      if (receipt.token) {
        addRow('Access Ticket Token:', receipt.token);
      }
      if (receipt.passcode) {
        addRow('Encrypted Passcode:', receipt.passcode);
      }

      y += 10;
      // Verification box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(15, y, 180, 25, 3, 3, 'FD');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('DOUBLE-BLIND FACETIME CONSULTATION SECURITY', 20, y + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Present or scan your QR ticket credential at the scheduled time to trigger direct connection.', 20, y + 15);
      doc.text('All consultation transactions are cryptographically verified by GateKeeper Security Engine.', 20, y + 20);

      // Save PDF
      doc.save(`GateKeeper_Receipt_${receipt.orderId}.pdf`);
    } catch (err) {
      console.error('Error generating PDF receipt:', err);
      window.print();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyDetails = () => {
    const text = `
========================================
GATEKEEPER PAYMENT RECEIPT
========================================
Booking ID: ${receipt.orderId}
Service: ${receipt.serviceTitle}
Amount Paid: $${formattedAmount} USD
Status: COMPLETED & VERIFIED
Timestamp: ${formattedDate}
${receipt.clientName ? `Client: ${receipt.clientName}\n` : ''}${receipt.clientEmail ? `Email: ${receipt.clientEmail}\n` : ''}${receipt.bookingDate ? `Scheduled Date: ${receipt.bookingDate}\n` : ''}${receipt.bookingTimeSlot ? `Time Slot: ${receipt.bookingTimeSlot}\n` : ''}${receipt.token ? `Access Token: ${receipt.token}\n` : ''}========================================
GateKeeper Security Engine
`.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface-a0 border border-surface-a10 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-8">
        {/* Modal Header */}
        <div className="bg-tonal-a0 border-b border-surface-a10 p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-success-a0/10 text-success-a0 rounded-xl border border-success-a0/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-theme-light">Official Payment Receipt</h2>
              <p className="text-xs text-surface-a40 font-mono">Booking ID: #{receipt.orderId}</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-surface-a40 hover:text-theme-light rounded-xl bg-surface-a10 hover:bg-surface-a20 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Printable Area */}
        <div ref={printableRef} className="p-6 sm:p-8 space-y-6 print:p-0 print:bg-white print:text-black">
          {/* Receipt Header Badge */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-surface-a10 gap-4">
            <div>
              <div className="flex items-center space-x-2 text-info-a0 font-mono text-xs font-bold uppercase tracking-wider mb-1">
                <Shield className="w-4 h-4" />
                <span>GATEKEEPER SECURITY ENGINE</span>
              </div>
              <h1 className="text-2xl font-black text-theme-light">PAYMENT RECEIPT</h1>
              <p className="text-xs text-surface-a40 font-mono mt-0.5">{formattedDate}</p>
            </div>
            <div className="px-3 py-1.5 bg-success-a0/20 border border-success-a0/30 text-success-a0 rounded-full font-mono text-xs font-bold flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>PAID & VERIFIED</span>
            </div>
          </div>

          {/* Service & Price Summary Card */}
          <div className="bg-tonal-a0/60 border border-surface-a10 rounded-2xl p-5 space-y-3">
            <div className="text-[10px] font-mono text-surface-a40 uppercase tracking-wider">Service Purchased</div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-theme-light">{receipt.serviceTitle}</h3>
              <div className="text-2xl font-black text-info-a0 font-mono">
                ${formattedAmount} <span className="text-xs font-normal text-surface-a40">USD</span>
              </div>
            </div>
          </div>

          {/* Grid Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
            <div className="bg-surface-a0 border border-surface-a10 p-4 rounded-xl space-y-1">
              <div className="text-[10px] text-surface-a40 uppercase">Booking / Order ID</div>
              <div className="font-bold text-theme-light truncate">{receipt.orderId}</div>
            </div>

            <div className="bg-surface-a0 border border-surface-a10 p-4 rounded-xl space-y-1">
              <div className="text-[10px] text-surface-a40 uppercase">Payment Method</div>
              <div className="font-bold text-theme-light">{receipt.paymentMethod || 'PayPal Express (Encrypted)'}</div>
            </div>

            {receipt.clientName && (
              <div className="bg-surface-a0 border border-surface-a10 p-4 rounded-xl space-y-1">
                <div className="text-[10px] text-surface-a40 uppercase">Client Name</div>
                <div className="font-bold text-theme-light truncate">{receipt.clientName}</div>
              </div>
            )}

            {receipt.clientEmail && (
              <div className="bg-surface-a0 border border-surface-a10 p-4 rounded-xl space-y-1">
                <div className="text-[10px] text-surface-a40 uppercase">Client Email</div>
                <div className="font-bold text-theme-light truncate">{receipt.clientEmail}</div>
              </div>
            )}

            {receipt.bookingDate && (
              <div className="bg-surface-a0 border border-surface-a10 p-4 rounded-xl space-y-1">
                <div className="text-[10px] text-surface-a40 uppercase">Scheduled Date</div>
                <div className="font-bold text-info-a0">{receipt.bookingDate}</div>
              </div>
            )}

            {receipt.bookingTimeSlot && (
              <div className="bg-surface-a0 border border-surface-a10 p-4 rounded-xl space-y-1">
                <div className="text-[10px] text-surface-a40 uppercase">FaceTime Time Slot</div>
                <div className="font-bold text-info-a0">{receipt.bookingTimeSlot} ({receipt.clientTimezone || 'UTC'})</div>
              </div>
            )}
          </div>

          {/* Ticket Credentials Box */}
          {(receipt.token || receipt.qrDataUrl) && (
            <div className="bg-info-a0/10 border border-info-a0/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono font-bold text-info-a0 uppercase tracking-wider flex items-center space-x-1.5">
                  <Shield className="w-4 h-4" />
                  <span>FaceTime Access Ticket Credential</span>
                </div>
                <span className="text-[10px] font-mono text-surface-a40 bg-surface-a10 px-2 py-0.5 rounded">
                  SINGLE-USE
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                {receipt.qrDataUrl && (
                  <div className="bg-white p-2 rounded-xl shadow-md flex-shrink-0">
                    <img src={receipt.qrDataUrl} alt="Ticket QR Code" className="w-24 h-24" />
                  </div>
                )}
                <div className="flex-1 space-y-1.5 font-mono text-xs w-full">
                  {receipt.token && (
                    <div>
                      <div className="text-[10px] text-surface-a40 uppercase">Ticket Access Token</div>
                      <div className="font-bold text-theme-light bg-surface-a0 border border-surface-a10 px-3 py-1.5 rounded-lg truncate">
                        {receipt.token}
                      </div>
                    </div>
                  )}
                  {receipt.passcode && (
                    <div>
                      <div className="text-[10px] text-surface-a40 uppercase">Encrypted Passcode</div>
                      <div className="font-bold text-theme-light bg-surface-a0 border border-surface-a10 px-3 py-1.5 rounded-lg font-mono">
                        {receipt.passcode}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="text-center font-mono text-[10px] text-surface-a40 pt-2 border-t border-surface-a10">
            GateKeeper © 2026 Merk Morassi, LLC • Confidentially Encrypted FaceTime Advisory System
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="bg-tonal-a0 border-t border-surface-a10 p-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleCopyDetails}
            className="py-2.5 px-4 bg-surface-a10 hover:bg-surface-a20 text-theme-light rounded-xl font-mono text-xs font-bold transition-all flex items-center space-x-2"
          >
            {copied ? <Check className="w-4 h-4 text-success-a0" /> : <Copy className="w-4 h-4 text-surface-a40" />}
            <span>{copied ? 'Copied Receipt!' : 'Copy Receipt Text'}</span>
          </button>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="flex-1 sm:flex-none py-2.5 px-4 bg-surface-a10 hover:bg-surface-a20 text-theme-light rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              className="flex-1 sm:flex-none py-2.5 px-4 bg-info-a0 hover:bg-info-a10 text-primary-a0 rounded-xl font-mono text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-lg shadow-info-a0/20"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
