// api/tiktok-webhook.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const shopifyEvent = req.body;
    console.log('Shopify Webhook Received:', shopifyEvent.event);

    let tiktokEvent = null;
    let value = 0;
    let currency = 'USD';

    // Process based on Shopify event type
    switch (shopifyEvent.event) {
      case 'carts/create':
      case 'carts/update':
        // Cart created/updated - for AddToCart
        if (shopifyEvent.line_items && shopifyEvent.line_items.length > 0) {
          value = shopifyEvent.line_items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
          }, 0) / 100; // Shopify stores in cents
          currency = shopifyEvent.currency || 'USD';
          
          tiktokEvent = {
            event: 'AddToCart',
            event_id: `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pixel_id: process.env.TIKTOK_PIXEL_ID,
            value: value,
            currency: currency,
            contents: shopifyEvent.line_items.map(item => ({
              content_id: item.product_id.toString(),
              quantity: item.quantity,
              price: (item.price / 100).toFixed(2)
            }))
          };
        }
        break;

      case 'checkouts/create':
      case 'checkouts/update':
        // Checkout created/updated - for InitiateCheckout
        if (shopifyEvent.total_price) {
          value = shopifyEvent.total_price / 100;
          currency = shopifyEvent.currency || 'USD';
          
          tiktokEvent = {
            event: 'InitiateCheckout',
            event_id: `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pixel_id: process.env.TIKTOK_PIXEL_ID,
            value: value,
            currency: currency,
            contents: shopifyEvent.line_items?.map(item => ({
              content_id: item.product_id.toString(),
              quantity: item.quantity,
              price: (item.price / 100).toFixed(2)
            })) || []
          };
        }
        break;

      case 'orders/create':
        // Order created - for Purchase
        if (shopifyEvent.total_price) {
          value = shopifyEvent.total_price / 100;
          currency = shopifyEvent.currency || 'USD';
          
          tiktokEvent = {
            event: 'Purchase',
            event_id: `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            pixel_id: process.env.TIKTOK_PIXEL_ID,
            value: value,
            currency: currency,
            contents: shopifyEvent.line_items?.map(item => ({
              content_id: item.product_id.toString(),
              quantity: item.quantity,
              price: (item.price / 100).toFixed(2)
            })) || []
          };
        }
        break;
    }

    // Send to TikTok if we have an event
    if (tiktokEvent) {
      console.log('Sending to TikTok:', tiktokEvent.event, 'Value:', value);
      
      // TikTok Conversion API endpoint
      const tiktokResponse = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': process.env.TIKTOK_ACCESS_TOKEN
        },
        body: JSON.stringify({
          pixel_code: process.env.TIKTOK_PIXEL_ID,
          event: tiktokEvent.event,
          event_id: tiktokEvent.event_id,
          timestamp: new Date().toISOString(),
          properties: {
            value: tiktokEvent.value,
            currency: tiktokEvent.currency,
            contents: tiktokEvent.contents
          },
          context: {
            ad: {
              callback: shopifyEvent.customer?.email || ''
            },
            user: {
              email: shopifyEvent.customer?.email ? hashEmail(shopifyEvent.customer.email) : undefined,
              phone: shopifyEvent.customer?.phone ? hashPhone(shopifyEvent.customer.phone) : undefined
            }
          }
        })
      });

      const result = await tiktokResponse.json();
      console.log('TikTok API Response:', result);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Helper functions for hashing (required by TikTok)
function hashEmail(email) {
  // Simple SHA256 hash - in production use crypto library
  return btoa(email).replace(/=+$/, '');
}

function hashPhone(phone) {
  return btoa(phone.replace(/\D/g, '')).replace(/=+$/, '');
}