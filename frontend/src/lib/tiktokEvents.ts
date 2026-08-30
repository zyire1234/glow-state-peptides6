/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Thin wrapper around the TikTok Pixel's `ttq.track()` call.
//
// The BASE pixel (ttq.load(...) + ttq.page()) is already installed once in
// frontend/index.html <head>. This file does NOT load the SDK and does NOT
// call ttq.load() — it only calls the already-loaded `window.ttq.track()`
// from App.tsx for ViewContent / AddToCart / InitiateCheckout / CompletePayment.

declare global {
  interface Window {
    ttq?: {
      track: (event: string, params?: Record<string, unknown>) => void;
      [key: string]: any;
    };
  }
}

export function trackTikTokEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.ttq || typeof window.ttq.track !== 'function') {
    // Base pixel not loaded yet (slow network, ad blocker, etc). Fail silently —
    // tracking must never break cart/checkout/payment functionality.
    return;
  }
  try {
    window.ttq.track(event, params);
  } catch (err) {
    console.error('TikTok Pixel event failed:', event, err);
  }
}
