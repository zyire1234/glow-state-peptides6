/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Real PayPal Checkout integration using the official PayPal JS SDK.
// The SDK is loaded with the public client ID (fetched from the backend,
// never hardcoded). Order creation and capture happen server-side via
// /api/paypal/create-order and /api/paypal/capture-order so the actual
// payment verification always goes through PayPal's REST API on the backend.

import React, { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/apiConfig';

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalButtonProps {
  clientId: string;
  orderId: number;
  onSuccess: (order: any) => void;
  onError?: (message: string) => void;
}

let sdkLoadPromise: Promise<void> | null = null;
let loadedForClientId: string | null = null;

function loadPayPalSdk(clientId: string): Promise<void> {
  if (window.paypal && loadedForClientId === clientId) return Promise.resolve();
  sdkLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk-script');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=AUD&intent=capture`;
    script.onload = () => {
      loadedForClientId = clientId;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load the PayPal SDK.'));
    document.body.appendChild(script);
  });
  return sdkLoadPromise;
}

export function PayPalButton({ clientId, orderId, onSuccess, onError }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    loadPayPalSdk(clientId)
      .then(() => {
        if (cancelled || !containerRef.current || !window.paypal) return;
        containerRef.current.innerHTML = '';
        window.paypal
          .Buttons({
            style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
            createOrder: async () => {
              const res = await fetch(`${API_BASE_URL}/paypal/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Could not start PayPal checkout.');
              return data.paypal_order_id;
            },
            onApprove: async (data: any) => {
              const res = await fetch(`${API_BASE_URL}/paypal/capture-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, paypal_order_id: data.orderID }),
              });
              const order = await res.json();
              if (!res.ok) {
                onError?.(order.error || 'Payment could not be confirmed.');
                return;
              }
              onSuccess(order);
            },
            onError: (err: any) => {
              onError?.(err?.message || 'PayPal checkout failed.');
            },
          })
          .render(containerRef.current);
        if (!cancelled) setStatus('ready');
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          onError?.(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, orderId]);

  if (!clientId) {
    return (
      <div className="text-[11px] text-yellow-400 bg-yellow-950/20 border border-yellow-800/30 rounded-xl p-3">
        PayPal checkout isn't configured on the server yet (missing PayPal Client ID). Please use Bank Transfer or contact us to complete payment.
      </div>
    );
  }

  return (
    <div>
      {status === 'loading' && <div className="text-[11px] text-slate-400 mb-2">Loading PayPal…</div>}
      <div ref={containerRef} />
    </div>
  );
}
